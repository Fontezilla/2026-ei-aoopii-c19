import {
    AnimatePresence,
    motion,
    useReducedMotion,
} from "framer-motion";
import { Outlet, useBlocker, useLocation } from "react-router";
import { useEffect, useMemo, useRef, useState } from "react";

const BAR_COUNT = 28;
const WAVE_DURATION = 0.65;
const LOADER_DURATION_MS = WAVE_DURATION * 1000 + 200;
const PAGE_FADE_DURATION_MS = 350;

function generateBarKeyframes(count: number): number[][] {
    return Array.from({ length: count }, () => [
        0.15,
        Math.random() * 0.7 + 0.3,
        Math.random() * 0.5 + 0.5,
        Math.random() * 0.8 + 0.2,
        0.15,
    ]);
}

function WaveformLoader() {
    const prefersReducedMotion = useReducedMotion();
    const barKeyframes = useMemo(() => generateBarKeyframes(BAR_COUNT), []);

    if (prefersReducedMotion) return null;

    return (
        <motion.div
            aria-hidden
            role="presentation"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm pointer-events-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
        >
            <div className="flex items-center gap-0.75">
                {barKeyframes.map((keyframes, i) => {
                    const progress = i / BAR_COUNT;
                    const hue = 40 + progress * 10;
                    const lightness = 52 + progress * 10;

                    return (
                        <motion.div
                            key={i}
                            className="rounded-full"
                            style={{
                                width: "3px",
                                height: "56px",
                                background: `hsl(${hue}, 95%, ${lightness}%)`,
                                boxShadow: `0 0 10px hsl(${hue}, 95%, ${lightness}%)`,
                                transformOrigin: "center",
                            }}
                            initial={{ scaleY: 0.15 }}
                            animate={{ scaleY: keyframes }}
                            transition={{
                                duration: WAVE_DURATION,
                                delay: i * 0.008,
                                ease: "easeInOut",
                                repeat: Infinity,
                                repeatType: "mirror",
                            }}
                        />
                    );
                })}
            </div>
        </motion.div>
    );
}

export default function PageTransition() {
    const location = useLocation();
    const prefersReducedMotion = useReducedMotion();
    const [showLoader, setShowLoader] = useState(false);
    const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hideLoaderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const blocker = useBlocker(({ currentLocation, nextLocation }) => {
        return (
            !prefersReducedMotion &&
            currentLocation.pathname !== nextLocation.pathname
        );
    });

    useEffect(() => {
        return () => {
            if (transitionTimeoutRef.current) {
                clearTimeout(transitionTimeoutRef.current);
            }

            if (hideLoaderTimeoutRef.current) {
                clearTimeout(hideLoaderTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (blocker.state !== "blocked") {
            return;
        }

        setShowLoader(true);

        if (transitionTimeoutRef.current) {
            clearTimeout(transitionTimeoutRef.current);
        }

        if (hideLoaderTimeoutRef.current) {
            clearTimeout(hideLoaderTimeoutRef.current);
        }

        transitionTimeoutRef.current = setTimeout(() => {
            blocker.proceed();
            transitionTimeoutRef.current = null;

            hideLoaderTimeoutRef.current = setTimeout(() => {
                setShowLoader(false);
                hideLoaderTimeoutRef.current = null;
            }, PAGE_FADE_DURATION_MS);
        }, LOADER_DURATION_MS);
    }, [blocker]);

    return (
        <div className="relative min-h-screen">
            <AnimatePresence>
                {!prefersReducedMotion && showLoader && (
                    <WaveformLoader key="global-loader" />
                )}
            </AnimatePresence>

            <AnimatePresence mode="wait" initial={false}>
                <motion.div
                    key={location.pathname}
                    className="min-h-screen"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{
                        duration: prefersReducedMotion ? 0.15 : 0.35,
                        ease: "easeOut",
                    }}
                >
                    <Outlet />
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
