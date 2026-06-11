import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
    ArrowUp,
    Download,
    Film,
    Image,
    Music,
    ScrollText,
    Wand2,
    X,
    type LucideIcon,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

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

type PreviewTab = "audio" | "images" | "video" | "plan";

type Message = {
    role: "user" | "assistant";
    content: string;
    action?: string;
    action_payload?: unknown;
};

const PROGRESS_ACTIONS = new Set(["planning", "generating_audio", "generating_images", "rendering"]);
const GENERATING_INTENTS = new Set(["plan", "audio", "images", "video", "regenerate_audio", "regenerate_images", "regenerate_video"]);

const STATUS_LABEL: Partial<Record<JobStatus, string>> = {
    PENDING: "Starting...",
    GENERATING_PLAN: "Thinking...",
    GENERATING_AUDIO: "Generating music...",
    GENERATING_IMAGES: "Generating visuals...",
    RENDERING: "Rendering video...",
};

const BAR_COUNT = 20;
const WAVE_DURATION = 0.8;

function generateBarKeyframes(count: number): number[][] {
    return Array.from({ length: count }, () => [
        0.18,
        Math.random() * 0.55 + 0.35,
        Math.random() * 0.45 + 0.55,
        Math.random() * 0.7 + 0.25,
        0.18,
    ]);
}

function formatDuration(seconds: number) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;

    return `${mins}:${String(secs).padStart(2, "0")}`;
}

function WaveBars({
    active = true,
    barCount = BAR_COUNT,
    height = 52,
    barWidth = 4,
    className = "",
}: {
    active?: boolean;
    barCount?: number;
    height?: number;
    barWidth?: number;
    className?: string;
}) {
    const prefersReducedMotion = useReducedMotion();
    const barKeyframes = useMemo(() => generateBarKeyframes(barCount), [barCount]);

    if (prefersReducedMotion) {
        return (
            <div className={`flex items-center gap-1.5 ${className}`}>
                {Array.from({ length: 5 }).map((_, i) => (
                    <span
                        key={i}
                        className={`h-2 w-2 rounded-full bg-yellow-400/80 ${active ? "animate-pulse" : ""}`}
                        style={{ animationDelay: `${i * 120}ms` }}
                    />
                ))}
            </div>
        );
    }

    return (
        <div className={`flex items-center gap-1 ${className}`}>
            {barKeyframes.map((keyframes, i) => {
                const progress = i / barCount;
                const hue = 42 + progress * 10;
                const lightness = 50 + progress * 14;

                return (
                    <motion.div
                        key={i}
                        className="rounded-full"
                        style={{
                            width: `${barWidth}px`,
                            height: `${height}px`,
                            background: `hsl(${hue}, 96%, ${lightness}%)`,
                            boxShadow: `0 0 10px hsl(${hue}, 96%, ${lightness}%)`,
                            transformOrigin: "center",
                        }}
                        initial={{ scaleY: 0.18 }}
                        animate={{
                            scaleY: active ? keyframes : 0.18,
                            opacity: active ? 1 : 0.45,
                        }}
                        transition={
                            active
                                ? {
                                    duration: WAVE_DURATION,
                                    delay: i * 0.025,
                                    ease: "easeInOut",
                                    repeat: Infinity,
                                    repeatType: "mirror",
                                }
                                : {
                                    duration: 0.25,
                                    ease: "easeOut",
                                }
                        }
                    />
                );
            })}
        </div>
    );
}

export default function Generate() {
    const location = useLocation();
    const navigate = useNavigate();

    const [jobId, setJobId] = useState<string | null>(location.state?.jobId ?? null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState(location.state?.initialPrompt ?? "");
    const [jobStatus, setJobStatus] = useState<JobStatus>("idle");
    const [jobMeta, setJobMeta] = useState<any>(null);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<PreviewTab>("audio");
    const [lightbox, setLightbox] = useState<string | null>(null);
    const [elapsedSec, setElapsedSec] = useState(0);
    const [isAudioPlaying, setIsAudioPlaying] = useState(false);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const startedRef = useRef(false);

    const gen = isGenerating(jobStatus);
    const isDone = jobStatus === "COMPLETED";
    const isFailed = jobStatus === "FAILED";
    const inputDisabled = sending || gen;

    const hasAudio = !!jobMeta?.output_path;
    const hasImages = !!jobMeta?.storyboard?.length;
    const hasVideo = !!jobMeta?.video_path;
    const videoSrc = hasVideo ? `${API_URL}/outputs/${jobMeta.video_path}` : null;

    const audioSrc = hasAudio
        ? (() => {
            const parts = jobMeta.output_path.split(/[/\\]/);
            const rel =
                parts[parts.length - 2] === "outputs"
                    ? parts[parts.length - 1]
                    : parts.slice(-2).join("/");

            return `${API_URL}/outputs/${rel}`;
        })()
        : null;

    const hasPlan = !!jobMeta?.creative_plan;

    const previewTabs: {
        id: PreviewTab;
        label: string;
        Icon: LucideIcon;
    }[] = [
            { id: "audio", label: "Audio", Icon: Music },
            { id: "images", label: "Images", Icon: Image },
            { id: "video", label: "Video", Icon: Film },
            { id: "plan", label: "Plan", Icon: ScrollText },
        ];

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    useEffect(() => {
        if (isGenerating(jobStatus)) {
            setElapsedSec(0);
            timerRef.current = setInterval(() => setElapsedSec((seconds) => seconds + 1), 1000);
        } else if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }

        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [jobStatus]);

    useEffect(() => {
        if (jobId) {
            loadMessages(jobId);
            loadStatus(jobId);
        }
    }, [jobId]);

    useEffect(() => {
        const prompt = location.state?.initialPrompt;

        if (prompt && !location.state?.jobId && !startedRef.current) {
            startedRef.current = true;
            setInput("");
            startAndSend(prompt);
        }
    }, []);

    useEffect(() => {
        const isGen = isGenerating(jobStatus);

        if (isGen && jobId) {
            pollRef.current = setInterval(() => {
                loadStatus(jobId);
                loadMessages(jobId);
            }, 4000);
        } else if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }

        return () => {
            if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
            }
        };
    }, [jobStatus, jobId]);

    useEffect(() => {
        if (jobStatus === "GENERATING_AUDIO") {
            setActiveTab("audio");
            return;
        }
        if (jobStatus === "GENERATING_IMAGES") {
            setActiveTab("images");
            return;
        }
        if (jobStatus === "RENDERING") {
            setActiveTab("video");
            return;
        }
        if (jobStatus === "COMPLETED") {
            const step = jobMeta?.current_step;
            if (step === "RENDER" && jobMeta?.video_path) { setActiveTab("video"); return; }
            if (step === "PLAN") { setActiveTab("plan"); return; }
            if (step === "IMAGES" && jobMeta?.storyboard?.length) { setActiveTab("images"); return; }
            if (jobMeta?.output_path) { setActiveTab("audio"); return; }
            if (jobMeta?.creative_plan) { setActiveTab("plan"); }
        }
    }, [jobStatus, jobMeta]);

    useEffect(() => {
        setIsAudioPlaying(false);
    }, [audioSrc]);

    function isGenerating(status: JobStatus) {
        return ["PENDING", "GENERATING_PLAN", "GENERATING_AUDIO", "GENERATING_IMAGES", "RENDERING"].includes(status);
    }

    async function loadMessages(jid: string) {
        try {
            const res = await fetch(`${API_URL}/job/${jid}/messages`, { credentials: "include" });

            if (!res.ok) return;

            const data = await res.json();
            const msgs: Message[] = data.messages || [];

            // Sempre substituir pelo DB se tiver pelo menos tantas mensagens quanto o estado local.
            // Garante que mensagens de progresso da geração aparecem mesmo quando a contagem é igual.
            setMessages((prev) => (msgs.length >= prev.length ? msgs : prev));
        } catch {
        }
    }

    async function loadStatus(jid: string) {
        try {
            const res = await fetch(`${API_URL}/job/${jid}/status`, { credentials: "include" });

            if (!res.ok) return;

            const data = await res.json();

            setJobStatus(data.status);
            if (data.output_path || data.metadata || data.current_step) {
                setJobMeta({
                    output_path: data.output_path ?? null,
                    current_step: data.current_step ?? null,
                    ...(data.metadata ?? {}),
                });
            }
            if (data.status === "COMPLETED" || data.status === "FAILED") {
                loadMessages(jid);
            }
        } catch {
        }
    }

    async function startAndSend(prompt: string) {
        setError(null);
        setSending(true);

        try {
            const startRes = await fetch(`${API_URL}/job/start`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ theme: prompt }),
            });

            if (!startRes.ok) throw new Error("Erro ao criar sessão.");

            const { job_id } = await startRes.json();
            navigate("/app/generate", { state: { jobId: job_id }, replace: true });
            await sendMessage(job_id, prompt);
            setJobId(job_id);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erro inesperado.");
            setSending(false);
        }
    }

    async function sendMessage(jid: string, text: string) {
        setMessages((prev) => [...prev, { role: "user", content: text }]);
        setSending(true);
        setError(null);

        try {
            const res = await fetch(`${API_URL}/job/${jid}/message`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ message: text }),
            });

            if (!res.ok) throw new Error("Erro ao enviar mensagem.");

            const data = await res.json();

            if (data.reply) {
                setMessages((prev) => [
                    ...prev,
                    {
                        role: "assistant",
                        content: data.reply,
                        action: data.intent ?? "chat",
                    },
                ]);
            }

            if (GENERATING_INTENTS.has(data.intent)) {
                setJobStatus("GENERATING_PLAN");
                setJobMeta(null);
                setIsAudioPlaying(false);
            }

            await loadMessages(jid);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erro inesperado.");
        } finally {
            setSending(false);
        }
    }

    const handleSubmit = () => {
        if (!input.trim() || sending || gen) return;

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

    return (
        <div className="relative min-h-screen w-full">
            {lightbox && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
                    onClick={() => setLightbox(null)}
                >
                    <button
                        type="button"
                        className="absolute right-6 top-6 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
                        onClick={() => setLightbox(null)}
                    >
                        <X size={18} />
                    </button>

                    <img
                        src={lightbox}
                        alt="Cena"
                        className="max-h-[85vh] max-w-[85vw] rounded-2xl object-contain shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}

            <header className="absolute left-1/2 top-12 z-30 w-full -translate-x-1/2">
                <div className="mx-auto flex max-w-7xl justify-center px-6">
                    <button
                        type="button"
                        onClick={() => navigate("/")}
                        aria-label="Back to homepage"
                        className="cursor-pointer rounded-xl transition-transform duration-200 hover:scale-105 active:scale-95"
                    >
                        <img
                            src="/assets/logo.png"
                            alt="Logo"
                            className="w-48 md:w-52"
                            draggable={false}
                        />
                    </button>
                </div>
            </header>

            <main className="mx-auto w-full max-w-7xl px-6 pt-30 pb-10 md:px-10 lg:px-12">
                <div className="mx-auto flex h-[calc(100vh-11rem)] min-h-145 max-w-6xl overflow-hidden rounded-3xl border border-yellow-400/30 bg-black/60 shadow-2xl shadow-yellow-500/5 backdrop-blur-xl">
                    <div className="flex w-full flex-col border-r border-yellow-400/20 md:w-[42%]">
                        <div className="flex h-14 shrink-0 items-center justify-between border-b border-yellow-400/20 px-5">
                            <span className="text-sm font-semibold text-white">Refine with AI</span>

                            {gen && (
                                <span className="flex items-center gap-2 rounded-full border border-yellow-400/30 bg-yellow-400/10 px-3 py-1 text-xs font-semibold text-yellow-400">
                                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-400" />
                                    {STATUS_LABEL[jobStatus] ?? "Generating..."}
                                </span>
                            )}

                            {isDone && (
                                <span className="flex items-center gap-2 rounded-full border border-green-400/30 bg-green-400/10 px-3 py-1 text-xs font-semibold text-green-400">
                                    ✓ Done
                                </span>
                            )}

                            {isFailed && (
                                <span className="flex items-center gap-2 rounded-full border border-red-400/30 bg-red-400/10 px-3 py-1 text-xs font-semibold text-red-400">
                                    ✗ Error
                                </span>
                            )}
                        </div>

                        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                            {messages.length === 0 && !sending && (
                                <div className="flex flex-1 items-center justify-center">
                                    <p className="text-sm text-zinc-500">Describe what you want to create...</p>
                                </div>
                            )}

                            {messages.map((msg, i) => {
                                const isProgress = msg.role === "assistant" && PROGRESS_ACTIONS.has(msg.action ?? "");
                                const isDoneMsg = msg.role === "assistant" && msg.action === "done";
                                const isErrorMsg = msg.role === "assistant" && msg.action === "error";

                                if (isProgress) return null;

                                return (
                                    <div
                                        key={i}
                                        className={`flex items-end gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""
                                            }`}
                                    >
                                        <div
                                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${msg.role === "assistant"
                                                ? isDoneMsg
                                                    ? "border border-green-400/30 bg-green-400/10 text-green-400"
                                                    : isErrorMsg
                                                        ? "border border-red-400/30 bg-red-400/10 text-red-400"
                                                        : "border border-yellow-400/30 bg-yellow-400/10 text-yellow-400"
                                                : "bg-zinc-800 text-zinc-300"
                                                }`}
                                        >
                                            {msg.role === "assistant" ? "AI" : "U"}
                                        </div>

                                        <div
                                            className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${msg.role === "assistant"
                                                ? isDoneMsg
                                                    ? "rounded-bl-sm border border-green-400/20 bg-green-400/5 text-green-300"
                                                    : isErrorMsg
                                                        ? "rounded-bl-sm border border-red-400/20 bg-red-400/5 text-red-300"
                                                        : "rounded-bl-sm border border-yellow-400/20 bg-white/5 text-zinc-300"
                                                : "rounded-br-sm bg-yellow-400 font-medium text-black"
                                                }`}
                                        >
                                            {msg.content}
                                        </div>
                                    </div>
                                );
                            })}

                            {sending && !gen && (
                                <div className="flex items-end gap-2.5">
                                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-yellow-400/30 bg-yellow-400/10 text-xs font-bold text-yellow-400">
                                        AI
                                    </div>

                                    <div className="w-full max-w-[78%] rounded-2xl rounded-bl-sm border border-yellow-400/20 bg-[radial-gradient(circle_at_top_left,rgba(250,204,21,0.14),rgba(255,255,255,0.03)_45%,rgba(0,0,0,0.18)_100%)] px-4 py-3">
                                        <div className="flex items-start gap-3">
                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-yellow-400/20 bg-black/30">
                                                <Wand2 size={18} className="text-yellow-400" />
                                            </div>

                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-semibold text-white">Thinking...</p>
                                                <p className="mt-0.5 text-xs text-zinc-400">
                                                    Preparing your next refinement.
                                                </p>

                                                <div className="mt-3">
                                                    <WaveBars active barCount={14} height={28} barWidth={3} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {gen && (
                                <div className="flex items-end gap-2.5">
                                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-yellow-400/30 bg-yellow-400/10 text-xs font-bold text-yellow-400">
                                        AI
                                    </div>

                                    <div className="w-full max-w-[78%] rounded-2xl rounded-bl-sm border border-yellow-400/20 bg-[radial-gradient(circle_at_top_left,rgba(250,204,21,0.16),rgba(255,255,255,0.03)_42%,rgba(0,0,0,0.25)_100%)] px-4 py-3">
                                        <div className="flex items-start gap-3">
                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-yellow-400/20 bg-black/30">
                                                <Music size={18} className="text-yellow-400" />
                                            </div>

                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center justify-between gap-3">
                                                    <p className="text-sm font-semibold text-white">
                                                        {STATUS_LABEL[jobStatus] ?? "Generating..."}
                                                    </p>

                                                    <span className="rounded-full border border-yellow-400/20 bg-yellow-400/10 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-yellow-300">
                                                        {formatDuration(elapsedSec)}
                                                    </span>
                                                </div>

                                                <p className="mt-0.5 text-xs text-zinc-400">
                                                    Creating the track and preparing the preview.
                                                </p>

                                                <div className="mt-3">
                                                    <WaveBars active barCount={16} height={30} barWidth={3} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {error && (
                                <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                                    {error}
                                </p>
                            )}

                            <div ref={messagesEndRef} />
                        </div>

                        <div className="shrink-0 border-t border-yellow-400/20 p-4">
                            <div
                                className={`flex items-center gap-2 rounded-2xl border px-4 py-3 transition-colors ${inputDisabled
                                    ? "border-yellow-400/10 bg-white/2"
                                    : "border-yellow-400/30 bg-white/5"
                                    }`}
                            >
                                <textarea
                                    rows={1}
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    disabled={inputDisabled}
                                    placeholder={gen ? "Generating, please wait..." : "Change the mood, tempo, instruments..."}
                                    className="max-h-24 flex-1 resize-none bg-transparent text-sm leading-8 text-white placeholder:text-zinc-500 focus:outline-none field-sizing-content [scrollbar-width:none] [&::-webkit-scrollbar]:hidden disabled:opacity-40"
                                />

                                <button
                                    type="button"
                                    onClick={handleSubmit}
                                    disabled={inputDisabled || !input.trim()}
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-yellow-400 transition-opacity hover:bg-yellow-300 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                                    aria-label="Submit prompt"
                                >
                                    <ArrowUp size={15} className="text-black" />
                                </button>
                            </div>

                            {gen && (
                                <p className="mt-2 text-center text-xs text-zinc-600">
                                    You can refine again after the generation finishes
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="hidden flex-1 flex-col md:flex">
                        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-yellow-400/20 px-6">
                            {previewTabs.map(({ id, label, Icon }) => {
                                const isActive = activeTab === id;

                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => setActiveTab(id)}
                                        className={`flex items-center gap-2 rounded-full border px-5 py-2 text-sm font-semibold transition-all duration-200 ${isActive
                                            ? "border-yellow-400/40 bg-yellow-400/20 text-yellow-400 shadow-sm shadow-yellow-400/10"
                                            : "border-transparent text-zinc-500 hover:border-yellow-400/20 hover:bg-yellow-400/10 hover:text-yellow-400"
                                            }`}
                                    >
                                        <Icon size={16} />
                                        {label}
                                    </button>
                                );
                            })}

                            <div className="ml-auto">
                                {isDone && audioSrc && activeTab === "audio" && (
                                    <a
                                        href={audioSrc}
                                        download
                                        className="flex items-center gap-1.5 rounded-full bg-yellow-400 px-4 py-1.5 text-xs font-bold text-black hover:bg-yellow-300 active:scale-95"
                                    >
                                        <Download size={12} /> Download
                                    </a>
                                )}
                                {isDone && videoSrc && activeTab === "video" && (
                                    <a
                                        href={videoSrc}
                                        download
                                        className="flex items-center gap-1.5 rounded-full bg-yellow-400 px-4 py-1.5 text-xs font-bold text-black hover:bg-yellow-300 active:scale-95"
                                    >
                                        <Download size={12} /> Download MP4
                                    </a>
                                )}
                            </div>
                        </div>

                        <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                            {activeTab === "audio" && (
                                <div className="flex flex-1 items-center justify-center">
                                    <div className="relative aspect-video w-full overflow-hidden rounded-[28px] border border-yellow-400/20 bg-[#0b0b10] shadow-[0_0_40px_rgba(250,204,21,0.06)]">
                                        <div className="absolute -left-16 top-8 h-48 w-48 rounded-full bg-yellow-400/10 blur-3xl" />
                                        <div className="absolute -right-14 bottom-2 h-52 w-52 rounded-full bg-yellow-300/8 blur-3xl" />
                                        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01)_30%,rgba(250,204,21,0.04)_100%)]" />
                                        <div className="absolute inset-0 opacity-20 bg-[linear-gradient(rgba(250,204,21,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(250,204,21,0.08)_1px,transparent_1px)] bg-size-[32px_32px]" />

                                        <div className="relative flex h-full flex-col p-8">
                                            <div className="flex flex-1 items-center justify-center">
                                                {gen && jobStatus !== "GENERATING_IMAGES" && jobStatus !== "RENDERING" && (
                                                    <div className="mx-auto flex h-62.5 w-full max-w-3xl items-center rounded-[26px] border border-yellow-400/20 bg-black/35 px-8 py-6 backdrop-blur-md">
                                                        <div className="flex w-full items-center justify-between gap-8">
                                                            <div className="flex min-w-0 items-center gap-5">
                                                                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-yellow-400/20 bg-yellow-400/10">
                                                                    <Music size={28} className="text-yellow-400" />
                                                                </div>

                                                                <div className="min-w-0">
                                                                    <p className="text-xs font-semibold uppercase tracking-[0.32em] text-yellow-400/70">
                                                                        Live generation
                                                                    </p>

                                                                    <h4 className="mt-3 text-3xl font-semibold leading-none text-white">
                                                                        {STATUS_LABEL[jobStatus] ?? "Generating..."}
                                                                    </h4>

                                                                    <p className="mt-3 max-w-md text-sm leading-relaxed text-zinc-400">
                                                                        We are building the melody, structure and texture of your track.
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            <div className="flex shrink-0 flex-col items-center justify-center gap-4">
                                                                <div className="flex h-16 w-52 items-center justify-center overflow-visible">
                                                                    <WaveBars
                                                                        active
                                                                        barCount={16}
                                                                        height={42}
                                                                        barWidth={4}
                                                                    />
                                                                </div>

                                                                <div className="rounded-full border border-yellow-400/20 bg-yellow-400/10 px-4 py-1.5 text-xs font-semibold tabular-nums text-yellow-300">
                                                                    {formatDuration(elapsedSec)}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {!gen && hasAudio && audioSrc && (
                                                    <div className="w-full max-w-3xl rounded-[26px] border border-yellow-400/20 bg-black/35 p-6 backdrop-blur-md">
                                                        <div className="flex items-center justify-between gap-4">
                                                            <div className="flex items-center gap-4">
                                                                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-yellow-400/20 bg-yellow-400/10">
                                                                    <Music size={24} className="text-yellow-400" />
                                                                </div>

                                                                <div>
                                                                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-green-300/80">
                                                                        Ready
                                                                    </p>
                                                                    <h4 className="mt-1 text-xl font-semibold text-white">
                                                                        Your track is ready
                                                                    </h4>
                                                                    <p className="mt-1 text-sm text-zinc-400">
                                                                        Listen, download it, or continue refining the result.
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            <div className="hidden lg:block">
                                                                <WaveBars
                                                                    active={isAudioPlaying}
                                                                    barCount={14}
                                                                    height={34}
                                                                    barWidth={3}
                                                                />
                                                            </div>
                                                        </div>

                                                        <div className="mt-6 rounded-2xl border border-white/8 bg-white/4 p-4">
                                                            <audio
                                                                ref={audioRef}
                                                                controls
                                                                className="w-full accent-yellow-400"
                                                                src={audioSrc}
                                                                onPlay={() => setIsAudioPlaying(true)}
                                                                onPause={() => setIsAudioPlaying(false)}
                                                                onEnded={() => setIsAudioPlaying(false)}
                                                            />
                                                        </div>
                                                    </div>
                                                )}

                                                {!gen && !hasAudio && !isFailed && (
                                                    <div className="w-full max-w-xl rounded-[26px] border border-dashed border-yellow-400/20 bg-black/25 px-8 py-10 text-center backdrop-blur-sm">
                                                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-yellow-400/15 bg-yellow-400/8">
                                                            <Music size={28} className="text-yellow-400/70" />
                                                        </div>

                                                        <h4 className="text-xl font-semibold text-white">
                                                            Your audio will appear here
                                                        </h4>

                                                        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                                                            Start a generation or refine the current concept to preview the final track in this panel.
                                                        </p>
                                                    </div>
                                                )}

                                                {isFailed && (
                                                    <div className="w-full max-w-xl rounded-[26px] border border-red-400/20 bg-red-500/5 px-8 py-10 text-center backdrop-blur-sm">
                                                        <h4 className="text-xl font-semibold text-red-300">
                                                            Generation failed
                                                        </h4>
                                                        <p className="mt-2 text-sm text-red-200/80">
                                                            Something went wrong while generating the audio. Try refining the prompt and generate again.
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === "images" && (
                                <div className="flex flex-1 flex-col">
                                    {jobStatus === "GENERATING_IMAGES" && !hasImages && (
                                        <div className="grid grid-cols-3 gap-3">
                                            {Array.from({ length: 12 }).map((_, i) => (
                                                <div
                                                    key={i}
                                                    className="aspect-video animate-pulse rounded-xl border border-yellow-400/10 bg-white/5"
                                                />
                                            ))}
                                        </div>
                                    )}

                                    {hasImages && (
                                        <div className="grid grid-cols-3 gap-3">
                                            {jobMeta.storyboard.map((scene: any, i: number) => {
                                                const src = scene.image_path
                                                    ? `${API_URL}/outputs/${scene.image_path}`
                                                    : scene.image_base64
                                                        ? `data:image/png;base64,${scene.image_base64}`
                                                        : null;

                                                return (
                                                    <button
                                                        key={i}
                                                        type="button"
                                                        onClick={() => src && setLightbox(src)}
                                                        disabled={!src}
                                                        className="group relative aspect-video overflow-hidden rounded-xl border border-yellow-400/20 bg-zinc-900 disabled:cursor-default"
                                                    >
                                                        {src ? (
                                                            <img
                                                                src={src}
                                                                alt={`Cena ${scene.scene_index ?? i + 1}`}
                                                                className="h-full w-full object-cover transition-transform group-hover:scale-105"
                                                            />
                                                        ) : (
                                                            <span className="text-xs text-zinc-600">Scene {i + 1}</span>
                                                        )}

                                                        <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-zinc-400">
                                                            {scene.scene_index ?? i + 1}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {!gen && !hasImages && (
                                        <div className="flex flex-1 items-center justify-center">
                                            <span className="text-xs text-zinc-500">
                                                The scene images will appear here
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === "plan" && (
                                <div className="flex flex-1 flex-col gap-4">
                                    {!hasPlan && (
                                        <div className="flex flex-1 items-center justify-center">
                                            <div className="w-full max-w-xl rounded-[26px] border border-dashed border-yellow-400/20 bg-black/25 px-8 py-10 text-center backdrop-blur-sm">
                                                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-yellow-400/15 bg-yellow-400/8">
                                                    <ScrollText size={28} className="text-yellow-400/70" />
                                                </div>
                                                <h4 className="text-xl font-semibold text-white">No plan yet</h4>
                                                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                                                    Ask to create a plan or generate the full AMV to see the creative brief here.
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {hasPlan && (() => {
                                        const plan = jobMeta.creative_plan;
                                        const scenes: any[] = plan.storyboard ?? [];
                                        return (
                                            <>
                                                <div className="rounded-2xl border border-yellow-400/20 bg-white/3 p-5">
                                                    <p className="text-[10px] font-semibold uppercase tracking-widest text-yellow-400/60">AMV Title</p>
                                                    <h3 className="mt-1 text-lg font-semibold text-white">{plan.title ?? "—"}</h3>
                                                    {plan.music_prompt && (
                                                        <p className="mt-3 text-xs leading-relaxed text-zinc-400">
                                                            <span className="font-semibold text-zinc-300">Music prompt: </span>
                                                            {plan.music_prompt}
                                                        </p>
                                                    )}
                                                </div>

                                                <div className="flex flex-1 flex-col gap-2 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                                    {scenes.map((scene: any, i: number) => (
                                                        <div
                                                            key={i}
                                                            className="flex gap-3 rounded-xl border border-yellow-400/10 bg-white/2 px-4 py-3"
                                                        >
                                                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-yellow-400/15 text-[10px] font-bold text-yellow-400">
                                                                {scene.scene_index ?? i + 1}
                                                            </span>
                                                            <div className="min-w-0 flex-1">
                                                                <p className="text-sm text-zinc-200 leading-relaxed">{scene.description ?? "—"}</p>
                                                                <div className="mt-1.5 flex gap-3">
                                                                    <span className="text-[11px] text-zinc-500">{scene.duration ?? "—"}s</span>
                                                                    <span className="text-[11px] text-zinc-500">{scene.transition ?? "—"}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </>
                                        );
                                    })()}
                                </div>
                            )}

                            {activeTab === "video" && (
                                <div className="flex flex-1 flex-col gap-4">
                                    {jobStatus === "RENDERING" && (
                                        <div className="flex flex-1 items-center justify-center">
                                            <div className="w-full max-w-xl rounded-[26px] border border-yellow-400/20 bg-black/35 px-8 py-8 backdrop-blur-md text-center">
                                                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-yellow-400/20 bg-yellow-400/10">
                                                    <Film size={26} className="text-yellow-400" />
                                                </div>
                                                <p className="text-xs font-semibold uppercase tracking-widest text-yellow-400/70">A Renderizar</p>
                                                <h4 className="mt-2 text-xl font-semibold text-white">A montar o teu AMV...</h4>
                                                <p className="mt-2 text-sm text-zinc-400">
                                                    A combinar música, imagens e transições com ffmpeg.
                                                </p>
                                                <div className="mt-5 flex justify-center">
                                                    <WaveBars active barCount={16} height={32} barWidth={3} />
                                                </div>
                                                <div className="mt-4 flex justify-center">
                                                    <span className="rounded-full border border-yellow-400/20 bg-yellow-400/10 px-4 py-1.5 text-xs font-semibold tabular-nums text-yellow-300">
                                                        {formatDuration(elapsedSec)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {!gen && hasVideo && videoSrc && (
                                        <div className="flex flex-1 flex-col gap-3">
                                            <div className="overflow-hidden rounded-[20px] border border-yellow-400/20 bg-black shadow-[0_0_30px_rgba(250,204,21,0.06)]">
                                                <video
                                                    controls
                                                    className="w-full"
                                                    src={videoSrc}
                                                    preload="metadata"
                                                />
                                            </div>
                                            <div className="flex items-center justify-between px-1">
                                                <p className="text-xs text-zinc-500">
                                                    <span className="text-green-400 font-semibold">✓ AMV pronto</span>
                                                    {" — podes fazer download ou refinar a geração"}
                                                </p>
                                                <a
                                                    href={videoSrc}
                                                    download
                                                    className="flex items-center gap-1.5 rounded-full bg-yellow-400 px-4 py-1.5 text-xs font-bold text-black hover:bg-yellow-300 active:scale-95"
                                                >
                                                    <Download size={12} /> Download
                                                </a>
                                            </div>
                                        </div>
                                    )}

                                    {!gen && !hasVideo && (
                                        <div className="flex flex-1 items-center justify-center">
                                            <div className="w-full max-w-xl rounded-[26px] border border-dashed border-yellow-400/20 bg-black/25 px-8 py-10 text-center backdrop-blur-sm">
                                                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-yellow-400/15 bg-yellow-400/8">
                                                    <Film size={28} className="text-yellow-400/70" />
                                                </div>
                                                <h4 className="text-xl font-semibold text-white">O vídeo aparecerá aqui</h4>
                                                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                                                    Gera a música e as imagens e pede o vídeo final — o AMV será montado automaticamente.
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="flex w-full shrink-0 justify-center gap-3">
                                {[
                                    { label: "Genre", value: jobMeta?.settings?.genre ?? "—" },
                                    { label: "Mood", value: jobMeta?.settings?.mood ?? "—" },
                                    { label: "Duration", value: jobMeta?.settings?.duration ?? "—" },
                                ].map((item) => (
                                    <div
                                        key={item.label}
                                        className="w-30 rounded-2xl border border-yellow-400/20 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-3"
                                    >
                                        <p className="text-xs text-zinc-500">{item.label}</p>
                                        <p className="mt-0.5 truncate text-sm font-semibold text-white">{item.value}</p>
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