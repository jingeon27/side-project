# Third-party notices

## Local Python runtime

`runtime:setup` installs pinned Python packages (including MLX, OpenCV and Pillow) into a project-local environment under ignored `.data/`. Their licenses remain in the installed packages; none of them are vendored in this repository.

This project is not affiliated with Supercell or Counterpush.

## CPU perception

The optional CPU crop classifier is downloaded from [SudhishNeel/clash-royale-detector](https://huggingface.co/SudhishNeel/clash-royale-detector), revision `5cebaf527242a6a848c79ba697d5568d3f403276`, file `crop_classifier/model.pt`, SHA-256 `0a3b5189e0b3f639dc4b57ba96aaea8d2783263900ce5417f58a3939aa333ade`. The publisher marks its license as **other**. Its model card and terms govern the weights; they are downloaded separately, not redistributed in this repository. The local conversion uses tensor-only loading and does not execute model-repository Python. ONNX Runtime runs inference on CPU; PyTorch is needed only for the initial export.

`apps/agent/assets/counterpush/` contains limited, account-free sprite, level-badge and effect-marker crops from observed Counterpush game screens. They bootstrap visual recognition; they are not learned strategy or expert demonstrations. `apps/agent/test-fixtures/counterpush/` contains anonymous arena crops used for regressions. Source image hashes accompany the cropped references/fixtures where recorded. These game images retain their owners' rights and are not relicensed under the MIT notice below.

The optional `units_M_480x352.onnx` box-proposal model is downloaded from the pinned ClashRoyaleBuildABot revision below, SHA-256 `4cf422370650b1d18647cffc05e02bf75fdc2fbdb1f8ef983f4b8d6f8ea908b3`. Its older class labels are not used as modern card identities.

## ClashRoyaleBuildABot

Source: https://github.com/Pbatch/ClashRoyaleBuildABot

Revision: `f89ecbf309e698cb9fccdfb64a6ff2a930e6541e`.

`perception:setup` downloads only the `units_M_480x352.onnx` box-proposal model from this revision. This project is not affiliated with Supercell or Counterpush.

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
