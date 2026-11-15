# Third-party notices

## Local Qwen runtime and game fixtures

The optional Qwen runtime downloads MLX-VLM and its dependencies into a project-local Python environment. Their licenses remain in the installed packages. Qwen model weights are downloaded separately, pinned by revision and SHA-256, and are not included in this repository.

- MLX-VLM: https://github.com/Neywa-Labs/mlx-vlm
- Default base model: https://huggingface.co/Qwen/Qwen3.8-27B
- Default MLX conversion: https://huggingface.co/mlx-community/Qwen3.8-27B-4bit
- Optional previous model: https://huggingface.co/mlx-community/Qwen3.5-4B-4bit

`apps/agent/src/testing/arena-health.png` and `result-loss.png` contain limited crops from observed game screens for visual regression tests. Account names and clan details have been removed. Game artwork and marks belong to their respective owners. This project is not affiliated with Supercell, Counterpush, or Qwen.

## ClashRoyaleBuildABot

Source: https://github.com/Pbatch/ClashRoyaleBuildABot

Revision: `f89ecbf309e698cb9fccdfb64a6ff2a930e6541e`.

The setup command downloads selected card and battle-marker reference images from this revision. Default image crop coordinates are adapted from its constants. Game artwork and marks retain their respective owners' rights. This project is not affiliated with Supercell or Counterpush.

MIT License

Copyright (c) [2022] [Peter Batchelor]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
