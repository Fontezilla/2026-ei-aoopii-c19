import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router";
import { authService } from "~/services/authService";

export default function BackgroundSecureLayout() {
    const navigate = useNavigate();
    const [allowed, setAllowed] = useState(false);

    useEffect(() => {
        authService.me().then((user) => {
            if (!user) {
                navigate("/signin", { replace: true });
                return;
            }

            setAllowed(true);
        });
    }, [navigate]);

    if (!allowed) {
        return null;
    }

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
