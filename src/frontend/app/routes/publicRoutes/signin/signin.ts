import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { authService } from "~/services/authService";

export function useSignInForm() {
    const navigate = useNavigate();

    const [form, setForm] = useState({
        email: "",
        password: "",
        remember: false,
    });

    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const rememberedEmail = localStorage.getItem("rememberedEmail");

        if (rememberedEmail) {
            setForm((prev) => ({
                ...prev,
                email: rememberedEmail,
                remember: true,
            }));
        }
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type, checked } = e.target;
        setForm((prev) => ({
            ...prev,
            [name]: type === "checkbox" ? checked : value,
        }));
    };

    const togglePassword = () => setShowPassword((prev) => !prev);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            await authService.login(form.email, form.password);

            if (form.remember) {
                localStorage.setItem("rememberedEmail", form.email);
            } else {
                localStorage.removeItem("rememberedEmail");
            }

            navigate("/app");
        } catch (err: any) {
            setError(err.message ?? "Erro ao fazer login.");
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
