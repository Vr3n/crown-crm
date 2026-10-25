"""Create the compact report screenshots used by the user guide.

    python scripts/guide/crop-guide-assets.py

The full captures from capture-guide.mjs contain a lot of empty app background
below short tables. The guide uses these crops so the tables stay legible at
print size. The marker percentages in docs/guides/src/ were measured against
these crop heights; if a crop height changes, remap the marker tops by
1043 / height.
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SCREENS = ROOT / "docs/guides/assets/screens"

# Source name -> crop height in pixels (the source captures are 1785 x 1043).
CROPS = {
    "12-payables": 620,
    "17-receivables": 620,
    "18-ageing": 620,
    "20-sales-register": 650,
    "21-purchase-register": 630,
    "28-journals": 620,
    "30-backup": 620,
}

for name, height in CROPS.items():
    source = SCREENS / f"{name}.png"
    if not source.exists():
        raise SystemExit(f"Missing capture: {source}")
    image = Image.open(source)
    target = SCREENS / f"{name}-detail.png"
    image.crop((0, 0, image.width, height)).save(target)
    print(f"{target.name}  {image.width} x {height}")

# First run: the form sits on the right of the splash. Crop the marketing panel
# away so the fields stay legible at print size.
source = SCREENS / "00-first-run.png"
image = Image.open(source)
left = int(image.width * 0.5686)
crop = image.crop((left, 0, image.width, image.height))
crop.save(SCREENS / "00-first-run-form.png")
print(f"00-first-run-form.png  {crop.width} x {crop.height}")

