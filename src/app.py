import torch
import gradio as gr
import numpy as np
from transformers import AutoProcessor, MusicgenForConditionalGeneration

MODEL_NAME = "facebook/musicgen-small"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

processor = AutoProcessor.from_pretrained(MODEL_NAME)
model = MusicgenForConditionalGeneration.from_pretrained(MODEL_NAME).to(DEVICE)
SAMPLE_RATE = model.config.audio_encoder.sampling_rate

print(f"Modelo carregado em: {DEVICE.upper()}")


def to_tensor(audio_np: np.ndarray) -> torch.Tensor:
    audio_float = audio_np.astype(np.float32) / 32767.0
    return torch.tensor(audio_float).unsqueeze(0).unsqueeze(0).to(DEVICE)


def to_numpy(audio_tensor: torch.Tensor) -> np.ndarray:
    audio_np = audio_tensor[0, 0].cpu().numpy().astype(np.float32)
    max_val = np.max(np.abs(audio_np))
    return audio_np / max_val if max_val > 0 else audio_np


def run_model(inputs, duration: int) -> tuple:
    with torch.no_grad():
        audio_values = model.generate(**inputs, max_new_tokens=duration * 50)
    audio_np = to_numpy(audio_values)
    return (SAMPLE_RATE, audio_np), (SAMPLE_RATE, audio_np)


def generate_music(prompt: str, duration: int):
    if not prompt.strip():
        raise gr.Error("Escreve uma descrição para gerar música!")
    inputs = processor(text=[prompt], padding=True, return_tensors="pt").to(DEVICE)
    return run_model(inputs, duration)


def refine_music(prompt: str, duration: int, previous_audio):
    if not prompt.strip():
        raise gr.Error("Escreve uma descrição para refinar a música!")
    if previous_audio is None:
        raise gr.Error("Gera primeiro uma música antes de refinar!")
    sr, audio_np = previous_audio
    inputs = processor(
        text=[prompt],
        audio=to_tensor(audio_np),
        sampling_rate=SAMPLE_RATE,
        padding=True,
        return_tensors="pt",
    ).to(DEVICE)
    return run_model(inputs, duration)


with gr.Blocks(title="AI Music Composer") as demo:
    audio_state = gr.State(value=None)

    gr.Markdown("# AI Music Composer")
    gr.Markdown("## Gerar música")
    gr.Markdown("Descreve a música que queres gerar.")

    with gr.Row():
        with gr.Column():
            prompt_input = gr.Textbox(
                label="Descrição",
                placeholder='ex: "sad jazz piano for 3am, slow tempo"',
                lines=3,
            )
            duration_slider = gr.Slider(minimum=5, maximum=30, value=10, step=5, label="Duração (segundos)")
            generate_btn = gr.Button("🎵 Gerar Música", variant="primary")
        with gr.Column():
            audio_output = gr.Audio(label="Música gerada", type="numpy")

    generate_btn.click(
        fn=generate_music,
        inputs=[prompt_input, duration_slider],
        outputs=[audio_output, audio_state],
    )

    gr.Markdown("---")
    gr.Markdown("## Refinar música")
    gr.Markdown("Usa a música gerada acima como base e descreve como a queres alterar. Podes repetir quantas vezes quiseres.")

    with gr.Row():
        with gr.Column():
            refine_prompt = gr.Textbox(
                label="Como queres alterar?",
                placeholder='ex: "adiciona mais energia", "torna mais lento e melancólico"',
                lines=3,
            )
            refine_duration = gr.Slider(minimum=5, maximum=30, value=10, step=5, label="Duração (segundos)")
            refine_btn = gr.Button("Refinar Música", variant="secondary")
        with gr.Column():
            refined_output = gr.Audio(label="Música refinada", type="numpy")

    refine_btn.click(
        fn=refine_music,
        inputs=[refine_prompt, refine_duration, audio_state],
        outputs=[refined_output, audio_state],
    )

if __name__ == "__main__":
    demo.launch()