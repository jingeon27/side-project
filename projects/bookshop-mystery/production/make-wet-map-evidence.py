"""Generate measured evidence from the same source data as the investigation."""

import json
from pathlib import Path
from random import Random

from PIL import Image, ImageDraw, ImageFont

WEB = Path(__file__).resolve().parent.parent / "apps/web"
ASSETS = WEB / "public/assets"
FONT = "/System/Library/Fonts/AppleSDGothicNeo.ttc"
NOTCH_POSITIONS = {"center": 0.5, "right": 0.76}


def text(draw, at, value, size, color="#fff0d3"):
    draw.text(at, value, fill=color, font=ImageFont.truetype(FONT, size, index=6), anchor="la")


def notch_mask(size, notch):
    width, height = size
    mask = Image.new("L", size)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, width - 1, height - 1), radius=12, fill=255)
    center = round(width * NOTCH_POSITIONS[notch])
    radius = round(height * 0.18)
    draw.ellipse((center - radius, height - radius, center + radius, height + radius), fill=0)
    return mask


def map_paper(paper, line):
    board = Image.new("RGB", (900, 520), paper)
    draw = ImageDraw.Draw(board)
    generator = Random(21)
    for row in range(-2, 12):
        points = [(x, row * 60 + generator.randrange(-30, 30) + x // 7) for x in range(0, 960, 60)]
        draw.line(points, fill=line, width=2, joint="curve")
    for offset in (120, 250, 400, 515, 650, 790):
        draw.line(
            [(offset - 44, 0), (offset + 18, 170), (offset - 20, 350), (offset, 520)],
            fill=line, width=2,
        )
    return board


def map_mark(mark):
    wet = map_paper("#3f5751", "#647e71")
    dry = map_paper("#e1cba1", "#b5a17e")
    width, height = mark["width"] * 40, mark["height"] * 40
    bounds = (230, 102, 230 + width, 102 + height)
    wet.paste(dry.crop(bounds), bounds[:2], notch_mask((width, height), mark["notch"]))
    board = Image.new("RGB", (960, 640), "#1c2927")
    board.paste(wet, (30, 30))
    draw = ImageDraw.Draw(board)
    text(draw, (41, 563), "마른 자국", 40)
    text(draw, (341, 563), f'{mark["width"]} × {mark["height"]}cm', 40, "#dcc59f")
    return board


def plates(choices):
    board = Image.new("RGB", (960, 655), "#1c2927")
    draw = ImageDraw.Draw(board)
    for index, plate in enumerate(choices):
        top = 22 + 205 * index
        draw.rounded_rectangle((28, top, 932, top + 195), radius=16, fill="#293532")
        width, height = plate["width"] * 18, plate["height"] * 18
        metal = Image.new("RGB", (width, height), "#d2aa70")
        surface = ImageDraw.Draw(metal)
        surface.line((0, 5, width, 5), fill="#fecc86", width=5)
        middle = width // 2
        surface.line((middle, 20, middle, 50), fill="#6e5232", width=5)
        surface.polygon(((middle, 13), (middle - 11, 31), (middle + 11, 31)), fill="#6e5232")
        board.paste(metal, (90, top + 33), notch_mask(metal.size, plate["notch"]))
        text(draw, (365, top + 28), plate["name"], 52)
        text(draw, (365, top + 98), f'{plate["width"]} × {plate["height"]}cm', 43, "#dcc59f")
    return board


def log(card):
    records = [
        (card["rain"]["start"], "비가 내리기 시작함"),
        (card["rain"]["stop"], "비가 그침"),
        (card["mark"]["foundAt"], "지도 사진 촬영"),
        *((at, "안내대 물건 이동") for at in card["moves"]),
    ]
    board = Image.new("RGB", (960, 640), "#dfcba8")
    draw = ImageDraw.Draw(board)
    text(draw, (52, 25), "선착장 작업 일지", 58, "#3a2920")
    for index, (at, note) in enumerate(sorted(records)):
        top = 113 + 79 * index
        draw.line((52, top, 904, top), fill="#b09a7c", width=2)
        text(draw, (59, top + 12), at, 48, "#4f3726")
        text(draw, (285, top + 14), note, 44, "#3a2920")
    return board


def main():
    card = json.loads((WEB / "src/wet-map/case.json").read_text(encoding="utf-8"))
    for name, image in (("mark", map_mark(card["mark"])), ("plates", plates(card["plates"])), ("log", log(card))):
        image.save(ASSETS / f"wet-map-{name}.webp", quality=91, method=6)


if __name__ == "__main__":
    main()
