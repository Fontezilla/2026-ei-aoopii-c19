import { useState } from "react";
import { useNavigate } from "react-router";
import { authService } from "~/services/authService";

interface SignUpFormState {
    name: string;
    email: string;
    password: string;
    confirmPassword: string;
}

export function useSignUpForm() {
    const navigate = useNavigate();

    const [form, setForm] = useState<SignUpFormState>({
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
        const { name, value } = e.target;

        setForm((prev) => ({
            ...prev,
            [name]: value,
        }));
    };

    const validateForm = () => {
        if (!form.name.trim()) {
            return "O nome é obrigatório.";
        }

        if (!form.email.trim()) {
            return "O email é obrigatório.";
        }

        if (form.password !== form.confirmPassword) {
            return "As passwords não coincidem.";
        }

        if (form.password.length < 8) {
            return "A password deve ter pelo menos 8 caracteres.";
        }

        return null;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (loading) {
            return;
        }

        setError(null);

        const validationError = validateForm();

        if (validationError) {
            setError(validationError);
            return;
        }

        setLoading(true);

        try {
            await authService.register(
                form.name.trim(),
                form.email.trim(),
                form.password,
                form.confirmPassword
            );

            navigate("/app/generate", { replace: true });
        } catch (err) {
            const message =
                err instanceof Error ? err.message : "Erro ao criar conta.";

            setError(message);
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
        togglePassword: () => setShowPassword((prev) => !prev),
        toggleConfirmPassword: () => setShowConfirmPassword((prev) => !prev),
    };
}