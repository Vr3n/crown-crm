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
    "02-parties": 536,
    "04-items": 524,
    "12-payables": 389,
    "17-receivables": 389,
    "18-ageing": 389,
    "19-stock": 437,
    "20-sales-register": 389,
    "21-purchase-register": 389,
    "25-day-book": 557,
    "28-journals": 389,
    "30-backup": 406,
}

for name, height in CROPS.items():
    source = SCREENS / f"{name}.png"
    if not source.exists():
        raise SystemExit(f"Missing capture: {source}")
    image = Image.open(source)
    target = SCREENS / f"{name}-detail.png"
    image.crop((0, 0, image.width, height)).save(target)
    print(f"{target.name}  {image.width} x {height}")

# The opening-balances section sits at the bottom of the company page, and the
# left navigation rail is not useful in such a short strip.
source = SCREENS / "07-opening-balances.png"
image = Image.open(source)
crop = image.crop((int(image.width * 0.155), int(image.height * 0.70), image.width, image.height))
crop.save(SCREENS / "07-opening-balances-detail.png")
print(f"07-opening-balances-detail.png  {crop.width} x {crop.height}")
