import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Download, Film, Music, Play } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export function meta() {
    return [{ title: "Armonyx — History" }];
}

interface Job {
    id: string;
    theme?: string | null;
    prompt?: string | null;
    status?: string | null;
    output_path?: string | null;
    video_path?: string | null;
    first_image?: string | null;
    created_at?: string | null;
}

function formatDate(value?: string | null) {
    if (!value) {
        return "Sem data";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "Sem data";
    }

    return date.toLocaleDateString("pt-PT", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}

function getTrackTitle(job: Job) {
    return job.theme?.trim() || job.prompt?.trim() || "Untitled";
}

function getTrackPrompt(job: Job) {
    return job.prompt?.trim() || job.theme?.trim() || "Sem descrição";
}

export default function History() {
    const navigate = useNavigate();

    const [jobs, setJobs] = useState<Job[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        async function loadHistory() {
            try {
                setLoading(true);
                setError(null);

                const response = await fetch(`${API_URL}/job/history`, {
                    credentials: "include",
                });

                if (!response.ok) {
                    throw new Error("Erro ao carregar o histórico.");
                }

                const data = await response.json();

                if (!active) {
                    return;
                }

                setJobs(data.jobs ?? []);
            } catch (err) {
                if (!active) {
                    return;
                }

                const message =
                    err instanceof Error
                        ? err.message
                        : "Erro ao carregar o histórico.";

                setError(message);
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        }

        loadHistory();

        return () => {
            active = false;
        };
    }, []);

    return (
        <div className="relative min-h-screen w-full overflow-x-hidden">
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

            <main className="mx-auto w-full max-w-7xl px-6 pt-44 pb-20 md:px-10 lg:px-12">
                <div className="mx-auto w-full max-w-5xl">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <h1 className="text-4xl font-bold text-white md:text-5xl">
                                History
                            </h1>

                            <p className="mt-2 text-sm text-zinc-500">
                                {loading
                                    ? "A carregar histórico..."
                                    : `${jobs.length} AMV generated`}
                            </p>
                        </div>
                    </div>

                    {loading && (
                        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                            {[1, 2, 3, 4, 5, 6].map((item) => (
                                <div
                                    key={item}
                                    className="h-72 animate-pulse rounded-2xl border border-yellow-400/20 bg-white/5"
                                />
                            ))}
                        </div>
                    )}

                    {!loading && error && (
                        <div className="mt-10 rounded-2xl border border-red-400/30 bg-red-500/10 px-5 py-4 text-sm text-red-200">
                            {error}
                        </div>
                    )}

                    {!loading && !error && jobs.length === 0 && (
                        <div className="mt-10 flex min-h-60 items-center justify-center rounded-2xl border border-yellow-400/20 bg-black/40 px-6 text-center">
                            <p className="text-sm text-zinc-500">
                                You haven't generated any AMVs yet.
                            </p>
                        </div>
                    )}

                    {!loading && !error && jobs.length > 0 && (
                        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                            {jobs.map((job) => {
                                const title = getTrackTitle(job);
                                const videoSrc = job.video_path ? `${API_URL}/outputs/${job.video_path}` : null;
                                const imageSrc = job.first_image ? `${API_URL}/outputs/${job.first_image}` : null;
                                const audioSrc = job.output_path
                                    ? (() => {
                                        const parts = job.output_path.split(/[/\\]/);
                                        const rel = parts[parts.length - 2] === "outputs"
                                            ? parts[parts.length - 1]
                                            : parts.slice(-2).join("/");
                                        return `${API_URL}/outputs/${rel}`;
                                    })()
                                    : null;

                                return (
                                    <div
                                        key={job.id}
                                        className="group overflow-hidden rounded-2xl border border-yellow-400/30 bg-black/70 shadow-xl shadow-yellow-500/5 backdrop-blur-xl"
                                    >
                                        <div className="relative aspect-video overflow-hidden bg-zinc-900">
                                            {videoSrc ? (
                                                <video
                                                    src={videoSrc}
                                                    muted
                                                    loop
                                                    playsInline
                                                    preload="metadata"
                                                    className="h-full w-full object-cover opacity-80 transition duration-300 group-hover:opacity-100"
                                                    onMouseEnter={(e) => (e.currentTarget as HTMLVideoElement).play()}
                                                    onMouseLeave={(e) => { (e.currentTarget as HTMLVideoElement).pause(); (e.currentTarget as HTMLVideoElement).currentTime = 0; }}
                                                />
                                            ) : imageSrc ? (
                                                <img
                                                    src={imageSrc}
                                                    alt={title}
                                                    className="h-full w-full object-cover opacity-80 transition duration-300 group-hover:scale-105 group-hover:opacity-100"
                                                />
                                            ) : (
                                                <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-linear-to-br from-zinc-900 to-black px-4 text-center">
                                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-yellow-400/20 bg-yellow-400/8">
                                                        {job.status === "COMPLETED" ? (
                                                            <Music size={18} className="text-yellow-400/60" />
                                                        ) : (
                                                            <Film size={18} className="text-zinc-600" />
                                                        )}
                                                    </div>
                                                    <span className="text-xs font-medium text-zinc-500 leading-snug line-clamp-2">
                                                        {title}
                                                    </span>
                                                </div>
                                            )}

                                            {videoSrc && (
                                                <div className="absolute top-2 left-2 flex items-center gap-1 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-yellow-400">
                                                    <Film size={10} />
                                                    Video
                                                </div>
                                            )}

                                            <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition group-hover:opacity-100">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        navigate("/app/generate", {
                                                            state: { jobId: job.id },
                                                        })
                                                    }
                                                    className="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-400 active:scale-95"
                                                >
                                                    <Play size={20} className="text-black" />
                                                </button>
                                            </div>

                                            <span className="absolute right-2 bottom-2 rounded-md bg-black/80 px-2 py-0.5 text-xs font-semibold text-white">
                                                {job.status === "COMPLETED" ? "ready" : job.status?.toLowerCase() ?? "—"}
                                            </span>
                                        </div>

                                        <div className="p-4">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="truncate text-sm font-semibold text-white">
                                                    {title}
                                                </p>
                                                <span className="shrink-0 rounded-full border border-yellow-400/30 bg-yellow-400/10 px-2.5 py-0.5 text-xs font-semibold text-yellow-400">
                                                    AI
                                                </span>
                                            </div>

                                            <div className="mt-3 flex items-center justify-between">
                                                <span className="text-xs text-zinc-600">
                                                    {formatDate(job.created_at)}
                                                </span>

                                                <div className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            navigate("/app/generate", {
                                                                state: { jobId: job.id },
                                                            })
                                                        }
                                                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-yellow-400/20 bg-black/50 text-zinc-500 hover:border-yellow-400/50 hover:text-yellow-400 active:scale-95"
                                                    >
                                                        <Play size={14} />
                                                    </button>

                                                    {audioSrc && (
                                                        <a
                                                            href={audioSrc}
                                                            download
                                                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-yellow-400/20 bg-black/50 text-zinc-500 hover:border-yellow-400/50 hover:text-yellow-400 active:scale-95"
                                                        >
                                                            <Download size={14} />
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}