import { useState } from "react";
import { useNavigate } from "react-router";
import { authService } from "~/services/authService";

export function useSignUpForm() {
    const navigate = useNavigate();

    const [form, setForm] = useState({
        name: "",
        email: "",
        password: "",
        confirmPassword: "",
    });

    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setForm({
            ...form,
            [e.target.name]: e.target.value,
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (form.password !== form.confirmPassword) {
            setError("As passwords não coincidem.");
            return;
        }

        if (form.password.length < 8) {
            setError("A password deve ter pelo menos 8 caracteres.");
            return;
        }

        setLoading(true);

        try {
            await authService.register(
                form.name,
                form.email,
                form.password,
                form.confirmPassword
            );

            navigate("/app/generate");
        } catch (err: any) {
            setError(err.message ?? "Erro ao criar conta.");
        } finally {
            setLoading(false);
        }
    };

    return {
        form,
        showPassword,
        showConfirmPassword,
        error,
        loading,
        handleChange,
        handleSubmit,
        togglePassword: () => setShowPassword(!showPassword),
        toggleConfirmPassword: () => setShowConfirmPassword(!showConfirmPassword),
    };
}