import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowRight, AudioLines, Camera, Film, LogOut, Music, Play } from "lucide-react";
import { authService, type AuthUser } from "~/services/authService";

export function meta() {
    return [{ title: "Armonyx" }];
}

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

interface Job {
    id: string;
    theme?: string | null;
    prompt?: string | null;
    status?: string | null;
    video_path?: string | null;
    first_image?: string | null;
}

function getUserDisplayName(user: AuthUser | null) {
    return (
        user?.username?.trim() ||
        user?.email?.split("@")[0]?.trim() ||
        "User"
    );
}

function getFirstNameInitial(user: AuthUser | null) {
    const displayName = getUserDisplayName(user);
    const firstName = displayName.split(" ").filter(Boolean)[0];

    return firstName?.charAt(0).toUpperCase() || "U";
}

export default function Home() {
    const navigate = useNavigate();
    const [prompt, setPrompt] = useState("");

    const handleGenerate = () => {
        const cleanPrompt = prompt.trim();

        if (!cleanPrompt) {
            return;
        }

        navigate("/app/generate", {
            state: { initialPrompt: cleanPrompt },
        });
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key !== "Enter" || e.shiftKey) {
            return;
        }

        e.preventDefault();
        handleGenerate();
    };

    return (
        <div className="relative min-h-screen w-full overflow-x-hidden">
            <UserMenu />

            <header className="absolute left-1/2 top-12 z-30 w-full -translate-x-1/2">
                <div className="mx-auto flex max-w-7xl justify-center px-6">
                    <img
                        src="/assets/logo.png"
                        alt="Logo"
                        className="w-48 md:w-52"
                    />
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
                                className="flex h-10 w-full items-center justify-center gap-2 rounded-full bg-yellow-400 px-6 text-sm font-bold text-black hover:bg-yellow-300 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 sm:w-40"
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
                                prefetch="intent"
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

function UserMenu() {
    const navigate = useNavigate();
    const menuRef = useRef<HTMLDivElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [user, setUser] = useState<AuthUser | null>(() => authService.getStoredUser());

    useEffect(() => {
        setUser(authService.getStoredUser());
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (!menuRef.current) {
                return;
            }

            if (!menuRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleEscape);

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleEscape);
        };
    }, []);

    const handleAvatarChange = async (
        event: React.ChangeEvent<HTMLInputElement>
    ) => {
        const file = event.target.files?.[0];

        if (!file) {
            return;
        }

        if (!file.type.startsWith("image/")) {
            alert("Seleciona uma imagem válida.");
            event.target.value = "";
            return;
        }

        setUploadingAvatar(true);

        try {
            const updatedUser = await authService.updateAvatar(file);
            setUser(updatedUser);
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : "Erro ao atualizar avatar.";

            alert(message);
        } finally {
            setUploadingAvatar(false);
            event.target.value = "";
        }
    };

    const handleSignOut = async () => {
        if (loading) {
            return;
        }

        setLoading(true);

        try {
            await authService.logout();
            navigate("/signin", { replace: true });
        } finally {
            setLoading(false);
        }
    };

    const displayName = getUserDisplayName(user);
    const initial = getFirstNameInitial(user);

    return (
        <div ref={menuRef} className="absolute right-6 top-8 z-40 md:right-10">
            <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleAvatarChange}
            />

            <button
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-yellow-400/70 bg-black/75 text-sm font-bold text-yellow-400 shadow-lg shadow-yellow-500/10 backdrop-blur-xl transition hover:border-yellow-400 hover:bg-yellow-400 hover:text-black active:scale-95"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label="Open user menu"
            >
                {user?.avatar_url ? (
                    <img
                        src={user.avatar_url}
                        alt="Avatar"
                        className="h-full w-full object-cover"
                    />
                ) : (
                    <span>{initial}</span>
                )}
            </button>

            {open && (
                <div
                    role="menu"
                    className="absolute right-0 mt-3 w-64 overflow-hidden rounded-2xl border border-yellow-400/20 bg-black/90 p-2 shadow-2xl shadow-yellow-500/10 backdrop-blur-xl"
                >
                    <div className="border-b border-white/10 px-3 py-3">
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploadingAvatar}
                                className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-yellow-400/40 bg-yellow-400 text-sm font-bold text-black disabled:cursor-not-allowed disabled:opacity-60"
                                aria-label="Change avatar"
                            >
                                {user?.avatar_url ? (
                                    <img
                                        src={user.avatar_url}
                                        alt="Avatar"
                                        className="h-full w-full object-cover"
                                    />
                                ) : (
                                    <span>{initial}</span>
                                )}

                                <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition hover:opacity-100">
                                    <Camera size={16} className="text-white" />
                                </span>
                            </button>

                            <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-white">
                                    {displayName}
                                </p>

                                {user?.email && (
                                    <p className="truncate text-xs text-zinc-500">
                                        {user.email}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingAvatar}
                        className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-zinc-300 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <Camera size={16} className="text-yellow-400" />
                        {uploadingAvatar ? "Uploading..." : "Change photo"}
                    </button>

                    <button
                        type="button"
                        role="menuitem"
                        onClick={handleSignOut}
                        disabled={loading}
                        className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-zinc-300 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <LogOut size={16} className="text-yellow-400" />
                        {loading ? "Signing out..." : "Sign out"}
                    </button>
                </div>
            )}
        </div>
    );
}

function RecentTracks() {
    const navigate = useNavigate();

    const [jobs, setJobs] = useState<Job[]>([]);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        let active = true;

        fetch(`${API_URL}/job/history`, { credentials: "include" })
            .then((response) => {
                if (!response.ok) {
                    throw new Error("Erro ao carregar histórico.");
                }

                return response.json();
            })
            .then((data) => {
                if (!active) {
                    return;
                }

                setJobs((data.jobs || []).slice(0, 3));
                setLoaded(true);
            })
            .catch(() => {
                if (!active) {
                    return;
                }

                setLoaded(true);
            });

        return () => {
            active = false;
        };
    }, []);

    if (!loaded) {
        return (
            <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {[1, 2, 3].map((item) => (
                    <div
                        key={item}
                        className="h-52 animate-pulse rounded-2xl border border-yellow-400/20 bg-white/5"
                    />
                ))}
            </div>
        );
    }

    if (jobs.length === 0) {
        return (
            <div className="flex flex-1 items-center justify-center rounded-2xl border border-yellow-400/20 bg-black/30 py-10">
                <p className="text-sm text-zinc-500">
                    No tracks yet. Create your first one!
                </p>
            </div>
        );
    }

    return (
        <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {jobs.map((job) => {
                const title = job.theme || job.prompt || "Untitled";
                const videoSrc = job.video_path ? `${API_URL}/outputs/${job.video_path}` : null;
                const imageSrc = job.first_image ? `${API_URL}/outputs/${job.first_image}` : null;

                return (
                    <div
                        key={job.id}
                        className="group overflow-hidden rounded-2xl border border-yellow-400/30 bg-black/70 shadow-xl shadow-yellow-500/5 backdrop-blur-xl"
                    >
                        <div className="relative h-40 overflow-hidden bg-zinc-900">
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
                                <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-linear-to-br from-zinc-900 to-black px-4 text-center">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-yellow-400/20 bg-yellow-400/8">
                                        <Music size={16} className="text-yellow-400/60" />
                                    </div>
                                    <span className="text-xs font-medium text-zinc-500 line-clamp-2 leading-snug">
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
                        </div>

                        <div className="p-3">
                            <p className="truncate px-1 text-sm font-medium text-zinc-300">
                                {title}
                            </p>

                            <div className="mt-2 flex justify-center">
                                <button
                                    type="button"
                                    onClick={() =>
                                        navigate("/app/generate", {
                                            state: { jobId: job.id },
                                        })
                                    }
                                    className="flex h-8 w-full items-center justify-center gap-1.5 rounded-full bg-yellow-400 text-sm font-bold text-black hover:bg-yellow-300 active:scale-95"
                                >
                                    <Play size={14} />
                                    Open
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}