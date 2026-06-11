const { execFile } = require("child_process");
const { promisify } = require("util");
const path = require("path");
const fs = require("fs");
const os = require("os");

const execFileAsync = promisify(execFile);

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const FPS = 24;
const WIDTH = 1280;
const HEIGHT = 720;
const TRANS = 0.5;

const XFADE_MAP = {
    crossfade: "dissolve",
    fade: "dissolve",
    fadein: "dissolve",
    slide: "slideleft",
    slideleft: "slideleft",
    wipe: "wipeleft",
    wipeleft: "wipeleft",
    zoom: "zoomin",
    flash: "fadewhite",
};

function mapXfade(transition) {
    return XFADE_MAP[(transition || "crossfade").toLowerCase()] || "dissolve";
}

async function renderVideo(storyboard, audioAbsPath, creativePlan, parentJobId) {
    const outputsBase = path.join(__dirname, "../outputs");

    const scenes = storyboard
        .map((scene) => {
            const planScene = (creativePlan?.storyboard || []).find(
                (s) => s.scene_index === scene.scene_index
            ) || {};
            return {
                scene_index: scene.scene_index,
                image_path: path.join(outputsBase, scene.image_path),
                duration: Math.max(1.0, parseFloat(planScene.duration) || 5.0),
                transition: planScene.transition || "crossfade",
            };
        })
        .filter((s) => fs.existsSync(s.image_path))
        .sort((a, b) => a.scene_index - b.scene_index);

    if (scenes.length === 0) {
        throw new Error("Nenhuma imagem de cena encontrada para renderizar o vídeo.");
    }
    if (!fs.existsSync(audioAbsPath)) {
        throw new Error(`Ficheiro de áudio não encontrado: ${audioAbsPath}`);
    }

    const N = scenes.length;
    const outputDir = path.join(outputsBase, parentJobId);
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, "video.mp4");

    console.log(`[Video] A renderizar ${N} cenas → ${outputPath}`);


    const filters = [];

    for (let i = 0; i < N; i++) {
        filters.push(
            `[${i}:v]` +
            `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,` +
            `pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:black,` +
            `setsar=1,fps=${FPS},` +
            `eq=contrast=1.1:saturation=1.2:brightness=0.02` +
            `[v${i}]`
        );
    }

    let currentLabel = "v0";
    let cumDuration = 0;

    if (N > 1) {
        for (let i = 1; i < N; i++) {
            cumDuration += scenes[i - 1].duration;
            const offset = Math.max(0, cumDuration - TRANS);
            const xfadeType = mapXfade(scenes[i - 1].transition);
            const outLabel = i === N - 1 ? "vchain" : `xf${i}`;

            filters.push(
                `[${currentLabel}][v${i}]xfade=` +
                `transition=${xfadeType}:` +
                `duration=${TRANS}:` +
                `offset=${offset.toFixed(3)}` +
                `[${outLabel}]`
            );
            currentLabel = outLabel;
        }
    }

    const totalDuration = scenes.reduce((s, sc) => s + sc.duration, 0);
    const fadeStart = Math.max(0, totalDuration - 1.5);
    const preOutLabel = N > 1 ? "vchain" : "v0";
    filters.push(`[${preOutLabel}]fade=t=out:st=${fadeStart.toFixed(3)}:d=1.5[vout]`);

    const filterScript = path.join(os.tmpdir(), `armonyx_fc_${Date.now()}.txt`);
    fs.writeFileSync(filterScript, filters.join(";\n"), "utf8");

    const args = [];

    for (const s of scenes) {
        args.push("-loop", "1", "-t", String(s.duration + TRANS), "-i", s.image_path);
    }

    args.push("-i", audioAbsPath);
    args.push("-filter_complex_script", filterScript);
    args.push("-map", "[vout]");
    args.push("-map", `${N}:a`);
    args.push("-c:v", "libx264", "-preset", "fast", "-crf", "22");
    args.push("-c:a", "aac", "-b:a", "128k");
    args.push("-movflags", "+faststart");
    args.push("-shortest");
    args.push("-y");
    args.push(outputPath);

    console.log(`[Video] ffmpeg ${args.slice(args.indexOf("-filter_complex_script")).join(" ")}`);

    try {
        await execFileAsync(FFMPEG, args, {
            maxBuffer: 50 * 1024 * 1024,
            timeout: 600_000,
        });
    } catch (err) {
        const detail = (err.stderr || err.stdout || err.message || "").slice(0, 600);
        throw new Error(`ffmpeg falhou:\n${detail}`);
    } finally {
        try { fs.unlinkSync(filterScript); } catch (_) { }
    }

    if (!fs.existsSync(outputPath)) {
        throw new Error("ffmpeg terminou mas o ficheiro de vídeo não foi criado.");
    }

    const sizeMB = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1);
    console.log(`[Video] Concluído: ${outputPath} (${sizeMB} MB)`);

    return `${parentJobId}/video.mp4`;
}

module.exports = { renderVideo };
