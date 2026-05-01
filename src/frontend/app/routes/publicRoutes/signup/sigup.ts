import { useState } from "react";

export function useSignUpForm() {
    const [form, setForm] = useState({
        name: "",
        email: "",
        password: "",
        confirmPassword: "",
        agreeTerms: false,
    });

    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm({
            ...form,
            [e.target.name]:
                e.target.type === "checkbox" ? e.target.checked : e.target.value,
        });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        console.log(form);
    };

    return {
        form,
        showPassword,
        showConfirmPassword,
        handleChange,
        handleSubmit,
        togglePassword: () => setShowPassword(!showPassword),
        toggleConfirmPassword: () =>
            setShowConfirmPassword(!showConfirmPassword),
    };
}