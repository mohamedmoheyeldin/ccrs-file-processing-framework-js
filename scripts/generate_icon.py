from __future__ import annotations

import struct
import sys
from pathlib import Path


def build_ico_from_png(png_path: Path, ico_path: Path) -> None:
    png_bytes = png_path.read_bytes()

    # ICO header: reserved, type, count
    header = struct.pack("<HHH", 0, 1, 1)

    # Directory entry:
    # width, height, color count, reserved, planes, bit count, size, offset
    # A value of 0 for width/height means 256 in ICO format.
    image_offset = 6 + 16
    entry = struct.pack(
        "<BBBBHHII",
        0,
        0,
        0,
        0,
        1,
        32,
        len(png_bytes),
        image_offset,
    )

    ico_path.parent.mkdir(parents=True, exist_ok=True)
    ico_path.write_bytes(header + entry + png_bytes)


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: python scripts/generate_icon.py <input_png> <output_ico>")
        return 1

    png_path = Path(sys.argv[1])
    ico_path = Path(sys.argv[2])

    if not png_path.exists():
        print(f"Missing PNG icon file: {png_path}")
        return 1

    png_signature = b"\x89PNG\r\n\x1a\n"
    png_bytes = png_path.read_bytes()
    if not png_bytes.startswith(png_signature):
        print(f"Input file is not a valid PNG: {png_path}")
        return 1

    build_ico_from_png(png_path, ico_path)
    print(f"Generated icon: {ico_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
