const supabase = require("../configs/supabase");
const { classifyAndReply, generatePlan } = require("./qwen.service");
const { generateAudio } = require("./musicgen.service");
const { generateImages } = require("./diffusion.service");
const { v4: uuidv4 } = require("uuid");

// ── Enums do Supabase ─────────────────────────────────────────────────────────
const JOB_STATUS = {
    PENDING:           "PENDING",
    GENERATING_PLAN:   "GENERATING_PLAN",
    GENERATING_AUDIO:  "GENERATING_AUDIO",
    GENERATING_IMAGES: "GENERATING_IMAGES",
    RENDERING:         "RENDERING",
    COMPLETED:         "COMPLETED",
    FAILED:            "FAILED",
};

const JOB_STEP = {
    PLAN:   "PLAN",
    AUDIO:  "AUDIO",
    IMAGES: "IMAGES",
    RENDER: "RENDER",
};

/**
 * Cria uma nova conversa + job no Supabase.
 */
async function createJob(userId, initialTheme = "") {
    const jobId = uuidv4();

    const { error: jobError } = await supabase.from("jobs").insert({
        id:      jobId,
        user_id: userId,
        status:  JOB_STATUS.PENDING,
        theme:   initialTheme,
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

/**
 * Processa uma mensagem do utilizador.
 */
async function handleMessage(jobId, conversationId, userMessage) {
    await addMessage(conversationId, "user", userMessage);

    const { data: job } = await supabase
        .from("jobs")
        .select("id, status, current_step, theme, output_path")
        .eq("id", jobId)
        .single();

    const { data: metadata } = await supabase
        .from("job_metadata")
        .select("creative_plan, storyboard, music_prompt, settings")
        .eq("job_id", jobId)
        .single();

    // Histórico recente da conversa para dar contexto à AI (últimas 10 mensagens)
    const { data: recentMessages } = await supabase
        .from("messages")
        .select("role, content, action")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(10);
    const conversationHistory = (recentMessages || []).reverse();

    let classification;
    try {
        classification = await classifyAndReply(userMessage, job || {}, metadata || {}, conversationHistory);
    } catch (err) {
        console.error("[Orchestrator] Erro no classify-intent:", err.message);
        const reply = "Ocorreu um erro ao processar a tua mensagem. Tenta novamente.";
        await addMessage(conversationId, "assistant", reply, "chat");
        return { intent: "error", reply };
    }

    const { intent, params, response_text } = classification;
    await addMessage(conversationId, "assistant", response_text, intent, params);

    const shouldGenerate = ["plan", "audio", "video", "regenerate_audio", "regenerate_images"].includes(intent);
    if (shouldGenerate) {
        const theme    = (params?.theme || job?.theme || userMessage || "anime").trim();
        const style    = params?.style    || "anime cinematic emotional";
        const duration = Math.max(5, parseInt(params?.duration, 10) || 60);

        setImmediate(() => {
            runGeneration(jobId, conversationId, intent, theme, style, duration, params).catch((err) => {
                console.error(`[Orchestrator] Erro na geração do job ${jobId}:`, err.message);
                updateJobStatus(jobId, JOB_STATUS.FAILED, null, err.message);
            });
        });
    }

    return { intent, reply: response_text, params };
}

/**
 * Despacha para o pipeline correto consoante o intent.
 */
async function runGeneration(jobId, conversationId, intent, theme, style, durationSeconds, params = {}) {
    try {
        if (intent === "audio" || intent === "regenerate_audio") {
            await runAudioOnly(jobId, conversationId, theme, durationSeconds, style, params);
        } else if (intent === "plan") {
            await runPlanOnly(jobId, conversationId, theme, style, durationSeconds);
        } else {
            // "video" | "regenerate_images" | fallback → pipeline completo
            await runFullPipeline(jobId, conversationId, theme, style, durationSeconds);
        }
    } catch (err) {
        await updateJobStatus(jobId, JOB_STATUS.FAILED, null, err.message);
        await logJob(jobId, JOB_STATUS.FAILED, err.message);
        await addMessage(conversationId, "assistant", `❌ Ocorreu um erro: ${err.message}`, "error");
        throw err;
    }
}

/**
 * Só áudio — usa o tema directamente como music_prompt, sem gerar plano.
 */
async function runAudioOnly(jobId, conversationId, musicPrompt, durationSeconds, style = "", params = {}) {
    await updateJobStatus(jobId, JOB_STATUS.GENERATING_AUDIO, JOB_STEP.AUDIO);
    await logJob(jobId, JOB_STATUS.GENERATING_AUDIO, "A gerar áudio...");
    await addMessage(conversationId, "assistant", "🎵 A gerar a música...", "generating_audio");

    const audioJobId = `audio_${jobId.replace(/-/g, "_")}`;
    const outputPath = await generateAudio(audioJobId, musicPrompt, durationSeconds, jobId);

    // Guardar metadata básica para os cards do frontend
    const genre = params.genre || params.style || style || musicPrompt.split(/[\s,]+/)[0] || "—";
    await supabase.from("job_metadata").upsert({
        job_id:       jobId,
        music_prompt: musicPrompt,
        settings: {
            genre:    genre,
            duration: `${durationSeconds}s`,
            mood:     params.mood  || style || "—",
            tempo:    params.tempo || "—",
        },
    });

    await logJob(jobId, JOB_STATUS.COMPLETED, "Áudio gerado.");
    await addMessage(
        conversationId, "assistant",
        "🎉 A tua música está pronta!",
        "done", { output_path: outputPath }
    );

    await supabase.from("jobs").update({
        status:       JOB_STATUS.COMPLETED,
        current_step: JOB_STEP.AUDIO,
        output_path:  outputPath,
        completed_at: new Date().toISOString(),
    }).eq("id", jobId);
}

/**
 * Só plano criativo — sem gerar áudio nem imagens.
 */
async function runPlanOnly(jobId, conversationId, theme, style, durationSeconds) {
    await updateJobStatus(jobId, JOB_STATUS.GENERATING_PLAN, JOB_STEP.PLAN);
    await logJob(jobId, JOB_STATUS.GENERATING_PLAN, "A gerar plano criativo...");
    await addMessage(conversationId, "assistant", "✨ A criar o plano criativo para o teu AMV...", "planning");

    const plan = await generatePlan(theme, style, 12, durationSeconds);
    if (!plan) throw new Error("O worker não devolveu um plano criativo.");

    await supabase.from("job_metadata").upsert({
        job_id:        jobId,
        creative_plan: plan,
        music_prompt:  plan.music_prompt || theme,
        settings:      plan.settings || {},
    });

    await supabase.from("jobs").update({
        theme,
        status:       JOB_STATUS.COMPLETED,
        current_step: JOB_STEP.PLAN,
        completed_at: new Date().toISOString(),
    }).eq("id", jobId);

    await logJob(jobId, JOB_STATUS.COMPLETED, "Plano criativo gerado.");
    await addMessage(
        conversationId, "assistant",
        "✅ Plano criativo pronto! Diz-me quando quiseres gerar a música ou as imagens.",
        "done"
    );
}

/**
 * Pipeline completo: plan → áudio → imagens.
 */
async function runFullPipeline(jobId, conversationId, theme, style, durationSeconds) {
    // ── 1. Plano criativo
    await updateJobStatus(jobId, JOB_STATUS.GENERATING_PLAN, JOB_STEP.PLAN);
    await logJob(jobId, JOB_STATUS.GENERATING_PLAN, "A gerar plano criativo...");
    await addMessage(conversationId, "assistant", "✨ A criar o plano criativo para o teu AMV...", "planning");

    const plan = await generatePlan(theme, style, 12, durationSeconds);
    if (!plan) throw new Error("O worker não devolveu um plano criativo.");

    const musicPrompt  = plan.music_prompt || theme;
    const imagePrompts = (plan.storyboard || []).map((s) => s.image_prompt).filter(Boolean);

    await supabase.from("job_metadata").upsert({
        job_id:        jobId,
        creative_plan: plan,
        music_prompt:  musicPrompt,
        settings:      plan.settings || {},
    });
    await supabase.from("jobs").update({ theme }).eq("id", jobId);

    // ── 2. Áudio
    await updateJobStatus(jobId, JOB_STATUS.GENERATING_AUDIO, JOB_STEP.AUDIO);
    await logJob(jobId, JOB_STATUS.GENERATING_AUDIO, "A gerar áudio...");
    await addMessage(conversationId, "assistant", "🎵 A gerar a música...", "generating_audio");

    const audioJobId = `audio_${jobId.replace(/-/g, "_")}`;
    let outputPath = null;
    try {
        outputPath = await generateAudio(audioJobId, musicPrompt, durationSeconds, jobId);
    } catch (err) {
        console.error("[Orchestrator] Erro no áudio:", err.message);
    }

    // ── 3. Imagens
    if (imagePrompts.length > 0) {
        await updateJobStatus(jobId, JOB_STATUS.GENERATING_IMAGES, JOB_STEP.IMAGES);
        await logJob(jobId, JOB_STATUS.GENERATING_IMAGES, "A gerar imagens...");
        await addMessage(conversationId, "assistant", "🎨 A gerar as imagens das cenas...", "generating_images");

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

    // ── 4. Concluído
    await supabase.from("jobs").update({
        status:       JOB_STATUS.COMPLETED,
        current_step: JOB_STEP.RENDER,
        output_path:  outputPath,
        completed_at: new Date().toISOString(),
    }).eq("id", jobId);

    await logJob(jobId, JOB_STATUS.COMPLETED, "Geração concluída.");
    await addMessage(
        conversationId, "assistant",
        "🎉 O teu AMV está pronto! Podes ouvir a música e ver as cenas geradas.",
        "done", { output_path: outputPath }
    );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function addMessage(conversationId, role, content, action = "chat", actionPayload = null) {
    await supabase.from("messages").insert({
        conversation_id: conversationId,
        role,
        content,
        action,
        action_payload: actionPayload,
    });
}

async function updateJobStatus(jobId, status, currentStep = null, errorMessage = null) {
    const update = { status };
    if (currentStep)  update.current_step  = currentStep;
    if (errorMessage) update.error_message = errorMessage;
    await supabase.from("jobs").update(update).eq("id", jobId);
}

async function logJob(jobId, status, message) {
    await supabase.from("job_logs").insert({ job_id: jobId, status, message });
}

module.exports = { createJob, handleMessage };