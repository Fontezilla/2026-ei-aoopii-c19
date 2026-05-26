const axios = require("axios");

const WORKER1_URL = process.env.WORKER1_URL;
const WORKER1_KEY = process.env.WORKER1_KEY || "";

const headers = () => ({
    "Content-Type": "application/json",
    ...(WORKER1_KEY ? { "X-Worker-Key": WORKER1_KEY } : {}),
});

const ASSISTANT_PERSONA =
    "És o assistente criativo do ARMONYX, um gerador de AMVs anime. " +
    "Respondes sempre em português de Portugal, de forma criativa e entusiasta. " +
    "Ajudas o utilizador a criar música e imagens para o seu AMV. " +
    "Quando o utilizador descreve um tema ou mood, interpretas criativamente e sugeres direcções. " +
    "Quando a geração começa, mantens o utilizador informado do progresso de forma envolvente.";

/**
 * Constrói o contexto a passar ao /classify-intent a partir do estado do job.
 */
function buildContext(job = {}, metadata = {}) {
    return {
        assistant_persona: ASSISTANT_PERSONA,
        title:             job.theme || null,
        has_plan:          !!metadata.creative_plan,
        has_audio:         job.status === "done" || !!job.output_path,
        has_images:        !!(metadata.storyboard && metadata.storyboard.length > 0),
        has_video:         false,
        generation_phase:  job.status === "running" ? job.current_step || "generating" : "idle",
        conversation_summary: job.theme
            ? `O utilizador está a criar um AMV com o tema: "${job.theme}"`
            : null,
    };
}

/**
 * Classifica a intenção de uma mensagem e devolve resposta do assistente.
 * Retorna: { intent, params, response_text }
 */
async function classifyAndReply(userMessage, job = {}, metadata = {}) {
    const context = buildContext(job, metadata);

    const r = await axios.post(
        `${WORKER1_URL}/classify-intent`,
        { message: userMessage, context },
        { headers: headers(), timeout: 30000 }
    );

    const result = r.data;
    result.intent        = result.intent        || "chat";
    result.params        = result.params        || {};
    result.response_text = result.response_text || "Como posso ajudar?";

    return result;
}

/**
 * Gera um plano criativo completo (music_prompt, storyboard, etc.)
 * Retorna o plano quando o job do worker estiver done.
 */
async function generatePlan(theme, style = "anime cinematic emotional", numScenes = 12, musicDuration = 60) {
    const jobId = `plan_${Date.now()}`;

    const r = await axios.post(
        `${WORKER1_URL}/generate-plan`,
        {
            job_id:         jobId,
            theme:          theme && theme.length >= 3 ? theme : `AMV ${theme || "anime"}`,
            style,
            num_scenes:     Math.round(Number(numScenes))    || 12,
            music_duration: Math.round(Number(musicDuration)) || 60,
        },
        { headers: headers(), timeout: 30000 }
    );

    // Polling até done
    const result = await pollJob(WORKER1_URL, r.data.job_id || jobId);
    return result?.creative_plan || null;
}

/**
 * Polling genérico ao /status/:job_id do worker.
 */
async function pollJob(baseUrl, jobId, timeoutMs = 300000) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        await sleep(3000);
        const r = await axios.get(
            `${baseUrl}/status/${jobId}`,
            { headers: headers(), timeout: 10000 }
        );
        const { status, error } = r.data;
        if (status === "done")   return r.data.result || r.data;
        if (status === "error")  throw new Error(error || "Erro no worker");
    }

    throw new Error("Timeout a aguardar o Qwen");
}

function sleep(ms) {
    return new Promise((res) => setTimeout(res, ms));
}

module.exports = { classifyAndReply, generatePlan };