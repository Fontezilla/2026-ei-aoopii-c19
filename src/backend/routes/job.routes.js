const express = require("express");
const router = express.Router();
const supabase = require("../configs/supabase");
const { createJob, handleMessage } = require("../services/orchestrator.service");
const { requireAuth } = require("../middlewares/auth.middleware");

router.use(requireAuth);

router.post("/start", async (req, res) => {
    try {
        const { theme = "" } = req.body;
        const userId = req.user.sub;

        const { jobId, conversationId } = await createJob(userId, theme);

        res.status(201).json({ job_id: jobId, conversation_id: conversationId });
    } catch (err) {
        console.error("[POST /job/start]", err.message);
        res.status(500).json({ message: "Erro ao criar job." });
    }
});

router.post("/:id/message", async (req, res) => {
    try {
        const jobId = req.params.id;
        const { message } = req.body;

        if (!message?.trim()) {
            return res.status(400).json({ message: "Mensagem em falta." });
        }

        const { data: job, error } = await supabase
            .from("jobs")
            .select("id, status")
            .eq("id", jobId)
            .eq("user_id", req.user.sub)
            .single();

        if (error || !job) {
            return res.status(404).json({ message: "Job não encontrado." });
        }

        const { data: conv } = await supabase
            .from("conversations")
            .select("id")
            .eq("job_id", jobId)
            .single();

        if (!conv) {
            return res.status(404).json({ message: "Conversa não encontrada." });
        }

        const result = await handleMessage(jobId, conv.id, message.trim());

        res.json({
            intent: result.intent,
            reply: result.reply,
            metadata: result.metadata || null,
        });
    } catch (err) {
        console.error("[POST /job/:id/message]", err.message);
        res.status(500).json({ message: "Erro ao processar mensagem." });
    }
});

router.get("/:id/status", async (req, res) => {
    try {
        const { data: job, error } = await supabase
            .from("jobs")
            .select("id, status, current_step, theme, output_path, error_message, completed_at")
            .eq("id", req.params.id)
            .eq("user_id", req.user.sub)
            .single();

        if (error || !job) {
            return res.status(404).json({ message: "Job não encontrado." });
        }

        const { data: metaRows } = await supabase
            .from("job_metadata")
            .select()
            .eq("job_id", job.id)
            .limit(1);
        const meta = metaRows && metaRows.length > 0 ? metaRows[0] : null;
        const metadata = meta
            ? {
                music_prompt: meta.music_prompt ?? null,
                settings: meta.settings ?? null,
                storyboard: meta.storyboard ?? null,
                creative_plan: meta.creative_plan ?? null,
                video_path: meta.video_path ?? null,
            }
            : null;

        res.json({ ...job, metadata });
    } catch (err) {
        console.error("[GET /job/:id/status]", err.message);
        res.status(500).json({ message: "Erro ao obter estado do job." });
    }
});

router.get("/:id/messages", async (req, res) => {
    try {
        const { data: conv } = await supabase
            .from("conversations")
            .select("id")
            .eq("job_id", req.params.id)
            .single();

        if (!conv) {
            return res.status(404).json({ message: "Conversa não encontrada." });
        }

        const { data: messages } = await supabase
            .from("messages")
            .select("role, content, action, action_payload, created_at")
            .eq("conversation_id", conv.id)
            .order("created_at", { ascending: true });

        res.json({ messages: messages || [] });
    } catch (err) {
        console.error("[GET /job/:id/messages]", err.message);
        res.status(500).json({ message: "Erro ao obter mensagens." });
    }
});

router.get("/history", async (req, res) => {
    try {
        const { data: jobs, error } = await supabase
            .from("jobs")
            .select("id, status, theme, output_path, created_at, completed_at")
            .eq("user_id", req.user.sub)
            .order("created_at", { ascending: false })
            .limit(50);

        if (error) throw new Error(error.message);

        const jobIds = (jobs || []).map((j) => j.id);
        const metaMap = {};

        if (jobIds.length > 0) {
            const { data: metas, error: metaErr } = await supabase
                .from("job_metadata")
                .select()
                .in("job_id", jobIds);
            if (metaErr) console.warn("[GET /job/history] metadata error:", metaErr.message);
            for (const m of metas || []) {
                metaMap[m.job_id] = m;
            }
        }

        const enriched = (jobs || []).map((job) => {
            const meta = metaMap[job.id] ?? null;
            return {
                id: job.id,
                status: job.status,
                theme: job.theme,
                output_path: job.output_path,
                created_at: job.created_at,
                completed_at: job.completed_at,
                video_path: meta?.video_path ?? null,
                first_image: meta?.storyboard?.[0]?.image_path ?? null,
            };
        });

        res.json({ jobs: enriched });
    } catch (err) {
        console.error("[GET /job/history]", err.message);
        res.status(500).json({ message: "Erro ao obter histórico." });
    }
});

module.exports = router;