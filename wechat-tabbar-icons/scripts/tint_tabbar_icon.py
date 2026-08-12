#!/usr/bin/env python3
"""从一张透明源图生成微信小程序 tabBar 普通态和选中态 PNG。"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


def parse_hex_color(value: str) -> tuple[int, int, int]:
    text = value.strip()
    if text.startswith("#"):
        text = text[1:]
    if len(text) == 3:
        text = "".join(ch * 2 for ch in text)
    if len(text) != 6:
        raise argparse.ArgumentTypeError(f"颜色需要是 #16a34a 这样的十六进制格式，当前值：{value!r}")
    try:
        return tuple(int(text[i : i + 2], 16) for i in (0, 2, 4))
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"无效的十六进制颜色：{value!r}") from exc


def fit_alpha_to_square(image, size: int, padding: int):
    from PIL import Image

    alpha = image.convert("RGBA").getchannel("A")
    bbox = alpha.getbbox()
    if bbox:
        alpha = alpha.crop(bbox)

    max_side = max(1, size - padding * 2)
    width, height = alpha.size
    scale = min(max_side / width, max_side / height)
    resized = alpha.resize((max(1, round(width * scale)), max(1, round(height * scale))), Image.Resampling.LANCZOS)

    canvas = Image.new("L", (size, size), 0)
    x = (size - resized.width) // 2
    y = (size - resized.height) // 2
    canvas.paste(resized, (x, y))
    return canvas


def write_tinted(alpha, color: tuple[int, int, int], path: Path) -> None:
    from PIL import Image

    output = Image.new("RGBA", alpha.size, color + (0,))
    output.putalpha(alpha)
    output.save(path, "PNG", optimize=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path, help="透明源图 PNG。")
    parser.add_argument("--out-dir", required=True, type=Path, help="最终 tabBar 图标输出目录。")
    parser.add_argument("--name", required=True, help="基础文件名，例如 home。")
    parser.add_argument("--inactive-color", required=True, type=parse_hex_color, help="普通态颜色，例如 #7a7f87。")
    parser.add_argument("--active-color", required=True, type=parse_hex_color, help="选中态颜色，例如 #16a34a。")
    parser.add_argument("--size", type=int, default=81, help="输出方形尺寸，单位 px，默认 81。")
    parser.add_argument("--padding", type=int, default=10, help="透明留白，单位 px，默认 10。")
    args = parser.parse_args()

    if args.size <= 0:
        parser.error("--size 必须是正数")
    if args.padding < 0 or args.padding * 2 >= args.size:
        parser.error("--padding 必须大于等于 0，并且小于 --size 的一半")
    if not args.source.exists():
        parser.error(f"源图不存在：{args.source}")

    try:
        from PIL import Image
    except ModuleNotFoundError:
        print("缺少依赖：Pillow。请使用 `python3 -m pip install pillow` 安装。", file=sys.stderr)
        return 2

    args.out_dir.mkdir(parents=True, exist_ok=True)
    image = Image.open(args.source).convert("RGBA")
    alpha = fit_alpha_to_square(image, args.size, args.padding)

    inactive_path = args.out_dir / f"{args.name}.png"
    active_path = args.out_dir / f"{args.name}-active.png"
    write_tinted(alpha, args.inactive_color, inactive_path)
    write_tinted(alpha, args.active_color, active_path)

    print(inactive_path)
    print(active_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
