const jwt = require("jsonwebtoken");
const supabase = require("../configs/supabase");

const JWT_SECRET = process.env.JWT_SECRET;
const IS_PROD = process.env.NODE_ENV === "production";

const setAuthCookie = (res, token) => {
    res.cookie("token", token, {
        httpOnly: true,
        secure: IS_PROD,
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
    });
};

const register = async (req, res) => {
    try {
        const { full_name, email, password, confirm_password } = req.body;

        if (!full_name || !email || !password || !confirm_password) {
            return res.status(400).json({ message: "Todos os campos sao obrigatorios." });
        }

        if (password !== confirm_password) {
            return res.status(400).json({ message: "As passwords nao coincidem." });
        }

        if (password.length < 8) {
            return res.status(400).json({ message: "A password deve ter pelo menos 8 caracteres." });
        }

        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
                username: full_name,
                full_name,
            },
        });

        if (authError || !authData.user) {
            return res.status(400).json({
                message: "Erro ao criar conta.",
                error: authError?.message,
            });
        }

        const { error: profileError } = await supabase
            .from("profiles")
            .upsert(
                {
                    id: authData.user.id,
                    username: full_name,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "id" }
            );

        if (profileError) {
            return res.status(400).json({
                message: "Erro ao criar perfil.",
                error: profileError.message,
            });
        }

        const token = jwt.sign(
            { sub: authData.user.id, email },
            JWT_SECRET,
            { expiresIn: "7d" }
        );

        setAuthCookie(res, token);

        return res.status(201).json({
            message: "Conta criada com sucesso.",
            user: {
                id: authData.user.id,
                email,
                username: full_name,
                avatar_url: null,
            },
        });
    } catch (error) {
        return res.status(500).json({
            message: "Erro interno ao criar conta.",
            error: error.message,
        });
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: "Email e password sao obrigatorios." });
        }

        const { data, error } = await supabase.auth.signInWithPassword({ email, password });

        if (error || !data.user) {
            return res.status(401).json({ message: "Credenciais invalidas." });
        }

        const { data: profile } = await supabase
            .from("profiles")
            .select("username, avatar_url")
            .eq("id", data.user.id)
            .maybeSingle();

        const token = jwt.sign(
            { sub: data.user.id, email },
            JWT_SECRET,
            { expiresIn: "7d" }
        );

        setAuthCookie(res, token);

        return res.status(200).json({
            message: "Login efetuado com sucesso.",
            user: {
                id: data.user.id,
                email,
                username: profile?.username ?? null,
                avatar_url: profile?.avatar_url ?? null,
            },
        });
    } catch (error) {
        return res.status(500).json({
            message: "Erro interno ao fazer login.",
            error: error.message,
        });
    }
};

const logout = async (req, res) => {
    res.clearCookie("token", {
        httpOnly: true,
        secure: IS_PROD,
        sameSite: "lax",
    });

    return res.status(200).json({ message: "Logout efetuado com sucesso." });
};

const me = async (req, res) => {
    const { data: profile } = await supabase
        .from("profiles")
        .select("username, avatar_url")
        .eq("id", req.user.sub)
        .maybeSingle();

    return res.status(200).json({
        user: {
            id: req.user.sub,
            email: req.user.email,
            username: profile?.username ?? null,
            avatar_url: profile?.avatar_url ?? null,
        },
    });
};

module.exports = { login, register, logout, me };
