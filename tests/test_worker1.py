"""
ARMONYX — Script de testes do Worker 1
Testa todos os endpoints: health, classify-intent, generate-plan, generate-audio, generate-all
"""

import argparse
import json
import sys
import time
import requests

# ── Configuração ─────────────────────────────────────────────────────────────

DEFAULT_URL = "https://irenic-daniel-unshowily.ngrok-free.dev"
POLL_INTERVAL  = 5    # segundos entre cada polling
POLL_TIMEOUT   = 600  # máximo de espera por job (10 min)

GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
RESET  = "\033[0m"

def ok(msg):   print(f"{GREEN}  ✓ {msg}{RESET}")
def fail(msg): print(f"{RED}  ✗ {msg}{RESET}")
def info(msg): print(f"{CYAN}  → {msg}{RESET}")
def warn(msg): print(f"{YELLOW}  ! {msg}{RESET}")
def section(title): print(f"\n{'─'*60}\n  {title}\n{'─'*60}")

# ── Helpers ───────────────────────────────────────────────────────────────────

def get_headers(api_key: str) -> dict:
    return {"X-Worker-Key": api_key} if api_key else {}


def poll_job(base_url: str, job_id: str, headers: dict) -> dict:
    """Faz polling ao /status/{job_id} até done ou error."""
    deadline = time.time() + POLL_TIMEOUT
    while time.time() < deadline:
        try:
            r = requests.get(
                f"{base_url}/status/{job_id}",
                headers=headers,
                timeout=15,
            )
            r.raise_for_status()
            data = r.json()
            status   = data.get("status", "?")
            progress = data.get("progress", 0)
            info(f"status={status} progress={progress}%")
            if status == "done":
                return data
            if status == "error":
                fail(f"Job falhou: {data.get('error')}")
                return data
        except Exception as e:
            warn(f"Erro no polling: {e}")
        time.sleep(POLL_INTERVAL)

    fail(f"Timeout após {POLL_TIMEOUT}s")
    return {"status": "timeout"}


# ── Testes ────────────────────────────────────────────────────────────────────

def test_health(base_url: str, headers: dict) -> bool:
    section("1 — Health")
    try:
        r = requests.get(f"{base_url}/health", headers=headers, timeout=20)
        r.raise_for_status()
        data = r.json()

        ok(f"HTTP {r.status_code}")
        ok(f"ollama={data.get('ollama')}  qwen={data.get('qwen_available')}  musicgen={data.get('musicgen_loaded')}")
        ok(f"jobs em memória: {data.get('jobs_in_memory', 0)}")

        for gpu in data.get("gpus", []):
            info(f"GPU {gpu['index']}: {gpu['name']} — "
                 f"{gpu['memory_allocated_mb']}/{gpu['memory_total_mb']} MB")

        if not data.get("ollama"):
            warn("Ollama não está disponível")
        if not data.get("qwen_available"):
            warn("Qwen não está carregado")
        if not data.get("musicgen_loaded"):
            warn("MusicGen não está carregado")

        return True
    except Exception as e:
        fail(f"Health falhou: {e}")
        return False


def test_classify_intent(base_url: str, headers: dict) -> bool:
    section("2 — Classify Intent (síncrono)")
    casos = [
        ("quero uma música épica de batalha anime",          "audio"),
        ("quero criar um videoclip completo sobre solidão",  "video"),
        ("muda o estilo para cyberpunk",                     "chat"),
        ("refaz só a música mas mais melancólica",           "regenerate_audio"),
        ("o que é o storyboard?",                            "chat"),
    ]

    todos_ok = True
    for mensagem, intent_esperado in casos:
        try:
            r = requests.post(
                f"{base_url}/classify-intent",
                json={"message": mensagem, "context": {}},
                headers=headers,
                timeout=60,
            )
            r.raise_for_status()
            data = r.json()
            intent   = data.get("intent", "?")
            response = data.get("response_text", "")[:80]

            if intent == intent_esperado:
                ok(f'"{mensagem[:45]}..." → {intent}')
            else:
                warn(f'"{mensagem[:45]}..." → {intent} (esperado: {intent_esperado})')

            info(f"response_text: {response}")
        except Exception as e:
            fail(f"classify-intent falhou: {e}")
            todos_ok = False

    return todos_ok


def test_generate_plan(base_url: str, headers: dict) -> dict | None:
    section("3 — Generate Plan (async)")
    job_id = "test_plan_001"

    try:
        r = requests.post(
            f"{base_url}/generate-plan",
            json={
                "job_id":         job_id,
                "theme":          "solidão e esperança",
                "style":          "anime cinematic melancholic",
                "num_scenes":     4,
                "music_duration": 20,
            },
            headers=headers,
            timeout=30,
        )
        if r.status_code != 202:
            fail(f"Esperado 202, recebido {r.status_code}: {r.text[:200]}")
            return None

        ok(f"202 Accepted — job_id={job_id}")
        info("A fazer polling...")

        status = poll_job(base_url, job_id, headers)
        if status.get("status") != "done":
            return None

        # Ir buscar o plano
        r2 = requests.get(
            f"{base_url}/result/{job_id}/plan",
            headers=headers,
            timeout=15,
        )
        r2.raise_for_status()
        plan = r2.json().get("creative_plan", {})

        ok(f"Plano recebido: \"{plan.get('title', '?')}\"")
        ok(f"Cenas: {len(plan.get('storyboard', []))}")
        ok(f"Versos: {len(plan.get('lyrics', []))}")
        info(f"music_prompt: {plan.get('music_prompt', '')[:80]}")

        return plan

    except Exception as e:
        fail(f"generate-plan falhou: {e}")
        return None


def test_generate_audio(base_url: str, headers: dict, save_wav: bool = True) -> bool:
    section("4 — Generate Audio (async)")
    job_id = "test_audio_001"

    try:
        r = requests.post(
            f"{base_url}/generate-audio",
            json={
                "job_id":           job_id,
                "music_prompt":     "epic anime opening instrumental, emotional orchestral rock, fast taiko drums, dramatic strings",
                "duration_seconds": 10,
            },
            headers=headers,
            timeout=30,
        )
        if r.status_code != 202:
            fail(f"Esperado 202, recebido {r.status_code}: {r.text[:200]}")
            return False

        ok(f"202 Accepted — job_id={job_id}")
        info("A fazer polling (pode demorar ~2 min para 10s de áudio)...")

        status = poll_job(base_url, job_id, headers)
        if status.get("status") != "done":
            return False

        # Descarregar WAV
        r2 = requests.get(
            f"{base_url}/result/{job_id}/audio",
            headers=headers,
            timeout=60,
            stream=True,
        )
        r2.raise_for_status()

        wav_bytes = r2.content
        ok(f"WAV recebido: {len(wav_bytes):,} bytes ({len(wav_bytes)/1024:.1f} KB)")

        if save_wav:
            fname = f"test_{job_id}.wav"
            with open(fname, "wb") as f:
                f.write(wav_bytes)
            ok(f"Guardado em: {fname}")

        return True

    except Exception as e:
        fail(f"generate-audio falhou: {e}")
        return False


def test_generate_all(base_url: str, headers: dict, save_wav: bool = True) -> bool:
    section("5 — Generate All (async — plano + áudio)")
    job_id = "test_all_001"

    try:
        r = requests.post(
            f"{base_url}/generate-all",
            json={
                "job_id":           job_id,
                "theme":            "batalha final",
                "style":            "anime shonen epic",
                "num_scenes":       3,
                "duration_seconds": 10,
            },
            headers=headers,
            timeout=30,
        )
        if r.status_code != 202:
            fail(f"Esperado 202, recebido {r.status_code}: {r.text[:200]}")
            return False

        ok(f"202 Accepted — job_id={job_id}")
        info("A fazer polling (plano + áudio, pode demorar ~5 min)...")

        status = poll_job(base_url, job_id, headers)
        if status.get("status") != "done":
            return False

        # Plano
        r2 = requests.get(f"{base_url}/result/{job_id}/plan", headers=headers, timeout=15)
        r2.raise_for_status()
        plan = r2.json().get("creative_plan", {})
        ok(f"Plano: \"{plan.get('title', '?')}\" — {len(plan.get('storyboard', []))} cenas")

        # Áudio
        r3 = requests.get(
            f"{base_url}/result/{job_id}/audio",
            headers=headers,
            timeout=60,
            stream=True,
        )
        r3.raise_for_status()
        wav_bytes = r3.content
        ok(f"WAV: {len(wav_bytes):,} bytes ({len(wav_bytes)/1024:.1f} KB)")

        if save_wav:
            fname = f"test_{job_id}.wav"
            with open(fname, "wb") as f:
                f.write(wav_bytes)
            ok(f"Guardado em: {fname}")

        return True

    except Exception as e:
        fail(f"generate-all falhou: {e}")
        return False


def test_status_not_found(base_url: str, headers: dict) -> bool:
    section("6 — Status de job inexistente (deve retornar 404)")
    try:
        r = requests.get(
            f"{base_url}/status/job_que_nao_existe_xyz",
            headers=headers,
            timeout=10,
        )
        if r.status_code == 404:
            ok("404 recebido correctamente")
            return True
        else:
            fail(f"Esperado 404, recebido {r.status_code}")
            return False
    except Exception as e:
        fail(f"Erro: {e}")
        return False


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Testes do ARMONYX Worker 1")
    parser.add_argument("--url",        default=DEFAULT_URL, help="URL base do worker")
    parser.add_argument("--key",        default="",          help="WORKER_API_KEY (opcional)")
    parser.add_argument("--skip-audio", action="store_true", help="Salta testes de geração de áudio")
    parser.add_argument("--skip-all",   action="store_true", help="Salta o teste generate-all")
    parser.add_argument("--no-save",    action="store_true", help="Não guarda ficheiros WAV")
    args = parser.parse_args()

    base_url = args.url.rstrip("/")
    headers  = get_headers(args.key)
    save_wav = not args.no_save

    print(f"\n{'='*60}")
    print(f"  ARMONYX Worker 1 — Testes")
    print(f"  URL: {base_url}")
    print(f"  Key: {'configurada' if args.key else 'não configurada'}")
    print(f"{'='*60}")

    resultados = {}

    resultados["health"]         = test_health(base_url, headers)
    resultados["classify_intent"]= test_classify_intent(base_url, headers)
    resultados["generate_plan"]  = test_generate_plan(base_url, headers) is not None
    resultados["status_404"]     = test_status_not_found(base_url, headers)

    if not args.skip_audio:
        resultados["generate_audio"] = test_generate_audio(base_url, headers, save_wav)
    else:
        warn("generate-audio ignorado (--skip-audio)")

    if not args.skip_all:
        resultados["generate_all"] = test_generate_all(base_url, headers, save_wav)
    else:
        warn("generate-all ignorado (--skip-all)")

    # ── Sumário
    section("Sumário")
    total = len(resultados)
    passed = sum(1 for v in resultados.values() if v)
    for nome, resultado in resultados.items():
        if resultado:
            ok(nome)
        else:
            fail(nome)

    print(f"\n  {passed}/{total} testes passaram\n")
    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()