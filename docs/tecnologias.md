# Technologies Used

This document describes the technologies, models and tools that make up the Armonyx platform, organised by architecture layer.

---

## Frontend

### React 19
Main UI framework. Used with hooks (`useState`, `useEffect`, `useRef`) to manage real-time generation state, message history, and audio/video playback.

### React Router 7
Client-side routing, including authentication-protected routes (`requireAuth`) and navigation between the Home, Generate and History pages.

### Tailwind CSS 4
Utility-first styling framework. The entire interface — from the conversational assistant to the history cards — is styled with Tailwind, without external stylesheets.

### Framer Motion
Animation library used for the animated sound wave bars (`WaveBars`) that visually indicate generation progress.

---

## Backend

### Node.js + Express
HTTP server that exposes the REST API consumed by the frontend. Manages job routes, messages, authentication, and static file serving for output files (audio, images, video).

### Supabase JS Client
Official Supabase SDK used in the backend for all database operations: reading/writing jobs, metadata, conversations, messages and logs.

### FFmpeg
Video rendering engine running locally on the backend server. Receives scene images and the audio file, applies `xfade` transitions between scenes, and produces a final video in H.264 with AAC audio. Critical flags: `-pix_fmt yuv420p` (Windows compatibility) and `-movflags +faststart` (progressive streaming).

---

## Database and Authentication

### Supabase
Backend-as-a-Service platform providing:
- **PostgreSQL** — relational database with tables for `jobs`, `job_metadata`, `conversations`, `messages`, `job_logs` and `profiles`
- **Auth** — user authentication with sessions managed via HTTP-only cookies
- **Storage** — `avatars` bucket (public) for profile image storage

---

## AI Engines (Kaggle + Ngrok)

All AI models run on Kaggle notebooks with a T4 GPU, exposed to the backend via Ngrok tunnels.

### Qwen2.5:14b
Large language model (LLM) with 14 billion parameters, developed by Alibaba. In Armonyx, it serves two purposes:

1. **Intent classification** (`/classify-intent`) — interprets the user's message and determines the action to take (generate plan, audio, images, video, or chat)
2. **Creative plan generation** (`/generate-plan`) — produces a structured JSON storyboard with scenes, durations, transitions, and visual and musical prompts

### MusicGen-medium (Meta)
Autoregressive text-to-music model developed by Meta AI. Receives an English `music_prompt` and produces a `.wav` file with the specified duration. Limited to 30 seconds for model stability reasons (above ~40s, cuBLAS failures occur reproducibly).

### Stable Diffusion XL
Diffusion model for text-to-image generation. Receives the `image_prompt` for each storyboard scene and generates 512×768 anime-style images saved as `.png` files.

---

## Infrastructure

### Ngrok
Tunnelling service that exposes the HTTP endpoints of Kaggle notebooks (which run in a closed network) as public URLs accessible by the backend. Each worker has its own independent tunnel and authentication key.

### Kaggle
Notebook platform with free access to NVIDIA T4 GPUs. Allows running heavy models such as Qwen2.5:14b and Stable Diffusion XL without infrastructure costs.
