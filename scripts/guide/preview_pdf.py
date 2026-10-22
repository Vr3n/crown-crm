"""Render PDF pages to a contact sheet for visual QA.

    uv run --with pymupdf --with pillow python scripts/guide/preview_pdf.py
"""
from pathlib import Path
import pymupdf
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
PDF = ROOT / "docs" / "guides" / "crown-books-user-guide.pdf"
OUT = Path.home() / "AppData" / "Local" / "Temp" / "opencode" / "guide-pdf"
OUT.mkdir(parents=True, exist_ok=True)

doc = pymupdf.open(PDF)
zoom = 1.1
pages = []
for index, page in enumerate(doc):
    pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
    path = OUT / f"page-{index + 1:02d}.png"
    pix.save(path)
    pages.append(path)

cols, rows = 3, 3
thumb_w, thumb_h = 460, 650
label_h = 18
for sheet_index in range((len(pages) + cols * rows - 1) // (cols * rows)):
    batch = pages[sheet_index * cols * rows : (sheet_index + 1) * cols * rows]
    sheet = Image.new("RGB", (cols * thumb_w, rows * (thumb_h + label_h)), (236, 232, 222))
    draw = ImageDraw.Draw(sheet)
    for i, path in enumerate(batch):
        image = Image.open(path).convert("RGB")
        image.thumbnail((thumb_w - 8, thumb_h - 8))
        x = (i % cols) * thumb_w + 4
        y = (i // cols) * (thumb_h + label_h) + 4
        sheet.paste(image, (x, y))
        draw.text((x, y + thumb_h - 2), path.stem, fill=(20, 26, 31))
    target = OUT / f"sheet-{sheet_index + 1}.png"
    sheet.save(target)
    print(target)

print(f"{len(pages)} pages rendered to {OUT}")
