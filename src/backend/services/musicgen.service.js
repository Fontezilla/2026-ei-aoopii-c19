const axios = require("axios");
const fs = require("fs");
const path = require("path");

const WORKER1_URL = process.env.WORKER1_URL;
const WORKER1_KEY = process.env.WORKER1_KEY || "";

const headers = () => ({
    "Content-Type": "application/json",
    ...(WORKER1_KEY ? { "X-Worker-Key": WORKER1_KEY } : {}),
});

/**
 * Gera áudio a partir de um prompt.
 * Retorna o path local do ficheiro WAV guardado.
 */
async function generateAudio(jobId, musicPrompt, durationSeconds = 30) {
    // Arrancar geração
    await axios.post(
        `${WORKER1_URL}/generate-audio`,
        {
            job_id:           jobId,
            music_prompt:     musicPrompt,
            duration_seconds: Math.round(Number(durationSeconds)) || 30,
        },
        { headers: headers(), timeout: 30000 }
    );

    // Polling até done
    await pollUntilDone(jobId);

    // Descarregar o WAV
    const r = await axios.get(
        `${WORKER1_URL}/result/${jobId}/audio`,
        {
            headers: headers(),
            responseType: "arraybuffer",
            timeout: 60000,
        }
    );

    const outputDir = path.join(__dirname, "../outputs");
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const filePath = path.join(outputDir, `${jobId}.wav`);
    fs.writeFileSync(filePath, Buffer.from(r.data));

    return filePath;
}

async function pollUntilDone(jobId, timeoutMs = 600000) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        await sleep(5000);
        const r = await axios.get(
            `${WORKER1_URL}/status/${jobId}`,
            { headers: headers(), timeout: 10000 }
        );
        const { status, progress } = r.data;
        console.log(`[MusicGen] job=${jobId} status=${status} progress=${progress ?? "?"}%`);
        if (status === "done") return;
        if (status === "error") throw new Error(r.data.error || "Erro no MusicGen");
    }

    throw new Error("Timeout a aguardar o MusicGen");
}

function sleep(ms) {
    return new Promise((res) => setTimeout(res, ms));
}

module.exports = { generateAudio };