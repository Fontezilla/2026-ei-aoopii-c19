const fs = require("fs");
const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");

const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, "utf8")
        .split(/\r?\n/)
        .filter((line) => line && !line.startsWith("#"))
        .forEach((line) => {
            const [key, ...value] = line.split("=");
            process.env[key.trim()] = value.join("=").trim();
        });
}

const app = express();
const PORT = process.env.PORT || 3000;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

const authRoutes = require("./routes/auth.routes");
const jobRoutes = require("./routes/job.routes");

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", CLIENT_URL);
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    req.method === "OPTIONS" ? res.sendStatus(204) : next();
});

app.use(express.json());
app.use(cookieParser());

app.get("/health", (req, res) => res.json({ status: "ok" }));
app.use("/auth", authRoutes);
app.use("/job", jobRoutes);

app.use("/outputs", express.static(path.join(__dirname, "outputs")));

app.use((req, res) => res.status(404).json({ message: "Rota não encontrada." }));
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ message: "Erro interno do servidor." });
});

const server = app.listen(PORT, () => {
    console.log(`Backend a correr em http://localhost:${PORT}`);
});

server.on("error", (err) => {
    console.error(err);
});