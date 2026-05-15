const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export interface AuthUser {
    id: string;
    email: string;
    username: string | null;
    avatar_url: string | null;
}

export interface AuthResponse {
    message: string;
    user: AuthUser;
}

const AUTH_USER_KEY = "authUser";

const getStorage = () => {
    if (typeof window === "undefined") {
        return null;
    }

    return window.localStorage;
};

export const authService = {
    async login(email: string, password: string) {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ email, password }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? data.message ?? "Erro ao fazer login.");
        getStorage()?.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
        return data as AuthResponse;
    },

    async register(
        full_name: string,
        email: string,
        password: string,
        confirm_password: string
    ) {
        const res = await fetch(`${API_URL}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ full_name, email, password, confirm_password }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? data.message ?? "Erro ao criar conta.");
        getStorage()?.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
        return data as AuthResponse;
    },

    async logout() {
        await fetch(`${API_URL}/auth/logout`, {
            method: "POST",
            credentials: "include",
        });
        getStorage()?.removeItem(AUTH_USER_KEY);
    },

    hasStoredUser() {
        return !!getStorage()?.getItem(AUTH_USER_KEY);
    },

    async me() {
        const res = await fetch(`${API_URL}/auth/me`, {
            credentials: "include",
        });

        if (!res.ok) {
            getStorage()?.removeItem(AUTH_USER_KEY);
            return null;
        }

        const data = await res.json();
        getStorage()?.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
        return data.user as AuthUser;
    },
};
