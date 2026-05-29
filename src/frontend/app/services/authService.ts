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

let meRequest: Promise<AuthUser | null> | null = null;

const getStorage = () => {
    if (typeof window === "undefined") {
        return null;
    }

    return window.localStorage;
};

const getErrorMessage = async (res: Response, fallback: string) => {
    try {
        const data = await res.json();
        return data.error ?? data.message ?? fallback;
    } catch {
        return fallback;
    }
};

const saveUser = (user: AuthUser) => {
    getStorage()?.setItem(AUTH_USER_KEY, JSON.stringify(user));
};

const clearUser = () => {
    getStorage()?.removeItem(AUTH_USER_KEY);
};

export const authService = {
    getStoredUser(): AuthUser | null {
        const rawUser = getStorage()?.getItem(AUTH_USER_KEY);

        if (!rawUser) {
            return null;
        }

        try {
            return JSON.parse(rawUser) as AuthUser;
        } catch {
            clearUser();
            return null;
        }
    },

    hasStoredUser(): boolean {
        return this.getStoredUser() !== null;
    },

    async login(email: string, password: string): Promise<AuthResponse> {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ email, password }),
        });

        if (!res.ok) {
            throw new Error(await getErrorMessage(res, "Erro ao fazer login."));
        }

        const data = (await res.json()) as AuthResponse;

        saveUser(data.user);
        meRequest = Promise.resolve(data.user);

        return data;
    },

    async register(
        full_name: string,
        email: string,
        password: string,
        confirm_password: string
    ): Promise<AuthResponse> {
        const res = await fetch(`${API_URL}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
                full_name,
                email,
                password,
                confirm_password,
            }),
        });

        if (!res.ok) {
            throw new Error(await getErrorMessage(res, "Erro ao criar conta."));
        }

        const data = (await res.json()) as AuthResponse;

        saveUser(data.user);
        meRequest = Promise.resolve(data.user);

        return data;
    },

    async logout(): Promise<void> {
        try {
            await fetch(`${API_URL}/auth/logout`, {
                method: "POST",
                credentials: "include",
            });
        } finally {
            clearUser();
            meRequest = null;
        }
    },

    async me(): Promise<AuthUser | null> {
        if (meRequest) {
            return meRequest;
        }

        meRequest = fetch(`${API_URL}/auth/me`, {
            credentials: "include",
        })
            .then(async (res) => {
                if (!res.ok) {
                    clearUser();
                    return null;
                }

                const data = await res.json();
                const user = data.user as AuthUser;

                saveUser(user);

                return user;
            })
            .catch(() => {
                clearUser();
                return null;
            })
            .finally(() => {
                meRequest = null;
            });

        return meRequest;
    },

    async updateAvatar(file: File): Promise<AuthUser> {
        const formData = new FormData();
        formData.append("avatar", file);

        const res = await fetch(`${API_URL}/auth/avatar`, {
            method: "PATCH",
            credentials: "include",
            body: formData,
        });

        if (!res.ok) {
            throw new Error(await getErrorMessage(res, "Erro ao atualizar avatar."));
        }

        const data = await res.json();
        const user = data.user as AuthUser;

        saveUser(user);
        meRequest = Promise.resolve(user);

        return user;
    },
};