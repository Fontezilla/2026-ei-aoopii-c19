# What We Built

This document describes what was implemented throughout the project, organised by component.

---

## Starting Point

The proposed theme was an **AI Music Composer** — a system that generates original music from a text description using Meta's MusicGen. The initial proposal covered only audio generation on user request.

We chose to significantly expand the scope, transforming the music composer into a full **AMV (Anime Music Video)** creation platform powered by artificial intelligence.

---

## Generation Pipeline

The core of the project is a sequential generation pipeline orchestrated by the backend. Each step can be executed independently.

### 1. Creative Planning
When the user describes a theme, Qwen2.5:14b generates a structured **creative plan** in JSON containing:
- AMV title
- Music prompt (in English, for MusicGen)
- Storyboard with N scenes, each with a description, duration, transition type and image prompt

The number of scenes is calculated proportionally to the duration requested by the user (approx. 1 scene per 2.5 seconds).

### 2. Music Generation
The `music_prompt` extracted from the creative plan is sent to MusicGen-medium, which produces a `.wav` file with the specified duration (maximum 30 seconds). The file is saved locally at `src/backend/outputs/{jobId}/audio.wav`.

### 3. Image Generation
The `image_prompt` for each scene is sent to Stable Diffusion XL, which generates one image per scene in `.png` format (512×768). Images are saved at `src/backend/outputs/{jobId}/images/scene_N.png` and their relative paths are stored in the `storyboard` field of `job_metadata`.

### 4. Video Rendering
FFmpeg combines the images and audio into a final video:
- Each image is displayed for the duration defined in the creative plan
- `xfade` transitions (dissolve, slideleft, wipeleft, zoomin, fadewhite) are applied between scenes
- The video ends with a 1.5-second fade-out
- Output: H.264 + AAC, 1280×720, 24fps, at `src/backend/outputs/{jobId}/video.mp4`

---

## Conversational Assistant

All user interaction is done through a **natural language chat**. Qwen2.5:14b classifies each message into one of the following intents:

| Intent | Action |
|---|---|
| `plan` | Generates the creative plan |
| `audio` / `regenerate_audio` | Generates or regenerates the audio |
| `images` / `regenerate_images` | Generates or regenerates the images |
| `video` / `regenerate_video` | Renders the final video |
| `chat` | Responds conversationally without generating |

The backend implements a **concurrency guard** that prevents two simultaneous generations on the same job, using an atomic UPDATE in Supabase that only affects rows outside of generating states.

---

## User Interface

### Generation Page (`/app/generate`)
- Chat panel on the left with message history, animated progress indicator and elapsed timer
- Preview panel on the right with 4 tabs:
  - **Audio** — audio player with waveform visualisation
  - **Images** — scene storyboard grid with lightbox
  - **Video** — video player with download button
  - **Plan** — creative plan with scene list, durations and transitions
- Automatic polling to the backend every 4 seconds during generation
- Automatic tab switching based on the detected intent

### History Page (`/app/history`)
- Cards for all of the user's jobs
- Video preview (plays on hover) when the AMV is available
- Fallback to the first storyboard image, or a styled placeholder

### Home Page (`/app`)
- Prompt input to start a new generation
- Cards for the 3 most recent projects with preview

---

## Authentication and Profiles

- Sign up and login via Supabase Auth (email + password)
- Sessions managed with HTTP-only cookies on the backend
- `requireAuth` middleware on all protected routes
- Avatar upload to the Supabase Storage `avatars` bucket
- User menu with name, email and profile picture

---

## Backend State Management

Each job goes through the following states:

```
PENDING → GENERATING_PLAN → GENERATING_AUDIO → GENERATING_IMAGES → RENDERING → COMPLETED
                                                                               ↘ FAILED
```

The state is persisted in the `jobs` table and metadata (plan, storyboard, file paths) in the `job_metadata` table. Logs of each transition are recorded in `job_logs`.
