import { Link } from "react-router";
import { ArrowRight, AudioLines, Play } from "lucide-react";

export function meta() {
    return [{ title: "Armonyx" }];
}

const cards = [
    {
        id: 1,
        image: "https://static0.cbrimages.com/wordpress/wp-content/uploads/2020/04/Law.jpg?q=50&fit=crop&w=825&dpr=1.5",
        title: "Track Preview 1",
    },
    {
        id: 2,
        image: "https://static0.cbrimages.com/wordpress/wp-content/uploads/2020/04/Law.jpg?q=50&fit=crop&w=825&dpr=1.5",
        title: "Track Preview 2",
    },
    {
        id: 3,
        image: "https://static0.cbrimages.com/wordpress/wp-content/uploads/2020/04/Law.jpg?q=50&fit=crop&w=825&dpr=1.5",
        title: "Track Preview 3",
    },
];

export default function Home() {
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
                            placeholder="Describe the music you want to create..."
                            className="block min-h-12 max-h-36 w-full resize-none bg-transparent px-4 py-3 text-base text-white placeholder:text-zinc-500 focus:outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden field-sizing-content"
                        />
                        <div className="flex justify-end p-1">
                            <button
                                type="button"
                                className="flex h-10 w-full items-center justify-center gap-2 rounded-full bg-yellow-400 px-6 text-sm font-bold text-black hover:bg-yellow-300 active:scale-95 sm:w-40"
                            >
                                <AudioLines size={16} />
                                Generate
                            </button>
                        </div>
                    </div>
                    <div className="mt-8 flex w-full flex-col gap-6 lg:flex-row lg:items-center">
                        <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                            {cards.map((card) => (
                                <div
                                    key={card.id}
                                    className="rounded-2xl border border-yellow-400/30 bg-black/70 p-3 shadow-xl shadow-yellow-500/5 backdrop-blur-xl"
                                >
                                    <div className="overflow-hidden rounded-xl">
                                        <img
                                            src={card.image}
                                            alt={card.title}
                                            className="h-40 w-full object-cover opacity-80"
                                        />
                                    </div>
                                    <p className="mt-2 px-1 text-sm font-medium text-zinc-300">
                                        {card.title}
                                    </p>
                                    <div className="mt-2 flex justify-center">
                                        <button
                                            type="button"
                                            className="flex h-8 w-full items-center justify-center gap-1.5 rounded-full bg-yellow-400 text-sm font-bold text-black hover:bg-yellow-300 active:scale-95"
                                        >
                                            <Play size={14} />
                                            Play
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="flex justify-center lg:justify-start">
                            <Link
                                to="/app/history"
                                className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-yellow-400/50 bg-black/70 px-8 text-sm font-bold uppercase tracking-wider text-yellow-400 backdrop-blur-xl hover:bg-yellow-400 hover:text-black active:scale-95 active:bg-yellow-400 active:text-black lg:w-40"
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