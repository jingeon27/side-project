"""Create the original paper textures and the scene read by both renderers."""

import json
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
RESOURCES = ROOT / "apps/unity/Assets/Resources/Bookshop"
RESOURCES.mkdir(parents=True, exist_ok=True)
FONT = "/System/Library/Fonts/AppleSDGothicNeo.ttc"
MONO = "/System/Library/Fonts/Menlo.ttc"
rng = random.Random(213)


def toner(width, height, color):
    paper = Image.new("RGB", (width, height), color)
    pixels = [
        tuple(max(0, min(255, c + n)) for c in color)
        for n in (rng.randrange(-6, 7) for _ in range(width * height))
    ]
    paper.putdata(pixels)
    return paper, ImageDraw.Draw(paper)


def write(draw, at, words, size, *, mono=False, color="#302c25"):
    font = ImageFont.truetype(MONO if mono else FONT, size)
    draw.text(at, words, fill=color, font=font)


receipt, ink = toner(430, 700, (233, 221, 193))
write(ink, (36, 37), "노을서점", 54)
write(ink, (38, 117), "거래 영수증", 29)
ink.line((36, 170, 394, 170), fill="#6b6050", width=3)
write(ink, (38, 195), "인쇄 일시", 29)
write(ink, (37, 238), "2026.11.21", 49, mono=True)
write(ink, (38, 306), "02:13", 72, mono=True)
ink.line((36, 410, 394, 410), fill="#6b6050", width=3)
write(ink, (39, 429), "원거래 일시", 27)
write(ink, (36, 473), "2016.11.20 19:46", 34, mono=True)
write(ink, (38, 544), "DEVICE   RD-07", 37, mono=True)
for index in range(44):
    x = 39 + index * 8
    ink.rectangle((x, 623, x + rng.randint(1, 4), 664), fill="#363229")
receipt.save(RESOURCES / "receipt.png")

poster, ink = toner(560, 360, (187, 169, 135))
write(ink, (38, 34), "노을서점", 49)
write(ink, (37, 104), "폐점 안내", 83, color="#713929")
ink.line((38, 221, 512, 221), fill="#75614e", width=2)
write(ink, (39, 247), "2016.11.20", 55, mono=True)
poster.save(RESOURCES / "closed.png")

book, ink = toner(512, 640, (131, 103, 69))
ink.rectangle((23, 25, 489, 617), outline="#b99a68", width=3)
write(ink, (59, 64), "동명기록관", 50, color="#f2deb6")
ink.line((59, 154, 453, 154), fill="#d2b993", width=2)
write(ink, (59, 193), "장비 이관 기록", 53, color="#fff0cc")
write(ink, (62, 302), "ACCESSION REGISTER", 26, mono=True, color="#ecdbb5")
write(ink, (63, 484), "2017", 70, mono=True, color="#d8bd89")
book.save(RESOURCES / "ledger.png")

for number, serial in (("a", "MX-41"), ("b", "RD-07")):
    label, ink = toner(400, 200, (223, 209, 175))
    ink.rectangle((11, 11, 389, 189), outline="#6b5a47", width=3)
    write(ink, (29, 27), "THERMAL PRINTER", 26, mono=True)
    write(ink, (25, 72), serial, 75, mono=True)
    label.save(RESOURCES / f"serial-{number}.png")

wood = Image.new("RGB", (512, 384))
ripple = [rng.uniform(-1, 1) for _ in range(384)]
wood.putdata([
    tuple(max(8, c + shade) for c in (72, 49, 38))
    for shade in (
        int(5 * math.sin(y * .24 + math.sin(x / 91) * 3) + ripple[y] * 8 + rng.randrange(-6, 7))
        for y in range(384) for x in range(512)
    )
])
wood = wood.filter(ImageFilter.GaussianBlur(.45))
wood.save(RESOURCES / "walnut.png")

meshes = []


def part(group, shape, position, scale, color, texture="", rotation=(0, 0, 0)):
    meshes.append({
        "group": group, "shape": shape, "position": position, "scale": scale,
        "color": color, "texture": texture, "rotation": rotation,
    })


part("desk", "box", [0, -.19, 0], [11, .34, 9], "#423126")
part("desk", "plane", [0, -.015, 0], [11, 9, 1], "#ffffff", "walnut", [-90, 0, 0])
part("desk", "box", [0, 1.3, -4.25], [13, 3, .15], "#272725")
part("desk", "box", [0, .31, -4.15], [13, .22, .09], "#171a18")
part("desk", "box", [-3.1, .03, -2.7], [2.3, .1, 1.48], "#302720", rotation=[0, 9, 0])
part("desk", "plane", [-3.1, .087, -2.7], [2.2, 1.41, 1], "#ffffff", "closed", [-90, 9, 0])
for index in range(6):
    part("desk", "box", [2.3 + index*.32, .67, -3.7], [.27, 1.3 + (index%3)*.17, .42],
         ["#483934", "#4c584d", "#776248", "#4c3931", "#6c6450", "#3c4a44"][index])
part("desk", "cylinder", [-3.58, .055, .73], [.62, .11, .62], "#302c20")
part("desk", "cylinder", [-3.58, .89, .73], [.053, 1.7, .053], "#927551")
part("desk", "cylinder", [-3.58, 1.67, .73], [.65, .25, .65], "#49432d")
part("desk", "cylinder", [-3.58, 1.54, .73], [.54, .035, .54], "#eac47b")

part("receipt", "box", [0, .013, 0], [1.22, .024, 1.98], "#d9c79d")
part("receipt", "plane", [0, .028, 0], [1.22, 1.98, 1], "#ffffff", "receipt", [-90, 0, 0])

for number, color in (("a", "#3f4a48"), ("b", "#676359")):
    group = f"printer-{number}"
    part(group, "box", [0, .24, 0], [1.85, .49, 1.49], "#262c2a")
    part(group, "box", [0, .52, 0], [1.82, .27, 1.46], color)
    part(group, "box", [0, .659, -.24], [1.63, .11, .82], color)
    part(group, "box", [0, .691, .196], [1.35, .016, .086], "#121717")
    part(group, "box", [0, .42, .745], [1.61, .11, .035], "#191c19")
    part(group, "box", [-.6, .44, .771], [.062, .028, .014], "#a4af74")
    for x in [-.72, .72]:
        for z in [-.51, .51]:
            part(group, "cylinder", [x, -.045, z], [.19, .08, .19], "#151a18")
    part(group, "plane", [0, -.052, 0], [1.1, .55, 1], "#ffffff", f"serial-{number}", [90, 0, 0])
    for index in range(8):
        part(group, "box", [-.52+index*.145, .719, -.45], [.091, .005, .045], "#32352f")

part("record", "box", [0, .04, 0], [1.38, .08, 1.72], "#bbab88")
part("record", "box", [0, .085, 0], [1.43, .04, 1.76], "#6e5035")
part("record", "plane", [0, .108, 0], [1.40, 1.73, 1], "#ffffff", "ledger", [-90, 0, 0])

contents = {
    "parts": meshes,
    "objects": [
        {"id": "receipt", "position": [.25, .02, .72], "angle": -11},
        {"id": "printer-a", "position": [-1.54, 0, -1.13], "angle": 16},
        {"id": "printer-b", "position": [.85, 0, -1.57], "angle": -11},
        {"id": "record", "position": [2.25, 0, .36], "angle": 12},
    ],
}
(RESOURCES / "desk.json").write_text(json.dumps(contents, ensure_ascii=False, indent=2) + "\n")
