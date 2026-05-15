import { Download, RefreshCw, ArrowUp } from "lucide-react";

export function meta() {
    return [{ title: "Armonyx — Generate" }];
}

type Message = { id: number; role: "user" | "ai"; text: string };

const messages: Message[] = [
    { id: 1, role: "user", text: "calm lofi beat with soft piano and rain sounds" },
    { id: 2, role: "ai", text: "Generating a melancholic lofi track at 70 BPM. Want to add vinyl crackle?" },
    { id: 3, role: "user", text: "yes add vinyl crackle, and make it a bit slower" },
    { id: 4, role: "ai", text: "Adjusting to 60 BPM and adding vinyl crackle texture. Regenerating now..." },
];

export default function Generate() {
    return (
        <div className="relative min-h-screen w-full">
            <header className="absolute left-1/2 top-12 z-30 w-full -translate-x-1/2">
                <div className="mx-auto flex max-w-7xl justify-center px-6">
                    <img src="/assets/logo.png" alt="Logo" className="w-48 md:w-52" />
                </div>
            </header>

            <main className="mx-auto w-full max-w-7xl px-6 pt-30 pb-10 md:px-10 lg:px-12">
                <div className="mx-auto flex h-[calc(100vh-11rem)] min-h-145 max-w-6xl overflow-hidden rounded-3xl border border-yellow-400/30 bg-black/60 shadow-2xl shadow-yellow-500/5 backdrop-blur-xl">
                    <div className="flex w-full flex-col border-r border-yellow-400/20 md:w-[42%]">
                        <div className="flex h-14 items-center justify-between border-b border-yellow-400/20 px-5">
                            <span className="text-sm font-semibold text-white">Refine with AI</span>
                            <span className="flex items-center gap-2 rounded-full border border-yellow-400/30 bg-yellow-400/10 px-3 py-1 text-xs font-semibold text-yellow-400">
                                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-400" />
                                Generating
                            </span>
                        </div>
                        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                            {messages.map((msg) => (
                                <div key={msg.id} className={`flex items-end gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${msg.role === "ai" ? "border border-yellow-400/30 bg-yellow-400/10 text-yellow-400" : "bg-zinc-800 text-zinc-300"}`}>
                                        {msg.role === "ai" ? "AI" : "U"}
                                    </div>
                                    <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${msg.role === "ai" ? "rounded-bl-sm border border-yellow-400/20 bg-white/5 text-zinc-300" : "rounded-br-sm bg-yellow-400 font-medium text-black"}`}>
                                        {msg.text}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="border-t border-yellow-400/20 p-4">
                            <div className="flex items-end gap-2 rounded-2xl border border-yellow-400/30 bg-white/5 px-4 py-3">
                                <textarea
                                    rows={1}
                                    placeholder="Change mood, tempo, instruments..."
                                    className="max-h-24 flex-1 resize-none bg-transparent text-sm text-white placeholder:text-zinc-500 focus:outline-none field-sizing-content [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                                />
                                <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-yellow-400 hover:bg-yellow-300 active:scale-95">
                                    <ArrowUp size={15} className="text-black" />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="hidden flex-1 flex-col md:flex">
                        <div className="flex h-14 items-center justify-between border-b border-yellow-400/20 px-5">
                            <span className="text-sm font-semibold text-white">Preview</span>
                            <div className="flex gap-2">
                                <button className="flex items-center gap-1.5 rounded-full bg-yellow-400 px-4 py-1.5 text-xs font-bold text-black hover:bg-yellow-300 active:scale-95">
                                    <Download size={12} /> Save
                                </button>
                            </div>
                        </div>
                        <div className="flex flex-1 flex-col items-center justify-center gap-5 p-6">
                            <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-yellow-400/20">
                                <div className="h-full w-full bg-zinc-900" />
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                                    <span className="text-xs font-semibold text-yellow-400">GENERATING...</span>
                                    <div className="h-0.5 w-28 overflow-hidden rounded-full bg-yellow-400/20">
                                        <div className="h-full w-2/3 rounded-full bg-yellow-400" />
                                    </div>
                                </div>
                            </div>
                            <div className="grid w-full grid-cols-4 gap-3">
                                {[{ label: "Tempo", value: "60 BPM" }, { label: "Genre", value: "Lofi" }, { label: "Duration", value: "3:24" }, { label: "Mood", value: "Melancholic" }].map((item) => (
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