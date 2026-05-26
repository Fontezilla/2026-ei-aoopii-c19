const axios = require("axios");

const WORKER2_URL = process.env.WORKER2_URL;
const WORKER2_KEY = process.env.WORKER2_KEY || "";

const headers = () => ({
    "Content-Type": "application/json",
    ...(WORKER2_URL && WORKER2_KEY ? { "X-Worker-Key": WORKER2_KEY } : {}),
});

/**
 * Gera imagens de cenas a partir de prompts.
 * imagePrompts: array de strings, uma por cena.
 * Retorna array de { scene_index, image_base64 }
 */
async function generateImages(jobId, imagePrompts) {
    if (!WORKER2_URL) {
        console.warn("[Diffusion] WORKER2_URL não configurado — a saltar geração de imagens");
        return [];
    }

    // Arrancar geração
    await axios.post(
        `${WORKER2_URL}/generate-images`,
        {
            job_id: jobId,
            scenes: imagePrompts.map((prompt, i) => ({
                scene_index: i + 1,
                prompt,
            })),
        },
        { headers: headers(), timeout: 30000 }
    );

    // Polling até done
    await pollUntilDone(jobId);

    // Buscar imagens em base64
    const r = await axios.get(
        `${WORKER2_URL}/result/${jobId}/images`,
        { headers: headers(), timeout: 30000 }
    );

    return r.data.scenes || []; // [{ scene_index, image_base64 }]
}

async function pollUntilDone(jobId, timeoutMs = 600000) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        await sleep(5000);
        const r = await axios.get(
            `${WORKER2_URL}/status/${jobId}`,
            { headers: headers(), timeout: 10000 }
        );
        const { status, progress } = r.data;
        console.log(`[Diffusion] job=${jobId} status=${status} progress=${progress ?? "?"}%`);
        if (status === "done") return;
        if (status === "error") throw new Error(r.data.error || "Erro no Worker 2");
    }

    throw new Error("Timeout a aguardar o Diffusion");
}

function sleep(ms) {
    return new Promise((res) => setTimeout(res, ms));
}

module.exports = { generateImages };