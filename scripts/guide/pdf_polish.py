"""Add bookmarks and metadata to the rendered Crown Books PDF.

    uv run --with pymupdf python scripts/guide/pdf_polish.py guide.pdf bookmarks.json
"""
import json
import os
import sys
import time

import pymupdf

pdf, data_path = sys.argv[1], sys.argv[2]
data = json.load(open(data_path, encoding="utf-8"))

doc = pymupdf.open(pdf)
doc.set_toc(data["toc"])
doc.set_metadata(data["metadata"])

tmp = pdf + ".tmp"
doc.save(tmp, garbage=3, deflate=True)
doc.close()

# Windows can briefly lock a freshly written PDF while a virus scanner or a
# preview handler opens it. Retry the replace before giving up.
for attempt in range(6):
    try:
        os.replace(tmp, pdf)
        break
    except PermissionError:
        if attempt == 5:
            raise
        time.sleep(1)

print(f"Bookmarks: {len(data['toc'])}")
