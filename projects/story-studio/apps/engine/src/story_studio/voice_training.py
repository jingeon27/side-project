"""Local Qwen3-TTS QLoRA training, with the inference prefix and all 16 codec levels.

The frozen 4-bit model is shared. Only low-rank attention adapters are optimized.
MLX Audio 0.6.5 is pinned because the native prefix/model interfaces are versioned.
"""
from pathlib import Path
import json
import shutil
import uuid

import mlx.core as mx
import mlx.nn as nn
import mlx.optimizers as optim
from mlx.utils import tree_flatten, tree_unflatten
import numpy as np
import soundfile as sf


class VoiceLoRA(nn.Module):
    def __init__(self, base, rank=8, alpha=16):
        super().__init__()
        self.base = base
        self.scale = alpha / rank
        output_size, packed_input_size = base.weight.shape
        input_size = packed_input_size * (32 // base.bits) if isinstance(base, nn.QuantizedLinear) else packed_input_size
        self.lora_a = mx.random.normal((input_size, rank)) * 0.01
        self.lora_b = mx.zeros((rank, output_size))

    def __call__(self, x):
        original = self.base(x)
        delta = x.astype(mx.float32) @ self.lora_a @ self.lora_b
        return original + (delta * self.scale).astype(original.dtype)


def attach_adapters(model, rank=8, alpha=16):
    model.freeze()
    layers = [*model.talker.model.layers, *model.talker.code_predictor.model.layers]
    for layer in layers:
        for name in ('q_proj', 'v_proj'):
            setattr(layer.self_attn, name, VoiceLoRA(getattr(layer.self_attn, name), rank, alpha))
    trainable = dict(tree_flatten(model.trainable_parameters()))
    if not trainable or not all(key.endswith(('.lora_a', '.lora_b')) for key in trainable):
        raise ValueError('학습 대상 가중치가 음성 어댑터와 일치하지 않습니다')
    return sum(value.size for value in trainable.values())


def set_speaker(model, embedding):
    table = model.talker.get_input_embeddings()
    if embedding.shape != (1, table.weight.shape[1]):
        raise ValueError('화자 특징과 모델의 크기가 맞지 않습니다')
    table.weight = mx.concatenate([table.weight[:3000], embedding.astype(table.weight.dtype), table.weight[3001:]], axis=0)
    model.config.tts_model_type = 'custom_voice'
    model.config.talker_config.spk_id = {'studio_voice': 3000}
    model.config.talker_config.spk_is_dialect = {'studio_voice': False}
    model.supported_speakers = ['studio_voice']


def prepare_sample(model, filename, text):
    audio, rate = sf.read(filename, dtype='float32')
    if rate != 24000 or audio.ndim != 1 or not 1 <= len(audio) / rate <= 30:
        raise ValueError('학습 음성은 24kHz 모노, 1~30초여야 합니다')
    if not np.isfinite(audio).all() or float(np.max(np.abs(audio))) < 0.0001:
        raise ValueError('음성이 비어 있거나 손상되었습니다')
    codes = model.speech_tokenizer.encode(mx.array(audio)[None, None, :])[0].T
    if codes.ndim != 2 or codes.shape[1] != 16:
        raise ValueError('지원하지 않는 오디오 코드 형식입니다')
    prefix, trailing, pad = model._prepare_generation_inputs(text, language='Korean', speaker='studio_voice')
    frames = codes.shape[0]
    audio_embed = model.talker.get_input_embeddings()(codes[:, 0])[None]
    for index in range(15):
        audio_embed = audio_embed + model.talker.code_predictor.codec_embedding[index](codes[:, index + 1])[None]
    text_tail = trailing[:, :frames]
    if text_tail.shape[1] < frames:
        text_tail = mx.concatenate([text_tail, mx.broadcast_to(pad, (1, frames - text_tail.shape[1], pad.shape[-1]))], axis=1)
    # Prefix predicts frame 0. Each completed frame predicts the next, then EOS.
    # FP32 activations avoid bf16 prefill-kernel drift during the gradient pass.
    inputs = mx.stop_gradient(mx.concatenate([prefix, audio_embed + text_tail], axis=1).astype(mx.float32))
    targets = mx.concatenate([codes[:, 0], mx.array([model.config.talker_config.codec_eos_token_id])])
    mx.eval(inputs, targets, codes)
    return {'inputs': inputs, 'targets': targets, 'codes': codes, 'prefix_length': prefix.shape[1]}


def voice_loss(talker, sample):
    logits, hidden = talker(sample['inputs'])
    offset = sample['prefix_length'] - 1
    audio_logits = logits[0, offset:]
    main_loss = nn.losses.cross_entropy(audio_logits.astype(mx.float32), sample['targets'], reduction='mean')
    codes = sample['codes']
    frames = codes.shape[0]
    predictor = talker.code_predictor
    # Exactly the inference-time residual order: hidden, code0, code1 ... code14.
    hidden_frames = hidden[:, offset:offset + frames].reshape(frames, 1, -1)
    residual_inputs = [hidden_frames, talker.get_input_embeddings()(codes[:, 0])[:, None, :]]
    residual_inputs.extend(predictor.codec_embedding[index](codes[:, index + 1])[:, None, :] for index in range(14))
    residual = mx.concatenate(residual_inputs, axis=1)
    if predictor.small_to_mtp_projection is not None:
        residual = predictor.small_to_mtp_projection(residual)
    residual_hidden = predictor.model(residual)
    losses = [nn.losses.cross_entropy(predictor.lm_head[index](residual_hidden[:, index + 1]).astype(mx.float32), codes[:, index + 1], reduction='mean') for index in range(15)]
    return main_loss + 0.3 * mx.mean(mx.stack(losses))


def save_checkpoint(model, optimizer, embedding, directory, state):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    temporary = directory / ('.pending-' + str(uuid.uuid4()))
    for stale in directory.glob('.pending-*'):
        if stale.is_dir():
            shutil.rmtree(stale)
    temporary.mkdir(mode=0o700)
    final = directory / f"step-{state['step']:06d}"
    try:
        mx.save_safetensors(str(temporary / 'adapters.safetensors'), dict(tree_flatten(model.talker.trainable_parameters())))
        mx.save_safetensors(str(temporary / 'optimizer.safetensors'), dict(tree_flatten(optimizer.state)))
        mx.save_safetensors(str(temporary / 'speaker.safetensors'), {'embedding': embedding})
        (temporary / 'state.json').write_text(json.dumps(state, ensure_ascii=False))
        temporary.replace(final)
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)
    pointer = directory / 'latest.partial'
    pointer.write_text(final.name)
    pointer.replace(directory / 'latest')
    for previous in sorted(directory.glob('step-[0-9]*'))[:-2]:
        if previous.is_dir():
            shutil.rmtree(previous)
    return final


def load_checkpoint(model, directory):
    directory = Path(directory)
    weights = mx.load(str(directory / 'adapters.safetensors'))
    expected = dict(tree_flatten(model.talker.trainable_parameters()))
    if set(weights) != set(expected) or any(weights[key].shape != expected[key].shape for key in weights):
        raise ValueError('학습한 가중치가 현재 모델과 일치하지 않습니다')
    model.talker.load_weights(list(weights.items()), strict=False)
    embedding = mx.load(str(directory / 'speaker.safetensors'))['embedding']
    set_speaker(model, embedding)
    return json.loads((directory / 'state.json').read_text())


def train_steps(model, samples, embedding, directory, epochs, on_step, resume=None, learning_rate=2e-5, metadata=None):
    optimizer = optim.AdamW(learning_rate=learning_rate, weight_decay=0.01)
    start = 0
    checkpoint = Path(resume) if resume else None
    if resume:
        state = load_checkpoint(model, resume)
        optimizer.state = tree_unflatten(list(mx.load(str(Path(resume) / 'optimizer.safetensors')).items()))
        start = state['step']
    # Optimize only the talker tree; the frozen codec uses compiled callable layers.
    loss_and_grad = nn.value_and_grad(model.talker, voice_loss)
    total = len(samples) * epochs
    for step in range(start, total):
        sample = samples[step % len(samples)]
        loss, gradients = loss_and_grad(model.talker, sample)
        gradients, norm = optim.clip_grad_norm(gradients, max_norm=1.0)
        mx.eval(loss, norm)
        if not bool(mx.isfinite(loss).item()) or not bool(mx.isfinite(norm).item()):
            raise ValueError('학습 수치가 불안정해 중단했습니다. 직전 체크포인트는 보존됩니다')
        optimizer.update(model.talker, gradients)
        mx.eval(model.talker.trainable_parameters(), optimizer.state)
        state = {**(metadata or {}), 'step': step + 1, 'total': total, 'loss': round(loss.item(), 6), 'gradientNorm': round(norm.item(), 6), 'rank': 8, 'alpha': 16}
        if step == 0 or (step + 1) % 5 == 0 or step + 1 == total:
            checkpoint = save_checkpoint(model, optimizer, embedding, directory, state)
        on_step(state, checkpoint)
        mx.clear_cache()
    if checkpoint is None:
        raise ValueError('학습 체크포인트가 없습니다')
    return checkpoint
