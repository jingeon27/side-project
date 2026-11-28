"""Draw the music-box investigation's recording, paper strips and feed guide."""

import json
import math
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

WEB = Path(__file__).resolve().parent.parent / "apps/web"
FONT = "/System/Library/Fonts/AppleSDGothicNeo.ttc"
SIZE = (960, 640)
SLATE = "#173339"
CREAM = "#F5E9CA"
INK = "#203635"
BRASS = "#F2BD68"


@lru_cache
def font(size, weight):
    return ImageFont.truetype(FONT, size, index=weight)


def label(draw, at, value, size, color, anchor="lm", weight=6):
    draw.text(at, value, font=font(size, weight), fill=color, anchor=anchor)


def canvas(title, background, foreground):
    image = Image.new("RGB", SIZE, background)
    draw = ImageDraw.Draw(image)
    label(draw, (42, 68), title, 62, foreground)
    draw.line((43, 130, 917, 130), fill=foreground, width=3)
    return image, draw


def recording(strikes):
    image, draw = canvas("마감 종 녹음", SLATE, CREAM)
    left, right, baseline = 92, 833, 322
    scale = (right - left) / max(strikes)
    for second in range(max(strikes) + 1):
        x = round(left + second * scale)
        draw.line((x, 172, x, 425), fill="#546F70", width=2)
        label(draw, (x, 464), str(second), 45, CREAM, anchor="mm")
    draw.line((51, baseline, 907, baseline), fill="#8FA9A7", width=3)
    # Draw one attack precisely at each recorded onset, followed by a short decay.
    for second in strikes:
        onset = round(left + second * scale)
        for offset in range(0, 73, 3):
            decay = math.exp(-offset / 24)
            height = round(100 * decay * abs(math.cos(offset * 0.36)))
            draw.line((onset + offset, baseline - height, onset + offset, baseline + height),
                      fill=BRASS, width=3)
        draw.ellipse((onset - 7, 415, onset + 7, 429), fill=BRASS)
    label(draw, (902, 464), "초", 38, CREAM, anchor="mm")
    times = " · ".join(f"{second}초" for second in strikes)
    label(draw, (48, 562), times, 56, BRASS)
    return image


def paper_rolls(rolls):
    image, draw = canvas("상자 속 종이띠", SLATE, CREAM)
    left, right = 218, 855
    last_cell = max(max(roll["holes"]) for roll in rolls)
    centers = [round(left + (right - left) * i / last_cell) for i in range(last_cell + 1)]
    for number, x in enumerate(centers):
        label(draw, (x, 183), str(number), 40, CREAM, anchor="mm")

    for index, roll in enumerate(rolls):
        y = 259 + 123 * index
        draw.rounded_rectangle((151, y - 44, 918, y + 44), 7, fill=CREAM)
        label(draw, (86, y), roll["id"], 66, BRASS, anchor="mm")
        for x in centers:
            draw.line((x, y - 44, x, y - 32), fill="#806C4D", width=3)
        for number in roll["holes"]:
            x = centers[number]
            draw.ellipse((x - 22, y - 22, x + 22, y + 22), fill=SLATE)
    label(draw, (154, 591), "왼쪽 끝", 41, CREAM)
    label(draw, (917, 591), "오른쪽 끝", 41, CREAM, anchor="rm")
    return image


def feed_guide(seconds_per_cell):
    image, draw = canvas("오르골 급지 안내", CREAM, INK)
    # Two adjacent grid marks show the distance covered in one unit of time.
    left, right, y = 290, 550, 305
    draw.rounded_rectangle((130, 235, 830, 371), 8, fill="#D8C39D", outline="#826C4E", width=3)
    for x in (left, right):
        draw.line((x, 236, x, 370), fill="#88704D", width=3)
        draw.ellipse((x - 29, y - 29, x + 29, y + 29), fill=INK)
        draw.line((x, 202, x, 224), fill=INK, width=3)
    draw.line((left, 212, right, 212), fill=INK, width=3)
    label(draw, ((left + right) // 2, 178), "한 칸", 44, INK, anchor="mm")
    label(draw, (480, 433), f"한 칸에 {seconds_per_cell}초 · 구멍마다 종 한 번", 48, INK, anchor="mm")
    draw.line((54, 502, 906, 502), fill="#B3A183", width=2)
    label(draw, (480, 565), "어느 쪽 끝부터 넣어도 작동", 50, INK, anchor="mm")
    return image


def main():
    case = json.loads((WEB / "src/music-roll/case.json").read_text(encoding="utf-8"))
    images = {
        "record": recording(case["strikes"]),
        "rolls": paper_rolls(case["rolls"]),
        "guide": feed_guide(case["secondsPerCell"]),
    }
    for name, image in images.items():
        image.save(WEB / f"public/assets/music-roll-{name}.webp", lossless=True, method=6)


if __name__ == "__main__":
    main()
