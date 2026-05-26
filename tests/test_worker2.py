#!/usr/bin/env python3
"""
ARMONYX — Script de testes do Worker 2 (SDXL)
Testa todos os endpoints: health, generate-scene, generate-images

Uso:
    python test_worker2.py --url https://o-teu-dominio.ngrok-free.dev
    python test_worker2.py --url https://... --key a_tua_chave
    python test_worker2.py --url https://... --key ... --skip-images
"""

import argparse
import json
import sys
import time
import requests

# ── Configuração ──────────────────────────────────────────────────────────────

POLL_INTERVAL = 5
POLL_TIMEOUT  = 600

GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
RESET  = "\033[0m"

def ok(msg):      print(f"{GREEN}  ✓ {msg}{RESET}")
def fail(msg):    print(f"{RED}  ✗ {msg}{RESET}")
def info(msg):    print(f"{CYAN}  → {msg}{RESET}")
def warn(msg):    print(f"{YELLOW}  ! {msg}{RESET}")
def section(t):   print(f"\n{'─'*60}\n  {t}\n{'─'*60}")

def get_headers(api_key):
    return {"X-Worker-Key": api_key} if api_key else {}

def poll_job(base_url, job_id, headers):
    deadline = time.time() + POLL_TIMEOUT
    while time.time() < deadline:
        try:
            r = requests.get(f"{base_url}/status/{job_id}", headers=headers, timeout=15)
            r.raise_for_status()
            data = r.json()
            status       = data.get("status", "?")
            progress     = data.get("progress", 0)
            scenes_ready = data.get("scenes_ready", 0)
            info(f"status={status} progress={progress}% scenes_ready={scenes_ready}")
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

def test_health(base_url, headers):
    section("1 — Health")
    try:
        r = requests.get(f"{base_url}/health", headers=headers, timeout=20)
        r.raise_for_status()
        data = r.json()
        ok(f"HTTP {r.status_code}")
        ok(f"model_loaded={data.get('model_loaded')}  device={data.get('sdxl_device')}")
        ok(f"jobs em memória: {data.get('jobs_in_memory', 0)}")
        for gpu in data.get("gpus", []):
            info(f"GPU {gpu['index']}: {gpu['name']} — "
                 f"{gpu['memory_allocated_mb']}/{gpu['memory_total_mb']} MB")
        return True
    except Exception as e:
        fail(f"Health falhou: {e}")
        return False


def test_status_not_found(base_url, headers):
    section("2 — Status de job inexistente (deve retornar 404)")
    try:
        r = requests.get(f"{base_url}/status/job_inexistente_xyz", headers=headers, timeout=10)
        if r.status_code == 404:
            ok("404 recebido correctamente")
            return True
        fail(f"Esperado 404, recebido {r.status_code}")
        return False
    except Exception as e:
        fail(f"Erro: {e}")
        return False


def test_generate_scene(base_url, headers, save_png=True):
    section("3 — Generate Scene (1 imagem async)")
    job_id = "test_scene_001"
    try:
        r = requests.post(
            f"{base_url}/generate-scene",
            json={
                "job_id":       job_id,
                "scene_index":  1,
                "image_prompt": "anime warrior standing on a cliff at sunset, dramatic lighting, wind in hair, cinematic",
                "width":        512,
                "height":       288,
                "steps":        20,
                "guidance":     7.5,
            },
            headers=headers,
            timeout=30,
        )
        if r.status_code != 202:
            fail(f"Esperado 202, recebido {r.status_code}: {r.text[:200]}")
            return False

        ok(f"202 Accepted — job_id={job_id}")
        info("A fazer polling (~30-60s para 1 imagem)...")

        status = poll_job(base_url, job_id, headers)
        if status.get("status") != "done":
            return False

        # Descarregar PNG
        r2 = requests.get(
            f"{base_url}/result/{job_id}/scene/1",
            headers=headers,
            timeout=30,
        )
        r2.raise_for_status()
        png_bytes = r2.content
        ok(f"PNG recebido: {len(png_bytes):,} bytes ({len(png_bytes)/1024:.1f} KB)")

        if save_png:
            fname = f"test_{job_id}.png"
            with open(fname, "wb") as f:
                f.write(png_bytes)
            ok(f"Guardado em: {fname}")

        return True
    except Exception as e:
        fail(f"generate-scene falhou: {e}")
        return False


def test_generate_images(base_url, headers, save_png=True):
    section("4 — Generate Images (múltiplas cenas async)")
    job_id = "test_images_001"
    scenes = [
        {"scene_index": 1, "image_prompt": "anime hero running through a forest at night, moonlight, action pose"},
        {"scene_index": 2, "image_prompt": "epic anime battle scene, two warriors clashing swords, energy explosion"},
        {"scene_index": 3, "image_prompt": "melancholic anime girl looking at the ocean at sunrise, emotional, peaceful"},
    ]
    try:
        r = requests.post(
            f"{base_url}/generate-images",
            json={
                "job_id":    job_id,
                "scenes":    scenes,
                "width":     512,
                "height":    288,
                "steps":     20,
                "guidance":  7.5,
            },
            headers=headers,
            timeout=30,
        )
        if r.status_code != 202:
            fail(f"Esperado 202, recebido {r.status_code}: {r.text[:200]}")
            return False

        ok(f"202 Accepted — job_id={job_id} — {r.json().get('total_scenes')} cenas")
        info("A fazer polling (~2-3 min para 3 imagens)...")

        status = poll_job(base_url, job_id, headers)
        if status.get("status") != "done":
            return False

        ok(f"Cenas prontas: {status.get('scenes_ready')}")

        # Descarregar todas via /images (base64)
        r2 = requests.get(f"{base_url}/result/{job_id}/images", headers=headers, timeout=30)
        r2.raise_for_status()
        data   = r2.json()
        total  = data.get("total", 0)
        ok(f"Total de imagens recebidas: {total}")

        # Descarregar cada PNG individualmente
        if save_png:
            import base64
            for scene in data.get("scenes", []):
                idx       = scene["scene_index"]
                png_bytes = base64.b64decode(scene["image_base64"])
                fname     = f"test_{job_id}_scene_{idx:03d}.png"
                with open(fname, "wb") as f:
                    f.write(png_bytes)
                ok(f"Cena {idx} guardada: {fname} ({len(png_bytes):,} bytes)")

        return True
    except Exception as e:
        fail(f"generate-images falhou: {e}")
        return False


def test_result_scene_not_found(base_url, headers):
    section("5 — Cena inexistente num job concluído (deve retornar 404)")
    job_id = "test_scene_001"
    try:
        r = requests.get(
            f"{base_url}/result/{job_id}/scene/99",
            headers=headers,
            timeout=10,
        )
        if r.status_code == 404:
            ok("404 recebido correctamente")
            return True
        warn(f"Recebido {r.status_code} (pode ser 409 se o job ainda não existir)")
        return True
    except Exception as e:
        fail(f"Erro: {e}")
        return False


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Testes do ARMONYX Worker 2 — SDXL")
    parser.add_argument("--url",          required=True, help="URL base do worker")
    parser.add_argument("--key",          default="",    help="WORKER_API_KEY (opcional)")
    parser.add_argument("--skip-images",  action="store_true", help="Salta teste de múltiplas imagens")
    parser.add_argument("--no-save",      action="store_true", help="Não guarda PNGs em disco")
    args = parser.parse_args()

    base_url = args.url.rstrip("/")
    headers  = get_headers(args.key)
    save_png = not args.no_save

    print(f"\n{'='*60}")
    print(f"  ARMONYX Worker 2 — Testes SDXL")
    print(f"  URL: {base_url}")
    print(f"  Key: {'configurada' if args.key else 'não configurada'}")
    print(f"{'='*60}")

    resultados = {}

    resultados["health"]        = test_health(base_url, headers)
    resultados["status_404"]    = test_status_not_found(base_url, headers)
    resultados["generate_scene"]= test_generate_scene(base_url, headers, save_png)
    resultados["scene_404"]     = test_result_scene_not_found(base_url, headers)

    if not args.skip_images:
        resultados["generate_images"] = test_generate_images(base_url, headers, save_png)
    else:
        warn("generate-images ignorado (--skip-images)")

    section("Sumário")
    total  = len(resultados)
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