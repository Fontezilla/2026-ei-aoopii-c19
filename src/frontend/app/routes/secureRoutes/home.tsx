import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowRight, AudioLines, Play } from "lucide-react";
import { authService } from "~/services/authService";

export function meta() {
    return [{ title: "Armonyx" }];
}

export default function Home() {
    const navigate = useNavigate();
    const [prompt, setPrompt] = useState("");

    const handleGenerate = () => {
        if (!prompt.trim()) return;
        navigate("/app/generate", { state: { initialPrompt: prompt.trim() } });
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleGenerate();
        }
    };

    return (
        <div className="relative min-h-screen w-full overflow-x-hidden">
            <header className="absolute left-1/2 top-12 z-30 w-full -translate-x-1/2">
                <div className="mx-auto flex max-w-7xl justify-center px-6">
                    <img src="assets/logo.png" alt="Logo" className="w-48 md:w-52" />
                </div>
            </header>

            <main className="mx-auto w-full max-w-7xl px-6 pt-44 pb-20 md:px-10 lg:px-12">
                <div className="mx-auto w-full max-w-5xl">
                    <h1 className="text-4xl font-bold leading-tight text-white md:text-6xl">
                        Create your next{" "}
                        <span className="text-yellow-400">masterpiece</span>
                    </h1>
                    <p className="mt-4 text-base text-zinc-400 sm:text-lg">
                        Describe your idea and let Armonyx compose a unique track for you.
                    </p>

                    <div className="mt-12 w-full rounded-3xl border border-yellow-400/30 bg-black/50 p-3 shadow-2xl shadow-yellow-500/10 backdrop-blur-xl">
                        <textarea
                            rows={1}
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Describe the music you want to create..."
                            className="block min-h-12 max-h-36 w-full resize-none bg-transparent px-4 py-3 text-base text-white placeholder:text-zinc-500 focus:outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden field-sizing-content"
                        />
                        <div className="flex justify-end p-1">
                            <button
                                type="button"
                                onClick={handleGenerate}
                                disabled={!prompt.trim()}
                                className="flex h-10 w-full items-center justify-center gap-2 rounded-full bg-yellow-400 px-6 text-sm font-bold text-black hover:bg-yellow-300 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed sm:w-40"
                            >
                                <AudioLines size={16} />
                                Generate
                            </button>
                        </div>
                    </div>

                    <div className="mt-8 flex w-full flex-col gap-6 lg:flex-row lg:items-center">
                        <RecentTracks />
                        <div className="flex justify-center lg:justify-start">
                            <Link
                                to="/app/history"
                                className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-yellow-400/50 bg-black/70 px-8 text-sm font-bold uppercase tracking-wider text-yellow-400 backdrop-blur-xl hover:bg-yellow-400 hover:text-black active:scale-95 lg:w-40"
                            >
                                View All
                                <ArrowRight size={13} />
                            </Link>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}

// ── Últimos jobs do utilizador ────────────────────────────────────────────────
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

function RecentTracks() {
    const navigate = useNavigate();
    const [jobs, setJobs] = useState<any[]>([]);
    const [loaded, setLoaded] = useState(false);

    // Carrega jobs ao montar
    useEffect(() => {
        fetch(`${API_URL}/job/history`, { credentials: "include" })
            .then((r) => r.json())
            .then((data) => {
                setJobs((data.jobs || []).slice(0, 3));
                setLoaded(true);
            })
            .catch(() => setLoaded(true));
    }, []);

    // Placeholder enquanto carrega
    if (!loaded) {
        return (
            <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="h-52 animate-pulse rounded-2xl border border-yellow-400/20 bg-white/5" />
                ))}
            </div>
        );
    }

    // Sem jobs ainda
    if (jobs.length === 0) {
        return (
            <div className="flex flex-1 items-center justify-center rounded-2xl border border-yellow-400/20 bg-black/30 py-10">
                <p className="text-sm text-zinc-500">No tracks yet. Create your first one!</p>
            </div>
        );
    }

    return (
        <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {jobs.map((job) => (
                <div
                    key={job.id}
                    className="rounded-2xl border border-yellow-400/30 bg-black/70 p-3 shadow-xl shadow-yellow-500/5 backdrop-blur-xl"
                >
                    <div className="flex h-40 items-center justify-center overflow-hidden rounded-xl bg-zinc-900">
                        <span className="text-xs text-zinc-500">{job.theme || "Untitled"}</span>
                    </div>
                    <p className="mt-2 px-1 text-sm font-medium text-zinc-300 truncate">
                        {job.theme || "Untitled"}
                    </p>
                    <div className="mt-2 flex justify-center">
                        <button
                            type="button"
                            onClick={() => navigate(`/app/generate`, { state: { jobId: job.id } })}
                            className="flex h-8 w-full items-center justify-center gap-1.5 rounded-full bg-yellow-400 text-sm font-bold text-black hover:bg-yellow-300 active:scale-95"
                        >
                            <Play size={14} />
                            Open
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}