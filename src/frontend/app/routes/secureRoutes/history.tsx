import { Play, Download } from "lucide-react";

export function meta() {
    return [{ title: "Armonyx — History" }];
}

const tracks = [
    {
        id: 1,
        title: "Dark Resolve",
        prompt: "calm lofi beat with soft piano and rain sounds",
        duration: "2:34",
        date: "14 May",
        genre: "lofi",
        image: "https://static0.cbrimages.com/wordpress/wp-content/uploads/2020/04/Law.jpg?q=50&fit=crop&w=825&dpr=1.5",
    },
    {
        id: 2,
        title: "Last Stand",
        prompt: "epic orchestral battle theme with heavy drums",
        duration: "3:12",
        date: "13 May",
        genre: "epic",
        image: "https://static0.cbrimages.com/wordpress/wp-content/uploads/2020/04/Law.jpg?q=50&fit=crop&w=825&dpr=1.5",
    },
    {
        id: 3,
        title: "Neon Drift",
        prompt: "upbeat synthwave with 80s vibes and neon energy",
        duration: "4:05",
        date: "12 May",
        genre: "synthwave",
        image: "https://static0.cbrimages.com/wordpress/wp-content/uploads/2020/04/Law.jpg?q=50&fit=crop&w=825&dpr=1.5",
    },
    {
        id: 4,
        title: "Neon Drift",
        prompt: "upbeat synthwave with 80s vibes and neon energy",
        duration: "4:05",
        date: "12 May",
        genre: "synthwave",
        image: "https://static0.cbrimages.com/wordpress/wp-content/uploads/2020/04/Law.jpg?q=50&fit=crop&w=825&dpr=1.5",
    },
    {
        id: 5,
        title: "Neon Drift",
        prompt: "upbeat synthwave with 80s vibes and neon energy",
        duration: "4:05",
        date: "12 May",
        genre: "synthwave",
        image: "https://static0.cbrimages.com/wordpress/wp-content/uploads/2020/04/Law.jpg?q=50&fit=crop&w=825&dpr=1.5",
    },
];

export default function History() {
    return (
        <div className="relative min-h-screen w-full overflow-x-hidden">
            <header className="absolute left-1/2 top-12 z-30 w-full -translate-x-1/2">
                <div className="mx-auto flex max-w-7xl justify-center px-6">
                    <img src="/assets/logo.png" alt="Logo" className="w-48 md:w-52" />
                </div>
            </header>

            <main className="mx-auto w-full max-w-7xl px-6 pt-44 pb-20 md:px-10 lg:px-12">
                <div className="mx-auto w-full max-w-5xl">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div>
                            <h1 className="text-4xl font-bold text-white md:text-5xl">History</h1>
                            <p className="mt-2 text-sm text-zinc-500">{tracks.length} AMVs gerados</p>
                        </div>
                    </div>
                    <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                        {tracks.map((track) => (
                            <div
                                key={track.id}
                                className="group rounded-2xl border border-yellow-400/30 bg-black/70 overflow-hidden backdrop-blur-xl shadow-xl shadow-yellow-500/5"
                            >
                                <div className="relative aspect-video overflow-hidden">
                                    <img
                                        src={track.image}
                                        alt={track.title}
                                        className="h-full w-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105"
                                    />
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center">
                                        <button className="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-400 active:scale-95">
                                            <Play size={20} className="text-black" />
                                        </button>
                                    </div>
                                    <span className="absolute bottom-2 right-2 rounded-md bg-black/80 px-2 py-0.5 text-xs font-semibold text-white">
                                        {track.duration}
                                    </span>
                                </div>

                                <div className="p-4">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="truncate text-sm font-semibold text-white">{track.title}</p>
                                        <span className="shrink-0 rounded-full border border-yellow-400/30 bg-yellow-400/10 px-2.5 py-0.5 text-xs font-semibold text-yellow-400">
                                            {track.genre}
                                        </span>
                                    </div>
                                    <p className="mt-1 truncate text-xs text-zinc-500">"{track.prompt}"</p>

                                    <div className="mt-3 flex items-center justify-between">
                                        <span className="text-xs text-zinc-600">{track.date}</span>
                                        <div className="flex gap-2">
                                            <button className="flex h-8 w-8 items-center justify-center rounded-lg border border-yellow-400/20 bg-black/50 text-zinc-500 hover:border-yellow-400/50 hover:text-yellow-400 active:scale-95">
                                                <Download size={14} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                </div>
            </main>
        </div>
    );
}