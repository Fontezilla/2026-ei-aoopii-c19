import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { ArrowUp, Download, Loader2, Music, Image, Film, X } from "lucide-react";

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

type PreviewTab = "audio" | "images" | "video";

type Message = {
    role: "user" | "assistant";
    content: string;
    action?: string;
    action_payload?: any;
};

const PROGRESS_ACTIONS = new Set(["planning", "generating_audio", "generating_images", "rendering"]);
const GENERATING_INTENTS = new Set(["plan", "audio", "video", "regenerate_audio", "regenerate_images"]);

const STATUS_LABEL: Partial<Record<JobStatus, string>> = {
    PENDING:            "Iniciando...",
    GENERATING_PLAN:    "A planear...",
    GENERATING_AUDIO:   "A gerar música...",
    GENERATING_IMAGES:  "A gerar imagens...",
    RENDERING:          "A finalizar...",
};

export default function Generate() {
    const location = useLocation();
    const navigate = useNavigate();

    const [jobId, setJobId]         = useState<string | null>(location.state?.jobId ?? null);
    const [messages, setMessages]   = useState<Message[]>([]);
    const [input, setInput]         = useState(location.state?.initialPrompt ?? "");
    const [jobStatus, setJobStatus] = useState<JobStatus>("idle");
    const [jobMeta, setJobMeta]     = useState<any>(null);
    const [sending, setSending]         = useState(false);
    const [error, setError]             = useState<string | null>(null);
    const [activeTab, setActiveTab]     = useState<PreviewTab>("audio");
    const [lightbox, setLightbox]       = useState<string | null>(null);
    const [elapsedSec, setElapsedSec]   = useState(0);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const pollRef        = useRef<ReturnType<typeof setInterval> | null>(null);
    const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null);
    const startedRef     = useRef(false);

    // ── Scroll automático ──────────────────────────────────────────────────────
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // ── Timer de geração ──────────────────────────────────────────────────────
    useEffect(() => {
        if (isGenerating(jobStatus)) {
            setElapsedSec(0);
            timerRef.current = setInterval(() => setElapsedSec(s => s + 1), 1000);
        } else {
            if (timerRef.current) clearInterval(timerRef.current);
        }
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [jobStatus]);

    // ── Abrir job existente ────────────────────────────────────────────────────
    useEffect(() => {
        if (jobId) {
            loadMessages(jobId);
            loadStatus(jobId);
        }
    }, [jobId]);

    // ── Prompt inicial (novo job) — só uma vez ─────────────────────────────────
    useEffect(() => {
        const prompt = location.state?.initialPrompt;
        if (prompt && !location.state?.jobId && !startedRef.current) {
            startedRef.current = true;
            setInput("");
            startAndSend(prompt);
        }
    }, []);

    // ── Polling durante geração ────────────────────────────────────────────────
    useEffect(() => {
        const isGen = isGenerating(jobStatus);
        if (isGen && jobId) {
            pollRef.current = setInterval(() => {
                loadStatus(jobId);
                loadMessages(jobId);
            }, 4000);
        } else {
            if (pollRef.current) clearInterval(pollRef.current);
        }
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [jobStatus, jobId]);

    // ── Auto-switch de aba ─────────────────────────────────────────────────────
    useEffect(() => {
        if (jobStatus === "GENERATING_AUDIO" || (jobStatus === "COMPLETED" && jobMeta?.output_path)) {
            setActiveTab("audio");
        } else if (jobStatus === "GENERATING_IMAGES" || (jobStatus === "COMPLETED" && jobMeta?.storyboard?.length)) {
            setActiveTab("images");
        } else if (jobStatus === "RENDERING") {
            setActiveTab("video");
        }
    }, [jobStatus, jobMeta]);

    // ── Helpers ────────────────────────────────────────────────────────────────

    function isGenerating(status: JobStatus) {
        return ["PENDING", "GENERATING_PLAN", "GENERATING_AUDIO", "GENERATING_IMAGES", "RENDERING"].includes(status);
    }

    async function loadMessages(jid: string) {
        try {
            const res = await fetch(`${API_URL}/job/${jid}/messages`, { credentials: "include" });
            if (!res.ok) return;
            const data = await res.json();
            const msgs: Message[] = data.messages || [];
            // Só actualizar se o DB tiver mais mensagens do que o estado local
            // (evita apagar replies optimistas que ainda não propagaram no Supabase)
            setMessages(prev => msgs.length > prev.length ? msgs : prev);
        } catch {}
    }

    async function loadStatus(jid: string) {
        try {
            const res = await fetch(`${API_URL}/job/${jid}/status`, { credentials: "include" });
            if (!res.ok) return;
            const data = await res.json();
            setJobStatus(data.status);
            // Atualizar sempre o jobMeta se houver dados — permite mostrar output parcial
            // ao re-entrar num job que ainda estava em geração
            if (data.output_path || data.metadata) {
                setJobMeta({
                    output_path: data.output_path ?? null,
                    ...(data.metadata ?? {}),
                });
            }
            if (data.status === "COMPLETED" || data.status === "FAILED") {
                loadMessages(jid);
            }
        } catch {}
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
            // Substituir o history entry para que, ao voltar atrás, o job seja carregado em vez de recriado
            navigate("/app/generate", { state: { jobId: job_id }, replace: true });
            await sendMessage(job_id, prompt);
            setJobId(job_id);
        } catch (err: any) {
            setError(err.message);
            setSending(false);
        }
    }

    async function sendMessage(jid: string, text: string) {
        // Optimistic: mostra mensagem do user imediatamente
        setMessages(prev => [...prev, { role: "user", content: text }]);
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

            // Adiciona reply do AI imediatamente (sem esperar Supabase propagar)
            if (data.reply) {
                setMessages(prev => [
                    ...prev,
                    { role: "assistant", content: data.reply, action: data.intent ?? "chat" },
                ]);
            }

            if (GENERATING_INTENTS.has(data.intent)) {
                setJobStatus("GENERATING_PLAN");
                setJobMeta(null);
            }

            // Sync com DB depois (apanha msgs de progresso que entretanto chegaram)
            await loadMessages(jid);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSending(false);
        }
    }

    const handleSubmit = () => {
        const gen = isGenerating(jobStatus);
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

    // ── Derivados ──────────────────────────────────────────────────────────────
    const gen          = isGenerating(jobStatus);
    const isDone       = jobStatus === "COMPLETED";
    const isFailed     = jobStatus === "FAILED";
    const inputDisabled = sending || gen;

    const hasAudio  = !!jobMeta?.output_path;
    const hasImages = !!(jobMeta?.storyboard?.length);
    const hasVideo  = false; // futuro

    const audioSrc = hasAudio
        ? (() => {
              const parts = jobMeta.output_path.split(/[/\\]/);
              // novo formato: outputs/<uuid>/audio.wav → slice(-2) = ["<uuid>","audio.wav"]
              // antigo formato: outputs/audio_xxx.wav → slice(-2) = ["outputs","audio_xxx.wav"]
              const rel = parts[parts.length - 2] === "outputs"
                  ? parts[parts.length - 1]
                  : parts.slice(-2).join("/");
              return `${API_URL}/outputs/${rel}`;
          })()
        : null;

    // ── Render ─────────────────────────────────────────────────────────────────
    return (
        <div className="relative min-h-screen w-full">
            {/* Lightbox */}
            {lightbox && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
                    onClick={() => setLightbox(null)}
                >
                    <button
                        className="absolute right-6 top-6 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
                        onClick={() => setLightbox(null)}
                    >
                        <X size={18} />
                    </button>
                    <img
                        src={lightbox}
                        alt="Cena"
                        className="max-h-[85vh] max-w-[85vw] rounded-2xl object-contain shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    />
                </div>
            )}

            <header className="absolute left-1/2 top-12 z-30 w-full -translate-x-1/2">
                <div className="mx-auto flex max-w-7xl justify-center px-6">
                    <img src="/assets/logo.png" alt="Logo" className="w-48 md:w-52" />
                </div>
            </header>

            <main className="mx-auto w-full max-w-7xl px-6 pt-30 pb-10 md:px-10 lg:px-12">
                <div className="mx-auto flex h-[calc(100vh-11rem)] min-h-145 max-w-6xl overflow-hidden rounded-3xl border border-yellow-400/30 bg-black/60 shadow-2xl shadow-yellow-500/5 backdrop-blur-xl">

                    {/* ── Chat ──────────────────────────────────────────────── */}
                    <div className="flex w-full flex-col border-r border-yellow-400/20 md:w-[42%]">

                        {/* Header do chat */}
                        <div className="flex h-14 shrink-0 items-center justify-between border-b border-yellow-400/20 px-5">
                            <span className="text-sm font-semibold text-white">Refine with AI</span>
                            {gen && (
                                <span className="flex items-center gap-2 rounded-full border border-yellow-400/30 bg-yellow-400/10 px-3 py-1 text-xs font-semibold text-yellow-400">
                                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-400" />
                                    {STATUS_LABEL[jobStatus] ?? "A gerar..."}
                                </span>
                            )}
                            {isDone && (
                                <span className="flex items-center gap-2 rounded-full border border-green-400/30 bg-green-400/10 px-3 py-1 text-xs font-semibold text-green-400">
                                    ✓ Concluído
                                </span>
                            )}
                            {isFailed && (
                                <span className="flex items-center gap-2 rounded-full border border-red-400/30 bg-red-400/10 px-3 py-1 text-xs font-semibold text-red-400">
                                    ✗ Erro
                                </span>
                            )}
                        </div>

                        {/* Mensagens */}
                        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                            {messages.length === 0 && !sending && (
                                <div className="flex flex-1 items-center justify-center">
                                    <p className="text-sm text-zinc-500">Descreve o que queres criar...</p>
                                </div>
                            )}

                            {messages.map((msg, i) => {
                                const isProgress = msg.role === "assistant" && PROGRESS_ACTIONS.has(msg.action ?? "");
                                const isDoneMsg  = msg.role === "assistant" && msg.action === "done";
                                const isErrorMsg = msg.role === "assistant" && msg.action === "error";

                                if (isProgress) {
                                    return (
                                        <div key={i} className="flex items-center gap-2 py-0.5 pl-1">
                                            <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-yellow-400/70" />
                                            <span className="text-xs italic text-yellow-400/80">{msg.content}</span>
                                        </div>
                                    );
                                }

                                return (
                                    <div key={i} className={`flex items-end gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                                        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                            msg.role === "assistant"
                                                ? isDoneMsg  ? "border border-green-400/30 bg-green-400/10 text-green-400"
                                                : isErrorMsg ? "border border-red-400/30 bg-red-400/10 text-red-400"
                                                             : "border border-yellow-400/30 bg-yellow-400/10 text-yellow-400"
                                                : "bg-zinc-800 text-zinc-300"
                                        }`}>
                                            {msg.role === "assistant" ? "AI" : "U"}
                                        </div>
                                        <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                                            msg.role === "assistant"
                                                ? isDoneMsg  ? "rounded-bl-sm border border-green-400/20 bg-green-400/5 text-green-300"
                                                : isErrorMsg ? "rounded-bl-sm border border-red-400/20 bg-red-400/5 text-red-300"
                                                             : "rounded-bl-sm border border-yellow-400/20 bg-white/5 text-zinc-300"
                                                : "rounded-br-sm bg-yellow-400 font-medium text-black"
                                        }`}>
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
                                    <div className="rounded-2xl rounded-bl-sm border border-yellow-400/20 bg-white/5 px-4 py-2.5">
                                        <Loader2 size={14} className="animate-spin text-yellow-400" />
                                    </div>
                                </div>
                            )}
                            {gen && (
                                <div className="flex items-end gap-2.5">
                                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-yellow-400/30 bg-yellow-400/10 text-xs font-bold text-yellow-400">
                                        AI
                                    </div>
                                    <div className="rounded-2xl rounded-bl-sm border border-yellow-400/20 bg-white/5 px-4 py-2.5 text-sm text-yellow-400/80">
                                        {STATUS_LABEL[jobStatus] ?? "A gerar..."}{" "}
                                        <span className="tabular-nums text-yellow-400/50">({elapsedSec}s)</span>
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

                        {/* Input */}
                        <div className="shrink-0 border-t border-yellow-400/20 p-4">
                            <div className={`flex items-end gap-2 rounded-2xl border px-4 py-3 transition-colors ${
                                inputDisabled ? "border-yellow-400/10 bg-white/2" : "border-yellow-400/30 bg-white/5"
                            }`}>
                                <textarea
                                    rows={1}
                                    value={input}
                                    onChange={e => setInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    disabled={inputDisabled}
                                    placeholder={gen ? "A gerar, aguarda..." : "Altera o mood, tempo, instrumentos..."}
                                    className="max-h-24 flex-1 resize-none bg-transparent text-sm text-white placeholder:text-zinc-500 focus:outline-none field-sizing-content [scrollbar-width:none] [&::-webkit-scrollbar]:hidden disabled:opacity-40"
                                />
                                <button
                                    onClick={handleSubmit}
                                    disabled={inputDisabled || !input.trim()}
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-yellow-400 transition-opacity hover:bg-yellow-300 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    <ArrowUp size={15} className="text-black" />
                                </button>
                            </div>
                            {gen && (
                                <p className="mt-2 text-center text-xs text-zinc-600">
                                    Podes refinar depois da geração terminar
                                </p>
                            )}
                        </div>
                    </div>

                    {/* ── Preview ───────────────────────────────────────────── */}
                    <div className="hidden flex-1 flex-col md:flex">

                        {/* Tabs header */}
                        <div className="flex h-14 shrink-0 items-center gap-1 border-b border-yellow-400/20 px-4">
                            {(
                                [
                                    { id: "audio",  label: "Audio",  Icon: Music, enabled: hasAudio  || gen },
                                    { id: "images", label: "Images", Icon: Image, enabled: hasImages || jobStatus === "GENERATING_IMAGES" },
                                    { id: "video",  label: "Video",  Icon: Film,  enabled: hasVideo  || jobStatus === "RENDERING" },
                                ] as const
                            ).map(({ id, label, Icon, enabled }) => (
                                <button
                                    key={id}
                                    disabled={!enabled}
                                    onClick={() => setActiveTab(id)}
                                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                                        activeTab === id
                                            ? "bg-yellow-400/15 text-yellow-400"
                                            : "text-zinc-500 hover:text-zinc-300"
                                    }`}
                                >
                                    <Icon size={13} />
                                    {label}
                                </button>
                            ))}

                            <div className="ml-auto">
                                {isDone && audioSrc && activeTab === "audio" && (
                                    <a
                                        href={audioSrc}
                                        download
                                        className="flex items-center gap-1.5 rounded-full bg-yellow-400 px-4 py-1.5 text-xs font-bold text-black hover:bg-yellow-300 active:scale-95"
                                    >
                                        <Download size={12} /> Guardar
                                    </a>
                                )}
                            </div>
                        </div>

                        {/* Conteúdo das abas */}
                        <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">

                            {/* ── Aba Audio */}
                            {activeTab === "audio" && (
                                <div className="flex flex-1 items-center justify-center">
                                    <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-yellow-400/20">
                                        <div className="h-full w-full bg-zinc-900" />
                                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                                            {(gen && jobStatus !== "GENERATING_IMAGES" && jobStatus !== "RENDERING") && (
                                                <>
                                                    <Music size={28} className="text-yellow-400/60" />
                                                    <span className="text-xs font-semibold text-yellow-400">
                                                        {STATUS_LABEL[jobStatus]?.toUpperCase() ?? "A GERAR..."}
                                                    </span>
                                                    <div className="h-0.5 w-28 overflow-hidden rounded-full bg-yellow-400/20">
                                                        <div className="h-full w-2/3 animate-pulse rounded-full bg-yellow-400" />
                                                    </div>
                                                </>
                                            )}
                                            {hasAudio && audioSrc && (
                                                <audio controls className="w-full px-4" src={audioSrc} />
                                            )}
                                            {!gen && !hasAudio && (
                                                <span className="text-xs text-zinc-500">O áudio aparecerá aqui</span>
                                            )}
                                            {isFailed && (
                                                <span className="text-xs text-red-400">Erro na geração. Tenta refinar.</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ── Aba Images */}
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
                                                            <span className="text-xs text-zinc-600">Cena {i + 1}</span>
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
                                            <span className="text-xs text-zinc-500">As imagens das cenas aparecerão aqui</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── Aba Video */}
                            {activeTab === "video" && (
                                <div className="flex flex-1 items-center justify-center">
                                    <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-yellow-400/20">
                                        <div className="h-full w-full bg-zinc-900" />
                                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                                            {jobStatus === "RENDERING" && (
                                                <>
                                                    <Film size={28} className="text-yellow-400/60" />
                                                    <span className="text-xs font-semibold text-yellow-400">A RENDERIZAR VÍDEO...</span>
                                                    <div className="h-0.5 w-28 overflow-hidden rounded-full bg-yellow-400/20">
                                                        <div className="h-full w-2/3 animate-pulse rounded-full bg-yellow-400" />
                                                    </div>
                                                </>
                                            )}
                                            {!gen && (
                                                <span className="text-xs text-zinc-500">O vídeo aparecerá aqui</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Metadata cards */}
                            <div className="grid w-full shrink-0 grid-cols-4 gap-3">
                                {[
                                    { label: "Tempo",    value: jobMeta?.settings?.tempo    ?? "—" },
                                    { label: "Genre",    value: jobMeta?.settings?.genre    ?? "—" },
                                    { label: "Duration", value: jobMeta?.settings?.duration ?? "—" },
                                    { label: "Mood",     value: jobMeta?.settings?.mood     ?? "—" },
                                ].map(item => (
                                    <div key={item.label} className="rounded-xl border border-yellow-400/20 bg-white/5 p-3">
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
