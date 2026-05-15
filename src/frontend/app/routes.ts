import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
    route("", "routes/layouts/backgroundPublicLayout.tsx", [
        index("routes/publicRoutes/landescape.tsx"),
        route("signin", "routes/publicRoutes/signin/signin.tsx"),
        route("signup", "routes/publicRoutes/signup/signup.tsx"),
    ]),
    route("app", "routes/layouts/backgroundSecureLayout.tsx", [
        index("routes/secureRoutes/home.tsx"),
        route("generate", "routes/secureRoutes/generate.tsx"),
        route("history", "routes/secureRoutes/history.tsx"),
    ]),
] satisfies RouteConfig;