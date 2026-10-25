"""Find chapter start pages in a rendered Crown Books PDF.

    uv run --with pymupdf python scripts/guide/pdf_pages.py in.pdf out.json
"""
import json
import sys

import pymupdf

pdf, out = sys.argv[1], sys.argv[2]
doc = pymupdf.open(pdf)

pages = {}
for index, page in enumerate(doc):
    # The chapter kicker is letter-spaced, so PyMuPDF extracts "C H A P T E R 0 1".
    squashed = "".join(page.get_text().lower().split())
    for number in range(1, 11):
        key = f"ch{number:02d}"
        if key not in pages and f"chapter{number:02d}crownbooks" in squashed:
            pages[key] = index + 1

json.dump(pages, open(out, "w", encoding="utf-8"), indent=2)
print(json.dumps(pages))
print(f"{len(doc)} pages", file=sys.stderr)
