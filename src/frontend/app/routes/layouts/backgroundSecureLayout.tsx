import { Outlet } from "react-router";

export default function BackgroundSecureLayout() {
    return (
        <div className="relative w-full min-h-screen overflow-hidden">

            <div
                className="hidden md:block absolute inset-0 bg-cover bg-center bg-no-repeat"
                style={{ backgroundImage: "url('/assets/homeBackground.png')" }}
            />
            <div className="absolute inset-0 bg-black/50" />

            <div className="md:hidden absolute inset-0 bg-linear-to-br from-black via-[#1a1200] to-[#facc15]" />

            <div className="absolute inset-0 bg-black/30" />

            <Outlet />
        </div>
    );
}