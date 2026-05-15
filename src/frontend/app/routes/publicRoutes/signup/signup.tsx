import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { Link } from "react-router";
import { useSignUpForm } from "./sigup";

export function meta() {
    return [{ title: "Armonyx" }];
}

export default function SignUp() {
    const {
        form,
        showPassword,
        showConfirmPassword,
        error,
        loading,
        handleChange,
        handleSubmit,
        togglePassword,
        toggleConfirmPassword,
    } = useSignUpForm();

    return (
        <div className="relative min-h-screen w-full text-white">
            <header className="absolute top-12 left-1/2 z-20 -translate-x-1/2 md:top-8 md:left-8 md:translate-x-0">
                <img
                    className="w-70 md:w-45"
                    src="assets/logo.png"
                    alt="Logo do site"
                />
            </header>

            <div className="flex min-h-screen w-full items-center justify-center px-5 pt-28 pb-10 md:justify-start md:px-0 md:items-start md:pt-28">
                <div className="flex w-full items-center justify-center md:w-[60%]">
                    <div className="w-full max-w-95 rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-2xl sm:max-w-105 sm:p-8 md:w-105">
                        <h1 className="text-center text-4xl font-bold md:text-3xl">
                            Sign Up
                        </h1>
                        <p className="mt-4 mb-8 text-center text-base leading-relaxed text-zinc-300 md:text-sm">
                            Create your Armonyx account! <br />
                            Start composing your own music with AI.
                        </p>

                        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                            <div>
                                <label className="mb-2 block text-sm text-zinc-300">
                                    Full Name
                                </label>
                                <input
                                    type="text"
                                    name="name"
                                    value={form.name}
                                    onChange={handleChange}
                                    placeholder="Enter your full name"
                                    className="w-full rounded-2xl border border-white/15 bg-transparent px-5 py-4 text-base placeholder:text-zinc-500 focus:border-yellow-400 focus:outline-none"
                                />
                            </div>

                            <div>
                                <label className="mb-2 block text-sm text-zinc-300">
                                    Email
                                </label>
                                <input
                                    type="email"
                                    name="email"
                                    value={form.email}
                                    onChange={handleChange}
                                    placeholder="Enter your email"
                                    className="w-full rounded-2xl border border-white/15 bg-transparent px-5 py-4 text-base placeholder:text-zinc-500 focus:border-yellow-400 focus:outline-none"
                                />
                            </div>

                            <div>
                                <label className="mb-2 block text-sm text-zinc-300">
                                    Password
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        name="password"
                                        value={form.password}
                                        onChange={handleChange}
                                        placeholder="Create a password"
                                        className="w-full rounded-2xl border border-white/15 bg-transparent px-5 py-4 pr-14 text-base placeholder:text-zinc-500 focus:border-yellow-400 focus:outline-none"
                                    />
                                    <button
                                        type="button"
                                        onClick={togglePassword}
                                        className="absolute top-1/2 right-4 -translate-y-1/2 text-zinc-400 hover:text-white"
                                    >
                                        {showPassword ? (
                                            <EyeOff size={20} />
                                        ) : (
                                            <Eye size={20} />
                                        )}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="mb-2 block text-sm text-zinc-300">
                                    Confirm Password
                                </label>
                                <div className="relative">
                                    <input
                                        type={showConfirmPassword ? "text" : "password"}
                                        name="confirmPassword"
                                        value={form.confirmPassword}
                                        onChange={handleChange}
                                        placeholder="Confirm your password"
                                        className="w-full rounded-2xl border border-white/15 bg-transparent px-5 py-4 pr-14 text-base placeholder:text-zinc-500 focus:border-yellow-400 focus:outline-none"
                                    />
                                    <button
                                        type="button"
                                        onClick={toggleConfirmPassword}
                                        className="absolute top-1/2 right-4 -translate-y-1/2 text-zinc-400 hover:text-white"
                                    >
                                        {showConfirmPassword ? (
                                            <EyeOff size={20} />
                                        ) : (
                                            <Eye size={20} />
                                        )}
                                    </button>
                                </div>
                            </div>
                            {error && (
                                <p className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                                    {error}
                                </p>
                            )}
                            <button
                                type="submit"
                                disabled={loading}
                                className="mt-2 flex w-full items-center justify-center gap-3 rounded-full bg-yellow-400 py-4 text-lg font-semibold text-black hover:bg-amber-300"
                            >
                                {loading ? "Creating..." : "Sign Up"}
                                <ArrowRight size={20} />
                            </button>
                            <p className="mt-4 text-center text-sm leading-relaxed text-zinc-400">
                                Already have an account?{" "}
                                <Link
                                    to="/signin"
                                    className="font-medium text-yellow-400 hover:text-yellow-300"
                                >
                                    Sign In
                                </Link>
                            </p>
                        </form>
                    </div>
                </div>
                <div className="hidden md:block md:w-[40%]" />
            </div>
        </div>
    );
}
