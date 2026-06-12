const supabase = require("../configs/supabase");
const { classifyAndReply, generatePlan } = require("./qwen.service");
const { generateAudio } = require("./musicgen.service");
const { generateImages } = require("./diffusion.service");
const { renderVideo } = require("./video.service");
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

const MAX_AUDIO_DURATION = 30;

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

    const { error: metaError } = await supabase
        .from("job_metadata")
        .insert({ job_id: jobId });
    if (metaError) console.error("[Orchestrator] Erro ao criar job_metadata:", metaError.message);

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

    const { data: metaRows, error: metaErr } = await supabase
        .from("job_metadata")
        .select("creative_plan, storyboard, music_prompt, settings")
        .eq("job_id", jobId)
        .limit(1);
    if (metaErr) console.warn("[Orchestrator] Erro ao buscar metadata:", metaErr.message);
    const metadata = metaRows && metaRows.length > 0 ? metaRows[0] : null;

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
        if (job?.status === "PENDING") {
            await updateJobStatus(jobId, JOB_STATUS.FAILED, null, err.message);
        }
        return { intent: "error", reply };
    }

    const { intent, params, response_text } = classification;

    const shouldGenerate = ["plan", "audio", "images", "video", "regenerate_audio", "regenerate_images", "regenerate_video"].includes(intent);

    if (shouldGenerate) {
        const { data: reserved } = await supabase
            .from("jobs")
            .update({ status: JOB_STATUS.GENERATING_PLAN })
            .eq("id", jobId)
            .not("status", "in", `(${GENERATING_STATUSES.join(",")})`)
            .select("id");

        if (!reserved || reserved.length === 0) {
            const busyReply = "Ainda estou a tratar do pedido anterior — espera que termine antes de pedir outra geração.";
            await addMessage(conversationId, "assistant", busyReply, "chat");
            return { intent: "busy", reply: busyReply, params };
        }
    }

    await addMessage(conversationId, "assistant", response_text, intent, params);

    if (shouldGenerate) {
        const theme = (params?.theme || job?.theme || userMessage || "anime").trim();
        const style = params?.style || "anime cinematic emotional";
        const parsedDuration = parseInt(params?.duration, 10);
        const msgDuration = extractDurationFromMessage(userMessage);
        const duration = Math.min(MAX_AUDIO_DURATION, Math.max(5, parsedDuration || msgDuration || MAX_AUDIO_DURATION));

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
        } else if (intent === "video" || intent === "regenerate_video") {
            await runVideoOnly(jobId, conversationId);
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
    const effectivePrompt = (params.music_prompt || musicPrompt || "anime").trim();
    console.log(`[Orchestrator] A gerar áudio job=${jobId} duration=${durationSeconds}s prompt="${effectivePrompt}"`);
    const outputPath = await generateAudio(audioJobId, effectivePrompt, durationSeconds, jobId);
    const inferredGenre = params.genre || inferFromPrompt(effectivePrompt, "genre") || "—";
    const inferredMood = params.mood || inferFromPrompt(effectivePrompt, "mood") || "—";
    const inferredTempo = params.tempo || inferFromPrompt(effectivePrompt, "tempo") || "—";

    await upsertJobMetadata(jobId, {
        music_prompt: effectivePrompt,
        settings: {
            genre: inferredGenre,
            duration: `${durationSeconds}s`,
            mood: inferredMood,
            tempo: inferredTempo,
        },
    });

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

    const numScenes = Math.max(2, Math.round(durationSeconds / 2.5));
    const plan = await generatePlan(theme, style, numScenes, durationSeconds);
    if (!plan) throw new Error("O worker não devolveu um plano criativo.");

    await upsertJobMetadata(jobId, {
        creative_plan: plan,
        music_prompt: plan.music_prompt || theme,
        settings: plan.settings || {},
        storyboard: null,
    });

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

async function runVideoOnly(jobId, conversationId) {
    const { data: metaRowsV } = await supabase
        .from("job_metadata")
        .select("creative_plan, storyboard")
        .eq("job_id", jobId)
        .limit(1);
    const metadata = metaRowsV && metaRowsV.length > 0 ? metaRowsV[0] : null;

    const { data: job } = await supabase
        .from("jobs")
        .select("output_path")
        .eq("id", jobId)
        .single();

    if (!metadata?.storyboard?.length) {
        const msg = "Ainda não tens imagens geradas. Gera primeiro as imagens antes de criar o vídeo.";
        await addMessage(conversationId, "assistant", msg, "chat");
        await updateJobStatus(jobId, JOB_STATUS.COMPLETED);
        return;
    }
    if (!job?.output_path) {
        const msg = "Ainda não tens música gerada. Gera primeiro a música antes de criar o vídeo.";
        await addMessage(conversationId, "assistant", msg, "chat");
        await updateJobStatus(jobId, JOB_STATUS.COMPLETED);
        return;
    }

    await updateJobStatus(jobId, JOB_STATUS.RENDERING, JOB_STEP.RENDER);
    await logJob(jobId, JOB_STATUS.RENDERING, "A renderizar o vídeo...");
    await addMessage(conversationId, "assistant", "A montar o vídeo com a música e as imagens...", "rendering");

    const videoRelPath = await renderVideo(
        metadata.storyboard,
        job.output_path,
        metadata.creative_plan,
        jobId
    );

    await upsertJobMetadata(jobId, { video_path: videoRelPath });

    await supabase.from("jobs").update({
        status: JOB_STATUS.COMPLETED,
        current_step: JOB_STEP.RENDER,
        completed_at: new Date().toISOString(),
    }).eq("id", jobId);

    await logJob(jobId, JOB_STATUS.COMPLETED, "Vídeo renderizado.");
    await addMessage(
        conversationId,
        "assistant",
        "O teu AMV está pronto! Podes ver o vídeo na aba Video.",
        "done"
    );
}

async function runImagesOnly(jobId, conversationId) {
    const { data: metaRowsI } = await supabase
        .from("job_metadata")
        .select("creative_plan")
        .eq("job_id", jobId)
        .limit(1);
    const metadata = metaRowsI && metaRowsI.length > 0 ? metaRowsI[0] : null;

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
        await upsertJobMetadata(jobId, { storyboard: sceneImages });
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

    const numScenes = Math.max(2, Math.round(durationSeconds / 2.5));
    const plan = await generatePlan(theme, style, numScenes, durationSeconds);
    if (!plan) throw new Error("O worker não devolveu um plano criativo.");

    const musicPrompt = plan.music_prompt || theme;
    const imagePrompts = (plan.storyboard || []).map((s) => s.image_prompt).filter(Boolean);

    await upsertJobMetadata(jobId, {
        creative_plan: plan,
        music_prompt: musicPrompt,
        settings: plan.settings || {},
    });
    await supabase.from("jobs").update({ theme }).eq("id", jobId);

    await updateJobStatus(jobId, JOB_STATUS.GENERATING_AUDIO, JOB_STEP.AUDIO);
    await logJob(jobId, JOB_STATUS.GENERATING_AUDIO, "A gerar áudio...");
    await addMessage(conversationId, "assistant", "A gerar a música...", "generating_audio");

    const audioJobId = `audio_${jobId.replace(/-/g, "_")}`;
    console.log(`[Orchestrator] A gerar áudio job=${jobId} duration=${durationSeconds}s prompt="${musicPrompt}"`);
    const outputPath = await generateAudio(audioJobId, musicPrompt, durationSeconds, jobId);

    let sceneImages = [];
    if (imagePrompts.length > 0) {
        await updateJobStatus(jobId, JOB_STATUS.GENERATING_IMAGES, JOB_STEP.IMAGES);
        await logJob(jobId, JOB_STATUS.GENERATING_IMAGES, "A gerar imagens...");
        await addMessage(conversationId, "assistant", "A gerar as imagens das cenas...", "generating_images");

        const imageJobId = `img_${jobId.replace(/-/g, "_")}`;
        try {
            sceneImages = await generateImages(imageJobId, imagePrompts, jobId);
            if (sceneImages.length > 0) {
                await upsertJobMetadata(jobId, { storyboard: sceneImages });
            }
        } catch (err) {
            console.error("[Orchestrator] Erro nas imagens:", err.message);
        }
    }

    let videoRelPath = null;
    if (sceneImages.length > 0) {
        await updateJobStatus(jobId, JOB_STATUS.RENDERING, JOB_STEP.RENDER);
        await logJob(jobId, JOB_STATUS.RENDERING, "A renderizar o vídeo...");
        await addMessage(conversationId, "assistant", "A montar o vídeo com a música e as imagens...", "rendering");

        try {
            videoRelPath = await renderVideo(sceneImages, outputPath, plan, jobId);
            await upsertJobMetadata(jobId, { video_path: videoRelPath });
        } catch (err) {
            console.error("[Orchestrator] Erro na renderização do vídeo:", err.message);
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
        videoRelPath
            ? "O teu AMV está pronto! Podes ouvir a música, ver as cenas e o vídeo final."
            : "O teu AMV está pronto! Podes ouvir a música e ver as cenas geradas.",
        "done", { output_path: outputPath }
    );
}

function extractDurationFromMessage(message) {
    const match = message.match(/(\d+)\s*s(?:eg(?:undos?)?|econds?)?/i);
    return match ? parseInt(match[1], 10) : null;
}

async function upsertJobMetadata(jobId, fields) {
    const { error } = await supabase
        .from("job_metadata")
        .update(fields)
        .eq("job_id", jobId);
    if (error) console.error("[Orchestrator] Erro ao actualizar job_metadata:", error.message);
}

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