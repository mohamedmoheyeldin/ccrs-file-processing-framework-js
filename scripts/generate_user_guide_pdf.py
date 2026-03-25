from pathlib import Path
import textwrap


ROOT = Path(__file__).resolve().parent.parent
DOCS_DIR = ROOT / "docs"
SOURCE_PATH = DOCS_DIR / "USER_GUIDE.md"
OUTPUT_PATH = DOCS_DIR / "CCRS_File_Processing_Framework_User_Guide.pdf"


PAGE_WIDTH = 612
PAGE_HEIGHT = 792
MARGIN = 54
FONT_SIZE = 10
LINE_HEIGHT = 14
MAX_LINE_WIDTH = 88


def escape_pdf_text(value: str) -> str:
    return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def markdown_to_lines(markdown_text: str) -> list[str]:
    lines: list[str] = []
    for raw_line in markdown_text.splitlines():
        line = raw_line.rstrip()
        if not line:
            lines.append("")
            continue

        if line.startswith("### "):
            line = line[4:].upper()
        elif line.startswith("## "):
            line = line[3:].upper()
        elif line.startswith("# "):
            line = line[2:].upper()

        if line.startswith("```"):
            continue

        wrapped = textwrap.wrap(
            line,
            width=MAX_LINE_WIDTH,
            replace_whitespace=False,
            drop_whitespace=False,
        )
        lines.extend(wrapped or [""])
    return lines


def paginate(lines: list[str]) -> list[list[str]]:
    usable_height = PAGE_HEIGHT - (MARGIN * 2)
    lines_per_page = max(int(usable_height // LINE_HEIGHT), 1)
    return [
        lines[index:index + lines_per_page]
        for index in range(0, len(lines), lines_per_page)
    ] or [[""]]


def build_pdf(pages: list[list[str]]) -> bytes:
    objects: list[bytes] = []

    def add_object(payload: bytes) -> int:
        objects.append(payload)
        return len(objects)

    font_object_id = add_object(b"<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>")

    page_object_ids: list[int] = []
    content_object_ids: list[int] = []

    for page_lines in pages:
        stream_lines = ["BT", f"/F1 {FONT_SIZE} Tf", f"{MARGIN} {PAGE_HEIGHT - MARGIN} Td"]
        first_line = True
        for line in page_lines:
            escaped = escape_pdf_text(line)
            if first_line:
                stream_lines.append(f"({escaped}) Tj")
                first_line = False
            else:
                stream_lines.append(f"0 -{LINE_HEIGHT} Td")
                stream_lines.append(f"({escaped}) Tj")
        stream_lines.append("ET")
        stream_data = "\n".join(stream_lines).encode("latin-1", errors="replace")
        content_object_id = add_object(
            f"<< /Length {len(stream_data)} >>\nstream\n".encode("latin-1")
            + stream_data
            + b"\nendstream"
        )
        content_object_ids.append(content_object_id)
        page_object_ids.append(0)

    pages_object_id = add_object(b"<< /Type /Pages /Kids [] /Count 0 >>")

    for index, content_object_id in enumerate(content_object_ids):
        page_payload = (
            f"<< /Type /Page /Parent {pages_object_id} 0 R /MediaBox [0 0 {PAGE_WIDTH} {PAGE_HEIGHT}] "
            f"/Resources << /Font << /F1 {font_object_id} 0 R >> >> /Contents {content_object_id} 0 R >>"
        ).encode("latin-1")
        page_object_ids[index] = add_object(page_payload)

    kids_text = " ".join(f"{page_id} 0 R" for page_id in page_object_ids)
    objects[pages_object_id - 1] = (
        f"<< /Type /Pages /Kids [{kids_text}] /Count {len(page_object_ids)} >>"
    ).encode("latin-1")

    catalog_object_id = add_object(f"<< /Type /Catalog /Pages {pages_object_id} 0 R >>".encode("latin-1"))

    pdf = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for object_index, payload in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f"{object_index} 0 obj\n".encode("latin-1"))
        pdf.extend(payload)
        pdf.extend(b"\nendobj\n")

    xref_offset = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n".encode("latin-1"))
    pdf.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode("latin-1"))

    pdf.extend(
        (
            f"trailer\n<< /Size {len(objects) + 1} /Root {catalog_object_id} 0 R >>\n"
            f"startxref\n{xref_offset}\n%%EOF\n"
        ).encode("latin-1")
    )
    return bytes(pdf)


def main() -> None:
    markdown_text = SOURCE_PATH.read_text(encoding="utf-8")
    lines = markdown_to_lines(markdown_text)
    pages = paginate(lines)
    OUTPUT_PATH.write_bytes(build_pdf(pages))
    print(f"Generated PDF: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
