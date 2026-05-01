import { ArrowRight, User } from "lucide-react";
import { Link } from "react-router";

export function meta() {
  return [
    { title: "Armonyx" },
  ];
}

export default function Home() {
  return (
    <div className="relative min-h-screen w-full text-white overflow-hidden">

      <header className="absolute top-25 left-1/2 z-20 -translate-x-1/2 md:top-8 md:left-8 md:translate-x-0">
        <img
          className="w-70 md:w-45"
          src="assets/logo.png"
          alt="Logo do site"
        />
      </header>

      <div className="flex min-h-screen w-full items-center justify-center px-6 pt-32 pb-24 md:justify-start md:px-16 md:pt-0">
        <div className="w-full max-w-md text-center md:max-w-full md:ml-20 md:text-left">
          <p className="mb-4 text-sm tracking-[0.3em] text-yellow-400 md:tracking-widest">
            AI Music Composer
          </p>
          <h1 className="text-4xl font-bold leading-tight sm:text-5xl md:text-6xl">
            Create <br />
            Your Own Music <br />
            With AI
          </h1>
          <p className="mt-6 text-base leading-relaxed text-zinc-300 sm:text-lg">
            Armonyx uses artificial intelligence to help you
            create unique and personalized music compositions.
          </p>

          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:justify-center md:justify-start">
            <Link
              to="/signin"
              className="flex items-center justify-center gap-2 rounded-full bg-yellow-400 px-6 py-3 font-medium text-black transition hover:bg-amber-300"
            >
              <span>Sign In</span>
              <ArrowRight size={18} />
            </Link>

            <Link
              to="/signup"
              className="flex items-center justify-center rounded-full border border-white/40 px-6 py-3 text-white/80 transition hover:bg-white/10 hover:text-white"
            >
              <span>Sign Up</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="absolute bottom-8 left-1/2 flex w-full max-w-md -translate-x-1/2 flex-col items-center gap-4 px-6 text-sm md:bottom-12 md:left-32 md:w-auto md:max-w-none md:translate-x-0 md:flex-row md:px-0">
        <p className="text-zinc-200">
          Creators of Armonyx:
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 md:flex-nowrap">
          <div className="flex items-center gap-2 rounded-full border border-yellow-400 px-3 py-1">
            <User size={14} className="text-yellow-400" />
            <a
              href="https://github.com/Fontezilla"
              className="text-yellow-400 transition hover:text-yellow-300"
            >
              Diogo Fontes
            </a>
          </div>

          <span className="hidden text-zinc-500 md:block">|</span>

          <div className="flex items-center gap-2 rounded-full border border-yellow-400 px-3 py-1">
            <User size={14} className="text-yellow-400" />
            <a
              href="https://github.com/SimaoMendes30"
              className="text-yellow-400 transition hover:text-yellow-300"
            >
              Simão Mendes
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}