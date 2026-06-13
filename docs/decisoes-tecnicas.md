# Technical Decisions and Challenges

This document records the main architectural decisions made during the development of Armonyx, as well as the problems encountered and how they were resolved.

---

## Kaggle + Ngrok as AI Infrastructure

**Decision:** Run AI models (Qwen2.5:14b, MusicGen, Stable Diffusion XL) on Kaggle notebooks with a free T4 GPU, exposed via Ngrok.

**Why:** The models are too heavy to run locally on development hardware. Kaggle provides T4 GPUs for free and Ngrok allows exposing the notebook HTTP endpoints to the backend without additional infrastructure.

**Trade-off:** Notebook startup latency is high (2–5 minutes) and Kaggle sessions expire after 12 hours. In real production, a managed service such as AWS SageMaker or Google Cloud Run with GPUs would be preferable.

---

## MusicGen Limited to 30 Seconds

**Decision:** Enforce a 30-second ceiling on generated audio duration, regardless of what the user requests.

**Why:** MusicGen-medium was trained on ~30-second clips. Above ~40 seconds (≈2000 autoregressive tokens at 50Hz), the model enters extrapolation territory and cuBLAS fails with `device-side assert triggered` reproducibly. This limit was determined by controlled bisection (40s ok, 50s always crashes).

---

## Supabase as Backend-as-a-Service

**Decision:** Use Supabase for database, authentication and storage instead of managing own infrastructure.

**Why:** Allows focusing development on business logic. Supabase provides PostgreSQL, JWT Auth, Storage and an auto-generated REST API, all in a single service with a generous free tier.

**Problem encountered:** Supabase's `.upsert()` method requires a `UNIQUE` constraint on the conflict column. Without it, it fails silently. The solution was to create the `job_metadata` row at job creation time and use only `.update()` for subsequent writes.

---

## Asynchronous Orchestration with setImmediate

**Decision:** Launch the generation pipeline with `setImmediate()` after responding to the HTTP client.

**Why:** Generation takes several minutes. Responding immediately to the frontend (with the classified `intent`) and launching generation in the background allows the user to see instant feedback and the frontend to start polling without waiting for the final result.

---

## Polling Instead of WebSockets

**Decision:** The frontend polls the `/job/:id/status` endpoint every 4 seconds during generation.

**Why:** Simpler to implement and sufficient for the required feedback granularity (generation phases each take tens of seconds to minutes). WebSockets would add complexity without a perceptible benefit for the user.

---

## FFmpeg Running Locally on the Backend

**Decision:** Run FFmpeg directly on the Node.js server instead of delegating it to an external worker.

**Why:** Video rendering is the least GPU-intensive step (it is mostly CPU) and the input files (images and audio) are already on the server. Moving files to an external worker would introduce latency and complexity without any gain.

**Problem encountered:** The video output was corrupted and would not open in Windows Photos. Cause: PNG images are RGB, but H.264 requires YUV 4:2:0. Fix: add `-pix_fmt yuv420p` to the FFmpeg arguments.

---

## Filter Complex Written to a Temporary File

**Decision:** Write the FFmpeg `filter_complex` to a temporary `.txt` file and pass it with `-filter_complex_script` instead of passing it directly on the command line.

**Why:** With 12 scenes, the `filter_complex` can be hundreds of characters long. On Windows, shell argument length limits are much lower than the `execFile` buffer limit. Using a file avoids the problem entirely.

---

## Scene Count Proportional to Duration

**Decision:** Calculate `numScenes = Math.max(2, Math.round(durationSeconds / 2.5))` instead of using a fixed value of 12 scenes.

**Why:** A 10-second AMV with 12 scenes would have scenes shorter than 1 second each — too short to be visually coherent. With the proportional formula: 10s → 4 scenes, 20s → 8 scenes, 30s → 12 scenes.

---

## Atomic Concurrency Guard

**Decision:** Use a conditional UPDATE in Supabase to "reserve" the job before launching generation, instead of checking state and then updating in two separate steps.

**Why:** Two simultaneous requests from the same user (e.g. double-click) could launch two generations on the same job, causing output file corruption and OOM on the worker. The atomic UPDATE with `.not("status", "in", GENERATING_STATUSES)` ensures only one request proceeds.
