# Armonyx — AI AMV Composer

## Group Members

| Name | Student Number | Email |
|---|---|---|
| Diogo Fontes | 24611 | diogofontes@ipvc.pt |
| Simão Mendes | 31388 | simaomendes@ipvc.pt |

**Group:** C19

## Track

**A — Deep Learning**

## Project Description

Armonyx is an AI-powered platform for generating **Anime Music Videos (AMVs)** from a natural language description. The user describes a theme or mood in a conversational interface, and the system automatically produces a complete AMV original music, scene visuals, and a final rendered video with transitions.

The project extends the base proposal of an *AI Music Composer* by integrating a full creative pipeline:

- **Creative planning** via Qwen2.5:14b — generates a narrative storyboard coherent with the user's theme
- **Music generation** via MusicGen (Meta) — produces original audio tracks from text prompts
- **Image generation** via Stable Diffusion XL — renders each storyboard scene as a visual
- **Video rendering** via FFmpeg — combines audio and images with xfade transitions into a final MP4
- **Conversational interface** — guides the user through each generation step with real-time feedback

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, React Router 7, Tailwind CSS 4 |
| Backend | Node.js, Express |
| Database | Supabase (PostgreSQL + Auth + Storage) |
| LLM / Planning | Qwen2.5:14b (Kaggle + Ngrok) |
| Music Generation | MusicGen-medium — Meta (Kaggle) |
| Image Generation | Stable Diffusion XL (Kaggle) |
| Video Rendering | FFmpeg (H.264 + AAC, xfade transitions) |
| Tunnel | Ngrok (exposes Kaggle workers to backend) |

## Supabase Setup

### Database

Run the following SQL in the Supabase **SQL Editor**:

```sql
-- Custom types
CREATE TYPE job_status AS ENUM ('PENDING','GENERATING_PLAN','GENERATING_AUDIO','GENERATING_IMAGES','RENDERING','COMPLETED','FAILED');
CREATE TYPE job_step AS ENUM ('PLAN','AUDIO','IMAGES','RENDER');
CREATE TYPE message_role AS ENUM ('user','assistant');

-- Tables
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  username text UNIQUE,
  avatar_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status job_status NOT NULL DEFAULT 'PENDING',
  current_step job_step,
  theme text NOT NULL,
  output_path text,
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT jobs_pkey PRIMARY KEY (id),
  CONSTRAINT jobs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.job_metadata (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL UNIQUE,
  creative_plan jsonb,
  storyboard jsonb,
  music_prompt text,
  video_path text,
  settings jsonb DEFAULT '{"sd_model":"sdxl","sd_steps":20,"num_scenes":12,"image_width":512,"image_height":768,"music_duration":60}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT job_metadata_pkey PRIMARY KEY (id),
  CONSTRAINT job_metadata_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id)
);
CREATE TABLE public.job_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  status job_status NOT NULL,
  message text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT job_logs_pkey PRIMARY KEY (id),
  CONSTRAINT job_logs_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id)
);
CREATE TABLE public.conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT conversations_pkey PRIMARY KEY (id),
  CONSTRAINT conversations_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id)
);
CREATE TABLE public.messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  role message_role NOT NULL,
  content text NOT NULL,
  action text NOT NULL DEFAULT 'chat',
  action_payload jsonb,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT messages_pkey PRIMARY KEY (id),
  CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id)
);
```

### Storage

Create a public bucket named **`avatars`** in Supabase Storage (Storage → New bucket → name: `avatars`, public: on).

## How to Run

### Prerequisites

- Node.js 20+
- Supabase project configured (schema applied, `avatars` bucket created)
- Kaggle notebooks running (Worker 1: Qwen + MusicGen, Worker 2: Stable Diffusion)
- Ngrok tunnels active and URLs noted
- FFmpeg installed and available in PATH

### 1. Clone the repository

```bash
git clone https://github.com/Fontezilla/2026-ei-aoopii-c19.git
cd 2026-ei-aoopii-c19
```

### 2. Configure backend environment variables

Create `src/backend/.env`:

```env
PORT=3000
CLIENT_URL=http://localhost:5173

SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

JWT_SECRET=your_jwt_secret

WORKER1_URL=https://your-ngrok-worker1-url
WORKER1_KEY=your_worker_key

WORKER2_URL=https://your-ngrok-worker2-url
WORKER2_KEY=your_worker_key
```

> The frontend requires no `.env` — it connects to `http://localhost:3000` by default.

### 3. Install dependencies

```bash
# Backend
cd src/backend
npm install

# Frontend
cd ../frontend
npm install
```

### 4. Start the backend

```bash
cd src/backend
node server.js
```

### 5. Start the frontend

```bash
cd src/frontend
npm run dev
```

The app will be available at `http://localhost:5173`.

### 6. Kaggle Workers

Open the notebooks in Kaggle and run all cells. Each notebook exposes an HTTP API via Ngrok — copy the public URLs into the backend `.env`.

- **Worker 1** (`notebook/aoop-armonyx-llm-1.ipynb`) — Qwen2.5:14b + MusicGen
- **Worker 2** — Stable Diffusion XL
