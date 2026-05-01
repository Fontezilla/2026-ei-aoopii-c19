import { Outlet } from "react-router";

export default function BackgroundPublicLayout() {
    return (
        <div className="fixed inset-0 w-screen h-screen overflow-hidden">

            <div className="hidden md:block absolute inset-0">
                <video
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="absolute inset-0 w-full h-full object-cover"
                >
                    <source src="assets/landescapeBackground.mp4" type="video/mp4" />
                </video>
            </div>

            <div className="md:hidden absolute inset-0 bg-linear-to-br from-black via-[#1a1200] to-[#facc15]" />

            <div className="absolute inset-0 bg-linear-to-tr from-black via-black/70 to-transparent" />

            <div className="relative z-10 h-full w-full">
                <Outlet />
            </div>
        </div>
    );
}