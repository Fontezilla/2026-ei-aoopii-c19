import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { authService } from "~/services/authService";

interface SignInFormState {
    email: string;
    password: string;
    remember: boolean;
}

export function useSignInForm() {
    const navigate = useNavigate();

    const [form, setForm] = useState<SignInFormState>({
        email: "",
        password: "",
        remember: false,
    });

    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const rememberedEmail = localStorage.getItem("rememberedEmail");

        if (!rememberedEmail) {
            return;
        }

        setForm((prev) => ({
            ...prev,
            email: rememberedEmail,
            remember: true,
        }));
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type, checked } = e.target;

        setForm((prev) => ({
            ...prev,
            [name]: type === "checkbox" ? checked : value,
        }));
    };

    const togglePassword = () => {
        setShowPassword((prev) => !prev);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (loading) {
            return;
        }

        setError(null);
        setLoading(true);

        try {
            await authService.login(form.email.trim(), form.password);

            if (form.remember) {
                localStorage.setItem("rememberedEmail", form.email.trim());
            } else {
                localStorage.removeItem("rememberedEmail");
            }

            navigate("/app", { replace: true });
        } catch (err) {
            const message =
                err instanceof Error ? err.message : "Erro ao fazer login.";

            setError(message);
        } finally {
            setLoading(false);
        }
    };

    return {
        form,
        showPassword,
        error,
        loading,
        handleChange,
        handleSubmit,
        togglePassword,
    };
}