import { AudioLines } from "lucide-react";

export function meta() {
    return [{ title: "Armonyx" }];
}

export default function Home() {
    return (
        <div className="relative min-h-screen w-full">
            <header className="absolute top-15 left-1/2 z-30 w-full -translate-x-1/2">
                <div className="mx-auto flex max-w-350 justify-center">
                    <img
                        src="assets/logo.png"
                        alt="Logo"
                        className="w-50"
                    />
                </div>
            </header>

            <div className="absolute top-44 left-1/2 z-20 w-full max-w-350 -translate-x-1/2 px-6 md:top-45 md:px-8">
                <div className="mx-auto max-w-75 md:ml-20 md:max-w-225 lg:ml-32">
                    <div className="text-4xl font-bold leading-[1.1] md:text-5xl lg:text-4xl">
                        <span className="block text-white md:inline">
                            Create your next{" "}
                        </span>

                        <span className="mt-2 block text-yellow-400 md:mt-0 md:inline">
                            masterpiece
                        </span>
                    </div>

                    <p className="mt-5 text-left text-base leading-relaxed text-zinc-300 sm:text-lg md:mt-4 md:max-w-2xl md:text-lg lg:text-xl">
                        Describe your idea and let Armonyx compose
                        a unique track for you.
                    </p>
                </div>

                <div className="mt-20 flex w-full justify-center">
                    <div className="w-full max-w-5xl rounded-4xl border border-yellow-400/50 bg-black/40 p-4 backdrop-blur-xl md:px-5 md:py-4">
                        <div className="flex flex-col gap-4 md:flex-row md:items-center">
                            <div className="flex-1 rounded-3xl md:rounded-full">
                                <textarea
                                    rows={1}
                                    placeholder="Describe the music you want to create..."
                                    className="block min-h-12 max-h-40 w-full resize-none overflow-y-auto bg-transparent px-4 py-3 text-base leading-relaxed text-white placeholder:text-zinc-500 focus:outline-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden field-sizing-content"
                                />
                            </div>

                            <button className="flex h-12 w-full shrink-0 items-center justify-center gap-2 rounded-full bg-yellow-400 px-6 text-base font-semibold text-black hover:bg-yellow-300 md:w-44">
                                <AudioLines size={18} />
                                Generate
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}