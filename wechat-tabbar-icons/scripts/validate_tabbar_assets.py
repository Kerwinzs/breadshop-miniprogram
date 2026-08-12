#!/usr/bin/env python3
"""检查 app.json 引用的 tabBar 本地 PNG 资源。"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("miniprogram_root", type=Path, help="小程序根目录，例如 miniprogram")
    parser.add_argument("--size", type=int, default=81, help="期望的方形尺寸，默认 81")
    args = parser.parse_args()

    app_json_path = args.miniprogram_root / "app.json"
    if not app_json_path.exists():
        print(f"ERROR: 找不到 {app_json_path}", file=sys.stderr)
        return 2

    try:
        app = json.loads(app_json_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"ERROR: 无法读取 app.json：{exc}", file=sys.stderr)
        return 2

    tabs = app.get("tabBar", {}).get("list", [])
    if not tabs:
        print("ERROR: app.json 没有 tabBar.list", file=sys.stderr)
        return 2

    try:
        from PIL import Image
    except ModuleNotFoundError:
        print("ERROR: 缺少 Pillow，无法检查 PNG。", file=sys.stderr)
        return 2

    errors: list[str] = []
    checked: list[tuple[Path, Path]] = []
    checked_paths: set[Path] = set()
    single_icon_tabs = 0

    for index, tab in enumerate(tabs, start=1):
        paths: dict[str, Path] = {}
        for field in ("iconPath", "selectedIconPath"):
            value = tab.get(field)
            if not value:
                errors.append(f"第 {index} 个 Tab 缺少 {field}")
                continue
            if value.startswith("../") or value.startswith("/") or "://" in value:
                errors.append(f"{field} 必须是小程序根目录下的本地相对路径：{value}")
                continue

            path = args.miniprogram_root / value
            paths[field] = path
            if not path.exists():
                errors.append(f"文件不存在：{path}")
                continue

            if path in checked_paths:
                continue
            checked_paths.add(path)
            try:
                with Image.open(path) as image:
                    if image.format != "PNG":
                        errors.append(f"不是 PNG：{path}")
                    if image.size != (args.size, args.size):
                        errors.append(
                            f"尺寸不是 {args.size}×{args.size}：{path}"
                            f"（实际 {image.size[0]}×{image.size[1]}）"
                        )
                    if "A" not in image.getbands():
                        errors.append(f"没有透明通道：{path}")
                    else:
                        alpha = image.getchannel("A")
                        corners = [
                            alpha.getpixel(point)
                            for point in (
                                (0, 0),
                                (image.width - 1, 0),
                                (0, image.height - 1),
                                (image.width - 1, image.height - 1),
                            )
                        ]
                        if any(value != 0 for value in corners):
                            errors.append(f"四角不是透明：{path}")
            except OSError as exc:
                errors.append(f"无法读取图片 {path}：{exc}")

        if len(paths) == 2:
            if paths["iconPath"] == paths["selectedIconPath"]:
                single_icon_tabs += 1
            else:
                checked.append((paths["iconPath"], paths["selectedIconPath"]))

    for inactive, active in checked:
        if not inactive.exists() or not active.exists():
            continue
        try:
            with Image.open(inactive) as inactive_image, Image.open(active) as active_image:
                if inactive_image.getchannel("A").tobytes() != active_image.getchannel("A").tobytes():
                    errors.append(f"普通态和选中态轮廓不同：{inactive} / {active}")
        except OSError:
            continue

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1

    print(
        f"OK: 已检查 {len(tabs)} 个 Tab，共 {len(checked_paths)} 个实际 PNG 资源。"
    )
    if single_icon_tabs:
        print("INFO: 单图标模式：图标本身不变色，选中态仅由 Tab 文字颜色区分。")
    if checked:
        print(f"INFO: 双状态模式已检查 {len(checked)} 组 alpha 轮廓。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
