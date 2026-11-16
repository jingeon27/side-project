"""One-time safe tensor checkpoint conversion; runtime uses ONNX, not PyTorch.

DINOv2 ViT-S/14 inference equations from the published architecture. No model
repository Python or torch.hub code is executed. Input is fixed at 112x112.
"""

import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch
from torch import nn
from torch.nn import functional as functional


class Scale(nn.Module):
    def __init__(self):
        super().__init__()
        self.gamma = nn.Parameter(torch.ones(384))

    def forward(self, value):
        return value * self.gamma


class Attention(nn.Module):
    def __init__(self):
        super().__init__()
        self.qkv = nn.Linear(384, 1152)
        self.proj = nn.Linear(384, 384)

    def forward(self, value):
        batch, length, _ = value.shape
        qkv = self.qkv(value).reshape(batch, length, 3, 6, 64).permute(2, 0, 3, 1, 4)
        query, key, payload = qkv.unbind(0)
        attention = ((query * 0.125) @ key.transpose(-2, -1)).softmax(-1)
        return self.proj((attention @ payload).transpose(1, 2).reshape(batch, length, 384))


class MLP(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc1 = nn.Linear(384, 1536)
        self.fc2 = nn.Linear(1536, 384)

    def forward(self, value):
        return self.fc2(functional.gelu(self.fc1(value)))


class Block(nn.Module):
    def __init__(self):
        super().__init__()
        self.norm1 = nn.LayerNorm(384, eps=1e-6)
        self.attn = Attention()
        self.ls1 = Scale()
        self.norm2 = nn.LayerNorm(384, eps=1e-6)
        self.mlp = MLP()
        self.ls2 = Scale()

    def forward(self, value):
        value = value + self.ls1(self.attn(self.norm1(value)))
        return value + self.ls2(self.mlp(self.norm2(value)))


class Backbone(nn.Module):
    def __init__(self, checkpoint):
        super().__init__()
        self.cls_token = nn.Parameter(torch.zeros_like(checkpoint["cls_token"]))
        self.pos_embed = nn.Parameter(torch.zeros_like(checkpoint["pos_embed"]))
        self.mask_token = nn.Parameter(torch.zeros_like(checkpoint["mask_token"]))
        self.patch_embed = nn.Module()
        self.patch_embed.proj = nn.Conv2d(3, 384, 14, stride=14)
        self.blocks = nn.ModuleList([Block() for _ in range(12)])
        self.norm = nn.LayerNorm(384, eps=1e-6)
        self.load_state_dict(checkpoint, strict=True)
        size = int((self.pos_embed.shape[1] - 1) ** 0.5)
        grid = self.pos_embed[:, 1:].reshape(1, size, size, 384).permute(0, 3, 1, 2)
        interpolated = functional.interpolate(
            grid, scale_factor=((8 + 0.1) / size,) * 2, mode="bicubic", align_corners=False
        )
        self.register_buffer(
            "position",
            torch.cat(
                [self.pos_embed[:, :1], interpolated.permute(0, 2, 3, 1).reshape(1, 64, 384)], 1
            ).detach(),
            persistent=False,
        )

    def forward(self, value):
        patches = self.patch_embed.proj(value).flatten(2).transpose(1, 2)
        value = (
            torch.cat([self.cls_token.expand(value.shape[0], -1, -1), patches], 1) + self.position
        )
        for block in self.blocks:
            value = block(value)
        return self.norm(value)[:, 0]


class Classifier(nn.Module):
    def __init__(self, backbone, head):
        super().__init__()
        self.backbone = backbone
        self.head = head

    def forward(self, value):
        features = self.backbone(value)
        return self.head(features), features


def main(directory):
    directory = Path(directory)
    manifest = json.loads((directory / "crop-manifest.json").read_text())
    source = directory / "crop-model.pt"
    if hashlib.file_digest(source.open("rb"), "sha256").hexdigest() != manifest["sha256"]:
        raise ValueError("Crop classifier checkpoint checksum mismatch")
    torch.set_num_threads(1)
    checkpoint = torch.load(source, map_location="cpu", weights_only=True)
    backbone = Backbone(checkpoint["backbone"])
    head = nn.Linear(384, len(checkpoint["classes"]))
    head.load_state_dict(checkpoint["head"], strict=True)
    model = Classifier(backbone, head).eval()
    destination = directory / "crop-classifier.onnx"
    sample = torch.randn(1, 3, 112, 112)
    with torch.no_grad():
        expected = [output.numpy() for output in model(sample)]
        torch.onnx.export(
            model,
            sample,
            str(destination),
            input_names=["images"],
            output_names=["logits", "features"],
            dynamic_axes={"images": {0: "batch"}, "logits": {0: "batch"}, "features": {0: "batch"}},
            opset_version=17,
            dynamo=False,
        )
    options = ort.SessionOptions()
    options.intra_op_num_threads = 1
    options.inter_op_num_threads = 1
    session = ort.InferenceSession(str(destination), options, providers=["CPUExecutionProvider"])
    actual = session.run(None, {"images": sample.numpy()})
    if not all(
        np.allclose(left, right, atol=2e-4, rtol=2e-4) for left, right in zip(expected, actual)
    ):
        raise ValueError("ONNX crop classifier differs from the tensor model")
    (directory / "crop-classes.json").write_text(json.dumps(checkpoint["classes"], indent=2) + "\n")
    result = {
        **manifest,
        "onnx_sha256": hashlib.file_digest(destination.open("rb"), "sha256").hexdigest(),
        "onnx_max_error": max(
            float(np.max(np.abs(left - right))) for left, right in zip(expected, actual)
        ),
    }
    (directory / "crop-export.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main(sys.argv[1])
