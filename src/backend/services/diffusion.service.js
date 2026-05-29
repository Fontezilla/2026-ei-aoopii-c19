const axios = require("axios");
const fs = require("fs");
const path = require("path");

const WORKER2_URL = process.env.WORKER2_URL;
const WORKER2_KEY = process.env.WORKER2_KEY || "";

const headers = () => ({
    "Content-Type": "application/json",
    ...(WORKER2_URL && WORKER2_KEY ? { "X-Worker-Key": WORKER2_KEY } : {}),
});

async function generateImages(workerJobId, imagePrompts, parentJobId) {
    if (!WORKER2_URL) {
        console.warn("[Diffusion] WORKER2_URL não configurado — a saltar geração de imagens");
        return [];
    }

    await axios.post(
        `${WORKER2_URL}/generate-images`,
        {
            job_id: workerJobId,
            scenes: imagePrompts.map((prompt, i) => ({
                scene_index: i + 1,
                prompt,
            })),
        },
        { headers: headers(), timeout: 30000 }
    );

    await pollUntilDone(workerJobId);

    const r = await axios.get(
        `${WORKER2_URL}/result/${workerJobId}/images`,
        { headers: headers(), timeout: 30000 }
    );

    const scenes = r.data.scenes || [];

    const folder = parentJobId || workerJobId;
    const imageDir = path.join(__dirname, "../outputs", folder, "images");
    if (!fs.existsSync(imageDir)) fs.mkdirSync(imageDir, { recursive: true });

    return scenes.map((scene) => {
        const filename = `scene_${String(scene.scene_index).padStart(2, "0")}.png`;
        const filePath = path.join(imageDir, filename);

        if (scene.image_base64) {
            fs.writeFileSync(filePath, Buffer.from(scene.image_base64, "base64"));
        }

        return {
            scene_index: scene.scene_index,
            image_path: `${folder}/images/${filename}`,
        };
    });
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