import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router";
import { ArrowUp, Download, Loader2 } from "lucide-react";

export function meta() {
    return [{ title: "Armonyx — Generate" }];
}

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

type JobStatus =
    | "idle"
    | "PENDING"
    | "GENERATING_PLAN"
    | "GENERATING_AUDIO"
    | "GENERATING_IMAGES"
    | "RENDERING"
    | "COMPLETED"
    | "FAILED";

type Message = {
    role: "user" | "assistant";
    content: string;
    action?: string;
    action_payload?: any;
};

export default function Generate() {
    const location = useLocation();

    const [jobId, setJobId] = useState<string | null>(location.state?.jobId ?? null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState(location.state?.initialPrompt ?? "");
    const [jobStatus, setJobStatus] = useState<JobStatus>("idle");
    const [jobMeta, setJobMeta] = useState<any>(null);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const startedRef = useRef(false);

    // ── Scroll automático ────────────────────────────────────────────────────
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // ── Se vier com jobId (abrir job existente) ──────────────────────────────
    useEffect(() => {
        if (jobId) {
            loadMessages(jobId);
            loadStatus(jobId);
        }
    }, [jobId]);

    // ── Se vier com initialPrompt (novo job) — só uma vez ───────────────────
    useEffect(() => {
        const prompt = location.state?.initialPrompt;
        if (prompt && !jobId && !startedRef.current) {
            startedRef.current = true;
            setInput("");
            startAndSend(prompt);
        }
    }, []);

    // ── Polling enquanto job está a gerar ────────────────────────────────────
    useEffect(() => {
        const isGenerating =
            jobStatus === "GENERATING_PLAN" ||
            jobStatus === "GENERATING_AUDIO" ||
            jobStatus === "GENERATING_IMAGES" ||
            jobStatus === "PENDING";

        if (isGenerating && jobId) {
            pollRef.current = setInterval(() => {
                loadStatus(jobId);
                loadMessages(jobId);
            }, 4000);
        } else {
            if (pollRef.current) clearInterval(pollRef.current);
        }
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, [jobStatus, jobId]);

    // ── Funções ──────────────────────────────────────────────────────────────

    async function startAndSend(prompt: string) {
        setSending(true);
        setError(null);
        try {
            const startRes = await fetch(`${API_URL}/job/start`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ theme: prompt }),
            });
            if (!startRes.ok) throw new Error("Erro ao criar sessão.");
            const { job_id } = await startRes.json();
            await sendMessage(job_id, prompt);
            setJobId(job_id);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSending(false);
        }
    }

    async function sendMessage(jid: string, text: string) {
        addLocalMessage({ role: "user", content: text });
        setSending(true);
        try {
            const res = await fetch(`${API_URL}/job/${jid}/message`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ message: text }),
            });
            if (!res.ok) throw new Error("Erro ao enviar mensagem.");
            const data = await res.json();

            addLocalMessage({ role: "assistant", content: data.reply, action: data.intent });

            const generatingIntents = ["plan", "audio", "video", "regenerate_audio", "regenerate_images"];
            if (generatingIntents.includes(data.intent)) {
                setJobStatus("GENERATING_PLAN");
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSending(false);
        }
    }

    async function loadMessages(jid: string) {
        try {
            const res = await fetch(`${API_URL}/job/${jid}/messages`, { credentials: "include" });
            if (!res.ok) return;
            const data = await res.json();
            const msgs: Message[] = data.messages || [];
            if (msgs.length > 0) setMessages(msgs);
        } catch {}
    }

    async function loadStatus(jid: string) {
        try {
            const res = await fetch(`${API_URL}/job/${jid}/status`, { credentials: "include" });
            if (!res.ok) return;
            const data = await res.json();
            setJobStatus(data.status);
            if (data.status === "COMPLETED" || data.status === "FAILED") {
                setJobMeta(data.metadata);
                loadMessages(jid);
            }
        } catch {}
    }

    function addLocalMessage(msg: Message) {
        setMessages((prev) => [...prev, msg]);
    }

    const handleSubmit = () => {
        if (!input.trim() || sending) return;
        const text = input.trim();
        setInput("");
        if (!jobId) {
            startAndSend(text);
        } else {
            sendMessage(jobId, text);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    const isGenerating =
        jobStatus === "PENDING" ||
        jobStatus === "GENERATING_PLAN" ||
        jobStatus === "GENERATING_AUDIO" ||
        jobStatus === "GENERATING_IMAGES";

    const isDone = jobStatus === "COMPLETED";

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <div className="relative min-h-screen w-full">
            <header className="absolute left-1/2 top-12 z-30 w-full -translate-x-1/2">
                <div className="mx-auto flex max-w-7xl justify-center px-6">
                    <img src="/assets/logo.png" alt="Logo" className="w-48 md:w-52" />
                </div>
            </header>

            <main className="mx-auto w-full max-w-7xl px-6 pt-30 pb-10 md:px-10 lg:px-12">
                <div className="mx-auto flex h-[calc(100vh-11rem)] min-h-145 max-w-6xl overflow-hidden rounded-3xl border border-yellow-400/30 bg-black/60 shadow-2xl shadow-yellow-500/5 backdrop-blur-xl">

                    {/* ── Chat ── */}
                    <div className="flex w-full flex-col border-r border-yellow-400/20 md:w-[42%]">
                        <div className="flex h-14 items-center justify-between border-b border-yellow-400/20 px-5">
                            <span className="text-sm font-semibold text-white">Refine with AI</span>
                            {isGenerating && (
                                <span className="flex items-center gap-2 rounded-full border border-yellow-400/30 bg-yellow-400/10 px-3 py-1 text-xs font-semibold text-yellow-400">
                                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-400" />
                                    Generating
                                </span>
                            )}
                            {isDone && (
                                <span className="flex items-center gap-2 rounded-full border border-green-400/30 bg-green-400/10 px-3 py-1 text-xs font-semibold text-green-400">
                                    ✓ Done
                                </span>
                            )}
                        </div>

                        {/* Mensagens */}
                        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                            {messages.length === 0 && !sending && (
                                <div className="flex flex-1 items-center justify-center">
                                    <p className="text-sm text-zinc-500">Describe what you want to create...</p>
                                </div>
                            )}
                            {messages.map((msg, i) => (
                                <div key={i} className={`flex items-end gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${msg.role === "assistant" ? "border border-yellow-400/30 bg-yellow-400/10 text-yellow-400" : "bg-zinc-800 text-zinc-300"}`}>
                                        {msg.role === "assistant" ? "AI" : "U"}
                                    </div>
                                    <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${msg.role === "assistant" ? "rounded-bl-sm border border-yellow-400/20 bg-white/5 text-zinc-300" : "rounded-br-sm bg-yellow-400 font-medium text-black"}`}>
                                        {msg.content}
                                    </div>
                                </div>
                            ))}
                            {sending && (
                                <div className="flex items-end gap-2.5">
                                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-yellow-400/30 bg-yellow-400/10 text-yellow-400 text-xs font-bold">AI</div>
                                    <div className="rounded-2xl rounded-bl-sm border border-yellow-400/20 bg-white/5 px-4 py-2.5">
                                        <Loader2 size={14} className="animate-spin text-yellow-400" />
                                    </div>
                                </div>
                            )}
                            {error && (
                                <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input */}
                        <div className="border-t border-yellow-400/20 p-4">
                            <div className="flex items-end gap-2 rounded-2xl border border-yellow-400/30 bg-white/5 px-4 py-3">
                                <textarea
                                    rows={1}
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    disabled={sending}
                                    placeholder="Change mood, tempo, instruments..."
                                    className="max-h-24 flex-1 resize-none bg-transparent text-sm text-white placeholder:text-zinc-500 focus:outline-none field-sizing-content [scrollbar-width:none] [&::-webkit-scrollbar]:hidden disabled:opacity-50"
                                />
                                <button
                                    onClick={handleSubmit}
                                    disabled={sending || !input.trim()}
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-yellow-400 hover:bg-yellow-300 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <ArrowUp size={15} className="text-black" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* ── Preview ── */}
                    <div className="hidden flex-1 flex-col md:flex">
                        <div className="flex h-14 items-center justify-between border-b border-yellow-400/20 px-5">
                            <span className="text-sm font-semibold text-white">Preview</span>
                            {isDone && jobMeta?.output_path && (
                                <a
                                    href={`${API_URL}/outputs/${jobMeta.output_path.split("/").pop()}`}
                                    download
                                    className="flex items-center gap-1.5 rounded-full bg-yellow-400 px-4 py-1.5 text-xs font-bold text-black hover:bg-yellow-300 active:scale-95"
                                >
                                    <Download size={12} /> Save
                                </a>
                            )}
                        </div>

                        <div className="flex flex-1 flex-col items-center justify-center gap-5 p-6">
                            <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-yellow-400/20">
                                <div className="h-full w-full bg-zinc-900" />
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                                    {isGenerating && (
                                        <>
                                            <span className="text-xs font-semibold text-yellow-400">GENERATING...</span>
                                            <div className="h-0.5 w-28 overflow-hidden rounded-full bg-yellow-400/20">
                                                <div className="h-full w-2/3 animate-pulse rounded-full bg-yellow-400" />
                                            </div>
                                        </>
                                    )}
                                    {isDone && jobMeta?.output_path && (
                                        <audio
                                            controls
                                            className="w-full px-4"
                                            src={`${API_URL}/outputs/${jobMeta.output_path.split("/").pop()}`}
                                        />
                                    )}
                                    {!isGenerating && !isDone && (
                                        <span className="text-xs text-zinc-500">Preview will appear here</span>
                                    )}
                                </div>
                            </div>

                            <div className="grid w-full grid-cols-4 gap-3">
                                {[
                                    { label: "Tempo",    value: jobMeta?.settings?.tempo    ?? "—" },
                                    { label: "Genre",    value: jobMeta?.settings?.genre    ?? "—" },
                                    { label: "Duration", value: jobMeta?.settings?.duration ?? "—" },
                                    { label: "Mood",     value: jobMeta?.settings?.mood     ?? "—" },
                                ].map((item) => (
                                    <div key={item.label} className="rounded-xl border border-yellow-400/20 bg-white/5 p-3">
                                        <p className="text-xs text-zinc-500">{item.label}</p>
                                        <p className="mt-0.5 text-sm font-semibold text-white">{item.value}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                </div>
            </main>
        </div>
    );
}