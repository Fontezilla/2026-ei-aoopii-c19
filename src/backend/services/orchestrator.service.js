const supabase = require("../configs/supabase");
const { classifyAndReply, generatePlan } = require("./qwen.service");
const { generateAudio } = require("./musicgen.service");
const { generateImages } = require("./diffusion.service");
const { v4: uuidv4 } = require("uuid");

const JOB_STATUS = {
    PENDING: "PENDING",
    GENERATING_PLAN: "GENERATING_PLAN",
    GENERATING_AUDIO: "GENERATING_AUDIO",
    GENERATING_IMAGES: "GENERATING_IMAGES",
    RENDERING: "RENDERING",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
};

const JOB_STEP = {
    PLAN: "PLAN",
    AUDIO: "AUDIO",
    IMAGES: "IMAGES",
    RENDER: "RENDER",
};

// Limite de duração do áudio. Acima de ~40s (≈2000 tokens autoregressivos a
// 50Hz), o MusicGen entra em território de extrapolação (treinado em clips de
// ~30s) e o cuBLAS falha com "device-side assert triggered" de forma
// reprodutível — confirmado por bisseção controlada (40s ok, 50s crasha sempre
// ao mesmo ponto). Aplicamos este teto tanto ao valor do utilizador como ao
// fallback, para nunca cair na zona instável.
const MAX_AUDIO_DURATION = 30;

// Estados em que já existe uma geração a decorrer — usados pela guarda de
// concorrência para impedir disparar uma segunda geração no mesmo job.
const GENERATING_STATUSES = [
    JOB_STATUS.GENERATING_PLAN,
    JOB_STATUS.GENERATING_AUDIO,
    JOB_STATUS.GENERATING_IMAGES,
    JOB_STATUS.RENDERING,
];

async function createJob(userId, initialTheme = "") {
    const jobId = uuidv4();

    const { error: jobError } = await supabase.from("jobs").insert({
        id: jobId,
        user_id: userId,
        status: JOB_STATUS.PENDING,
        theme: initialTheme,
    });
    if (jobError) throw new Error(jobError.message);

    const { data: conv, error: convError } = await supabase
        .from("conversations")
        .upsert({ job_id: jobId }, { onConflict: "job_id" })
        .select()
        .single();
    if (convError) throw new Error(convError.message);

    return { jobId, conversationId: conv.id };
}

async function handleMessage(jobId, conversationId, userMessage) {
    await addMessage(conversationId, "user", userMessage);

    const { data: job, error: jobErr } = await supabase
        .from("jobs")
        .select("id, status, current_step, theme, output_path")
        .eq("id", jobId)
        .single();
    if (jobErr && jobErr.code !== "PGRST116")
        console.warn("[Orchestrator] Erro ao buscar job:", jobErr.message);

    const { data: metadata, error: metaErr } = await supabase
        .from("job_metadata")
        .select("creative_plan, storyboard, music_prompt, settings")
        .eq("job_id", jobId)
        .single();
    if (metaErr && metaErr.code !== "PGRST116")
        console.warn("[Orchestrator] Erro ao buscar metadata:", metaErr.message);

    // Janela de histórico enviada ao classify-intent. As mensagens de progresso
    // são filtradas adiante (buildContext), por isso o número efetivo é menor.
    const { data: recentMessages } = await supabase
        .from("messages")
        .select("role, content, action")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(25);
    const conversationHistory = (recentMessages || []).reverse();

    let classification;
    try {
        classification = await classifyAndReply(userMessage, job || {}, metadata || {}, conversationHistory);
    } catch (err) {
        console.error("[Orchestrator] Erro no classify-intent:", err.message);
        const reply = "Ocorreu um erro ao processar a tua mensagem. Tenta novamente.";
        await addMessage(conversationId, "assistant", reply, "error");
        // Garantir que o job não fica preso em PENDING quando o classify falha
        if (job?.status === "PENDING") {
            await updateJobStatus(jobId, JOB_STATUS.FAILED, null, err.message);
        }
        return { intent: "error", reply };
    }

    const { intent, params, response_text } = classification;

    const shouldGenerate = ["plan", "audio", "images", "video", "regenerate_audio", "regenerate_images"].includes(intent);

    // Guarda de concorrência: tentar "reservar" o job de forma atómica antes de
    // disparar uma geração. O update só afeta linhas que NÃO estejam já num
    // estado de geração, por isso dois pedidos simultâneos não arrancam duas
    // gerações no mesmo job (evita OOM no worker e corrupção do mesmo audio.wav).
    if (shouldGenerate) {
        const { data: reserved } = await supabase
            .from("jobs")
            .update({ status: JOB_STATUS.GENERATING_PLAN })
            .eq("id", jobId)
            .not("status", "in", `(${GENERATING_STATUSES.join(",")})`)
            .select("id");

        if (!reserved || reserved.length === 0) {
            const busyReply = "Ainda estou a tratar do pedido anterior — espera que termine antes de pedir outra geração. 🎶";
            await addMessage(conversationId, "assistant", busyReply, "chat");
            return { intent: "busy", reply: busyReply, params };
        }
    }

    await addMessage(conversationId, "assistant", response_text, intent, params);

    if (shouldGenerate) {
        const theme = (params?.theme || job?.theme || userMessage || "anime").trim();
        const style = params?.style || "anime cinematic emotional";
        const duration = Math.min(MAX_AUDIO_DURATION, Math.max(5, parseInt(params?.duration, 10) || MAX_AUDIO_DURATION));

        setImmediate(() => {
            runGeneration(jobId, conversationId, intent, theme, style, duration, params).catch((err) => {
                console.error(`[Orchestrator] Erro na geração do job ${jobId}:`, err.message);
                updateJobStatus(jobId, JOB_STATUS.FAILED, null, err.message);
            });
        });
    }

    return { intent, reply: response_text, params };
}

async function runGeneration(jobId, conversationId, intent, theme, style, durationSeconds, params = {}) {
    try {
        if (intent === "audio" || intent === "regenerate_audio") {
            await runAudioOnly(jobId, conversationId, theme, durationSeconds, style, params);
        } else if (intent === "plan") {
            await runPlanOnly(jobId, conversationId, theme, style, durationSeconds);
        } else if (intent === "images" || intent === "regenerate_images") {
            await runImagesOnly(jobId, conversationId);
        } else {
            await runFullPipeline(jobId, conversationId, theme, style, durationSeconds);
        }
    } catch (err) {
        await updateJobStatus(jobId, JOB_STATUS.FAILED, null, err.message);
        await logJob(jobId, JOB_STATUS.FAILED, err.message);
        await addMessage(conversationId, "assistant", `Ocorreu um erro: ${err.message}`, "error");
        throw err;
    }
}

async function runAudioOnly(jobId, conversationId, musicPrompt, durationSeconds, style = "", params = {}) {
    await updateJobStatus(jobId, JOB_STATUS.GENERATING_AUDIO, JOB_STEP.AUDIO);
    await logJob(jobId, JOB_STATUS.GENERATING_AUDIO, "A gerar áudio...");
    await addMessage(conversationId, "assistant", "A gerar a música...", "generating_audio");

    const audioJobId = `audio_${jobId.replace(/-/g, "_")}`;
    // O MusicGen é treinado com descrições em inglês. O Qwen já devolve um
    // music_prompt em inglês em params.music_prompt (PT-PT fica no response_text
    // para o utilizador); usar esse e só cair no theme se faltar.
    const effectivePrompt = (params.music_prompt || musicPrompt || "anime").trim();
    console.log(`[Orchestrator] A gerar áudio job=${jobId} duration=${durationSeconds}s prompt="${effectivePrompt}"`);
    const outputPath = await generateAudio(audioJobId, effectivePrompt, durationSeconds, jobId);

    // Guardar metadata para os cards do frontend.
    // Tentar inferir genre/mood do music_prompt quando o Qwen não os devolve explicitamente.
    const inferredGenre = params.genre || inferFromPrompt(effectivePrompt, "genre") || "—";
    const inferredMood = params.mood || inferFromPrompt(effectivePrompt, "mood") || "—";
    const inferredTempo = params.tempo || inferFromPrompt(effectivePrompt, "tempo") || "—";

    await supabase.from("job_metadata").upsert({
        job_id: jobId,
        music_prompt: effectivePrompt,
        settings: {
            genre:    inferredGenre,
            duration: `${durationSeconds}s`,
            mood:     inferredMood,
            tempo:    inferredTempo,
        },
    }, { onConflict: 'job_id' });

    await logJob(jobId, JOB_STATUS.COMPLETED, "Áudio gerado.");
    await addMessage(
        conversationId, "assistant",
        "🎉 A tua música está pronta!",
        "done", { output_path: outputPath }
    );

    await supabase.from("jobs").update({
        status: JOB_STATUS.COMPLETED,
        current_step: JOB_STEP.AUDIO,
        output_path: outputPath,
        completed_at: new Date().toISOString(),
    }).eq("id", jobId);
}

async function runPlanOnly(jobId, conversationId, theme, style, durationSeconds) {
    await updateJobStatus(jobId, JOB_STATUS.GENERATING_PLAN, JOB_STEP.PLAN);
    await logJob(jobId, JOB_STATUS.GENERATING_PLAN, "A gerar plano criativo...");
    await addMessage(conversationId, "assistant", "A criar o plano criativo para o teu AMV...", "planning");

    const plan = await generatePlan(theme, style, 12, durationSeconds);
    if (!plan) throw new Error("O worker não devolveu um plano criativo.");

    await supabase.from("job_metadata").upsert({
        job_id: jobId,
        creative_plan: plan,
        music_prompt: plan.music_prompt || theme,
        settings: plan.settings || {},
        storyboard: null,
    }, { onConflict: 'job_id' });

    await supabase.from("jobs").update({
        theme,
        status: JOB_STATUS.COMPLETED,
        current_step: JOB_STEP.PLAN,
        completed_at: new Date().toISOString(),
    }).eq("id", jobId);

    await logJob(jobId, JOB_STATUS.COMPLETED, "Plano criativo gerado.");
    await addMessage(
        conversationId, "assistant",
        "Plano criativo pronto! Diz-me quando quiseres gerar a música ou as imagens.",
        "done"
    );
}

async function runImagesOnly(jobId, conversationId) {
    const { data: metadata } = await supabase
        .from("job_metadata")
        .select("creative_plan")
        .eq("job_id", jobId)
        .single();

    const imagePrompts = (metadata?.creative_plan?.storyboard || [])
        .map((s) => s.image_prompt)
        .filter(Boolean);

    if (imagePrompts.length === 0) {
        throw new Error("Sem plano criativo — gera primeiro o plano antes de pedir as imagens.");
    }

    await updateJobStatus(jobId, JOB_STATUS.GENERATING_IMAGES, JOB_STEP.IMAGES);
    await logJob(jobId, JOB_STATUS.GENERATING_IMAGES, "A gerar imagens...");
    await addMessage(conversationId, "assistant", "A gerar as imagens das cenas...", "generating_images");

    const imageJobId = `img_${jobId.replace(/-/g, "_")}`;
    const sceneImages = await generateImages(imageJobId, imagePrompts, jobId);

    if (sceneImages.length > 0) {
        await supabase.from("job_metadata").update({ storyboard: sceneImages }).eq("job_id", jobId);
    }

    await supabase.from("jobs").update({
        status: JOB_STATUS.COMPLETED,
        current_step: JOB_STEP.IMAGES,
        completed_at: new Date().toISOString(),
    }).eq("id", jobId);

    await logJob(jobId, JOB_STATUS.COMPLETED, "Imagens geradas.");
    await addMessage(
        conversationId, "assistant",
        "As imagens das cenas estão prontas! Podes ver o storyboard na aba Images.",
        "done"
    );
}

async function runFullPipeline(jobId, conversationId, theme, style, durationSeconds) {
    await updateJobStatus(jobId, JOB_STATUS.GENERATING_PLAN, JOB_STEP.PLAN);
    await logJob(jobId, JOB_STATUS.GENERATING_PLAN, "A gerar plano criativo...");
    await addMessage(conversationId, "assistant", "A criar o plano criativo para o teu AMV...", "planning");

    const plan = await generatePlan(theme, style, 12, durationSeconds);
    if (!plan) throw new Error("O worker não devolveu um plano criativo.");

    const musicPrompt = plan.music_prompt || theme;
    const imagePrompts = (plan.storyboard || []).map((s) => s.image_prompt).filter(Boolean);

    await supabase.from("job_metadata").upsert({
        job_id: jobId,
        creative_plan: plan,
        music_prompt: musicPrompt,
        settings: plan.settings || {},
    }, { onConflict: 'job_id' });
    await supabase.from("jobs").update({ theme }).eq("id", jobId);

    await updateJobStatus(jobId, JOB_STATUS.GENERATING_AUDIO, JOB_STEP.AUDIO);
    await logJob(jobId, JOB_STATUS.GENERATING_AUDIO, "A gerar áudio...");
    await addMessage(conversationId, "assistant", "A gerar a música...", "generating_audio");

    const audioJobId = `audio_${jobId.replace(/-/g, "_")}`;
    // O áudio é obrigatório para o AMV: se falhar, propagar o erro para que o
    // job fique FAILED (em vez de terminar COMPLETED com output_path null).
    // As imagens (abaixo) continuam opcionais e o seu erro é tolerado.
    console.log(`[Orchestrator] A gerar áudio job=${jobId} duration=${durationSeconds}s prompt="${musicPrompt}"`);
    const outputPath = await generateAudio(audioJobId, musicPrompt, durationSeconds, jobId);

    if (imagePrompts.length > 0) {
        await updateJobStatus(jobId, JOB_STATUS.GENERATING_IMAGES, JOB_STEP.IMAGES);
        await logJob(jobId, JOB_STATUS.GENERATING_IMAGES, "A gerar imagens...");
        await addMessage(conversationId, "assistant", "A gerar as imagens das cenas...", "generating_images");

        const imageJobId = `img_${jobId.replace(/-/g, "_")}`;
        try {
            const sceneImages = await generateImages(imageJobId, imagePrompts, jobId);
            if (sceneImages.length > 0) {
                await supabase.from("job_metadata").update({ storyboard: sceneImages }).eq("job_id", jobId);
            }
        } catch (err) {
            console.error("[Orchestrator] Erro nas imagens:", err.message);
        }
    }

    await supabase.from("jobs").update({
        status: JOB_STATUS.COMPLETED,
        current_step: JOB_STEP.RENDER,
        output_path: outputPath,
        completed_at: new Date().toISOString(),
    }).eq("id", jobId);

    await logJob(jobId, JOB_STATUS.COMPLETED, "Geração concluída.");
    await addMessage(
        conversationId, "assistant",
        "O teu AMV está pronto! Podes ouvir a música e ver as cenas geradas.",
        "done", { output_path: outputPath }
    );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Tenta inferir genre, mood ou tempo a partir do music_prompt quando o Qwen
 * não os devolve como params explícitos.
 */
function inferFromPrompt(prompt = "", field) {
    const p = prompt.toLowerCase();

    if (field === "genre") {
        const genres = [
            ["reggaeton", "Reggaeton"], ["hip hop", "Hip Hop"], ["hip-hop", "Hip Hop"],
            ["trap", "Trap"], ["edm", "EDM"], ["electronic", "Electronic"],
            ["orchestral", "Orchestral"], ["classical", "Classical"],
            ["jazz", "Jazz"], ["rock", "Rock"], ["metal", "Metal"],
            ["pop", "Pop"], ["lofi", "Lo-Fi"], ["lo-fi", "Lo-Fi"],
            ["ambient", "Ambient"], ["cinematic", "Cinematic"],
            ["anime", "Anime OST"], ["epic", "Epic"],
            ["r&b", "R&B"], ["soul", "Soul"], ["funk", "Funk"],
            ["samba", "Samba"], ["bossa nova", "Bossa Nova"],
        ];
        for (const [keyword, label] of genres) {
            if (p.includes(keyword)) return label;
        }
    }

    if (field === "mood") {
        const moods = [
            ["melanchol", "Melancholic"], ["sad", "Melancholic"], ["dark", "Dark"],
            ["epic", "Epic"], ["intense", "Intense"], ["energetic", "Energetic"],
            ["happy", "Happy"], ["upbeat", "Upbeat"], ["calm", "Calm"],
            ["peaceful", "Peaceful"], ["aggressive", "Aggressive"],
            ["triumphant", "Triumphant"], ["romantic", "Romantic"],
            ["emotional", "Emotional"], ["powerful", "Powerful"],
            ["chill", "Chill"], ["relaxing", "Relaxing"],
        ];
        for (const [keyword, label] of moods) {
            if (p.includes(keyword)) return label;
        }
    }

    if (field === "tempo") {
        const match = p.match(/(\d{2,3})\s*bpm/);
        if (match) return `${match[1]} BPM`;
        if (p.includes("fast") || p.includes("rapid") || p.includes("quick")) return "Fast";
        if (p.includes("slow") || p.includes("soft")) return "Slow";
        if (p.includes("medium") || p.includes("moderate")) return "Medium";
    }

    return null;
}

async function addMessage(conversationId, role, content, action = "chat", actionPayload = null) {
    const { error } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        role,
        content,
        action,
        action_payload: actionPayload,
    });
    if (error) console.error("[Orchestrator] Erro ao guardar mensagem:", error.message);
}

async function updateJobStatus(jobId, status, currentStep = null, errorMessage = null) {
    const update = { status };
    if (currentStep) update.current_step = currentStep;
    if (errorMessage) update.error_message = errorMessage;
    await supabase.from("jobs").update(update).eq("id", jobId);
}

async function logJob(jobId, status, message) {
    await supabase.from("job_logs").insert({ job_id: jobId, status, message });
}

module.exports = { createJob, handleMessage };