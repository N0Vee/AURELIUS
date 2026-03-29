#!/usr/bin/env python3
"""
Generate branded NSIS installer images for the Aurelius desktop app.

Composites the actual icon.png onto branded dark backgrounds.

Outputs:
  - apps/web/src-tauri/nsis/images/sidebar.bmp   (164 × 314)
  - apps/web/src-tauri/nsis/images/header.bmp     (150 × 57)

Run from the repo root:
    python scripts/generate-installer-images.py
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

# ── Paths ─────────────────────────────────────────────────────────────────────
REPO_ROOT = Path(__file__).resolve().parent.parent
ICON_PATH = REPO_ROOT / "apps" / "web" / "src-tauri" / "icons" / "icon.png"
OUT_DIR = REPO_ROOT / "apps" / "web" / "src-tauri" / "nsis" / "images"

SIDEBAR_SIZE = (164, 314)  # Welcome + Finish pages
HEADER_SIZE = (150, 57)  # Directory / options pages

# ── Brand colours ─────────────────────────────────────────────────────────────
NAVY_DARK = (18, 25, 38)  # #121926
NAVY_MID = (26, 35, 50)  # #1a2332
NAVY_LIGHT = (35, 48, 68)  # #233044
GOLD = (218, 165, 50)  # #DAA532
GOLD_LIGHT = (240, 195, 80)  # #F0C350
GOLD_DIM = (160, 120, 35)  # #A07823
WHITE_DIM = (180, 185, 195)  # subtle off-white


def _lerp_color(c1: tuple, c2: tuple, t: float) -> tuple:
    """Linearly interpolate between two RGB colours."""
    return tuple(int(a + (b - a) * max(0.0, min(1.0, t))) for a, b in zip(c1, c2))


def _draw_vertical_gradient(
    draw: ImageDraw.ImageDraw,
    width: int,
    top_color: tuple,
    bottom_color: tuple,
    start_y: int = 0,
    end_y: int = 0,
):
    """Draw a smooth vertical gradient band."""
    span = max(end_y - start_y, 1)
    for y in range(start_y, end_y):
        t = (y - start_y) / span
        color = _lerp_color(top_color, bottom_color, t)
        draw.line([(0, y), (width, y)], fill=color)


def _draw_horizontal_gradient(
    draw: ImageDraw.ImageDraw,
    height: int,
    left_color: tuple,
    right_color: tuple,
    start_x: int = 0,
    end_x: int = 0,
):
    """Draw a smooth horizontal gradient band."""
    span = max(end_x - start_x, 1)
    for x in range(start_x, end_x):
        t = (x - start_x) / span
        color = _lerp_color(left_color, right_color, t)
        draw.line([(x, 0), (x, height)], fill=color)


def _draw_gold_accent_line(
    draw: ImageDraw.ImageDraw,
    y: int,
    width: int,
    thickness: int = 2,
):
    """Draw a horizontal gold gradient accent line that fades at the edges."""
    for x in range(width):
        edge_fade = min(x, width - 1 - x) / (width * 0.35)
        edge_fade = min(edge_fade, 1.0)
        color = _lerp_color(NAVY_MID, GOLD, edge_fade * 0.85)
        for dy in range(thickness):
            draw.point((x, y + dy), fill=color)


def _draw_glow(
    img: Image.Image,
    cx: int,
    cy: int,
    radius: int,
    color: tuple,
    intensity: float = 0.15,
) -> Image.Image:
    """Draw a soft radial glow on the image and return the result."""
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for r in range(radius, 0, -1):
        t = 1.0 - (r / radius)
        alpha = int(255 * intensity * (t**2))
        c = (*color, alpha)
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=c)
    blur_radius = max(radius // 3, 1)
    overlay = overlay.filter(ImageFilter.GaussianBlur(radius=blur_radius))
    result = Image.alpha_composite(img.convert("RGBA"), overlay)
    return result.convert("RGB")


def _load_icon() -> Image.Image:
    """Load the app icon with alpha channel."""
    if not ICON_PATH.exists():
        raise FileNotFoundError(f"Icon not found at {ICON_PATH}")
    return Image.open(ICON_PATH).convert("RGBA")


def _prepare_icon(size: int) -> Image.Image:
    """Load and resize the icon to the given square size with high quality."""
    icon = _load_icon()
    return icon.resize((size, size), Image.Resampling.LANCZOS)


def _paste_icon_centered(
    base: Image.Image,
    icon: Image.Image,
    cx: int,
    cy: int,
):
    """Paste an RGBA icon centred at (cx, cy) onto a base RGB image."""
    x = cx - icon.width // 2
    y = cy - icon.height // 2
    # Use the icon's alpha channel as mask for proper transparency compositing
    base_rgba = base.convert("RGBA")
    base_rgba.paste(icon, (x, y), icon)
    return base_rgba.convert("RGB")


def _try_get_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    """Try to load a nice font, fall back to default."""
    candidates = [
        "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/calibri.ttf",
        "C:/Windows/Fonts/arial.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except (OSError, IOError):
            continue
    return ImageFont.load_default()


def _try_get_bold_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    """Try to load a bold font, fall back to regular."""
    candidates = [
        "C:/Windows/Fonts/segoeuib.ttf",
        "C:/Windows/Fonts/calibrib.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/segoeui.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except (OSError, IOError):
            continue
    return ImageFont.load_default()


# ── Sidebar image (164 × 314) ────────────────────────────────────────────────


def generate_sidebar() -> Image.Image:
    w, h = SIDEBAR_SIZE
    img = Image.new("RGB", (w, h), NAVY_DARK)
    draw = ImageDraw.Draw(img)

    # Background: vertical gradient dark → mid → slightly lighter at bottom
    _draw_vertical_gradient(draw, w, NAVY_DARK, NAVY_MID, 0, h * 2 // 3)
    _draw_vertical_gradient(draw, w, NAVY_MID, NAVY_LIGHT, h * 2 // 3, h)

    # Subtle gold radial glow behind the icon area
    img = _draw_glow(img, w // 2, 100, 80, GOLD, intensity=0.07)
    draw = ImageDraw.Draw(img)

    # ── Composite the actual icon ─────────────────────────────────────────
    icon_size = 90
    icon = _prepare_icon(icon_size)
    icon_cx = w // 2
    icon_cy = 95
    img = _paste_icon_centered(img, icon, icon_cx, icon_cy)
    draw = ImageDraw.Draw(img)

    # ── Gold accent line below icon ───────────────────────────────────────
    _draw_gold_accent_line(draw, y=155, width=w, thickness=2)

    # ── "AURELIUS" title text ─────────────────────────────────────────────
    title_font = _try_get_bold_font(16)
    title_text = "AURELIUS"
    bbox = draw.textbbox((0, 0), title_text, font=title_font)
    tw = bbox[2] - bbox[0]
    tx = (w - tw) // 2
    draw.text((tx, 168), title_text, fill=GOLD_LIGHT, font=title_font)

    # ── Tagline ───────────────────────────────────────────────────────────
    tag_font = _try_get_font(9)
    tagline = "Your AI Desktop Companion"
    bbox = draw.textbbox((0, 0), tagline, font=tag_font)
    tw = bbox[2] - bbox[0]
    tx = (w - tw) // 2
    draw.text((tx, 190), tagline, fill=WHITE_DIM, font=tag_font)

    # ── Decorative dots at bottom ─────────────────────────────────────────
    dot_y = h - 50
    dot_color = _lerp_color(NAVY_LIGHT, GOLD_DIM, 0.2)
    for i in range(5):
        x = w // 2 - 24 + i * 12
        draw.ellipse([x - 1, dot_y - 1, x + 1, dot_y + 1], fill=dot_color)

    # ── Bottom gold accent line ───────────────────────────────────────────
    _draw_gold_accent_line(draw, y=h - 35, width=w, thickness=1)

    # ── Version text at the very bottom ───────────────────────────────────
    ver_font = _try_get_font(8)
    ver_text = "v0.1.0"
    bbox = draw.textbbox((0, 0), ver_text, font=ver_font)
    tw = bbox[2] - bbox[0]
    tx = (w - tw) // 2
    draw.text(
        (tx, h - 22),
        ver_text,
        fill=_lerp_color(NAVY_LIGHT, WHITE_DIM, 0.4),
        font=ver_font,
    )

    return img


# ── Header image (150 × 57) ──────────────────────────────────────────────────


def generate_header() -> Image.Image:
    w, h = HEADER_SIZE
    img = Image.new("RGB", (w, h), NAVY_DARK)
    draw = ImageDraw.Draw(img)

    # Background: horizontal gradient for variety
    _draw_horizontal_gradient(draw, h, NAVY_DARK, NAVY_MID, 0, w)

    # Subtle glow behind icon
    img = _draw_glow(img, 26, h // 2, 22, GOLD, intensity=0.05)
    draw = ImageDraw.Draw(img)

    # ── Composite the actual icon (small) ─────────────────────────────────
    icon_size = 34
    icon = _prepare_icon(icon_size)
    img = _paste_icon_centered(img, icon, 26, h // 2)
    draw = ImageDraw.Draw(img)

    # ── "Aurelius" text ───────────────────────────────────────────────────
    title_font = _try_get_bold_font(14)
    draw.text((50, h // 2 - 9), "Aurelius", fill=GOLD_LIGHT, font=title_font)

    # ── Thin gold accent line at the bottom edge ──────────────────────────
    for x in range(w):
        t = x / w
        alpha = math.sin(t * math.pi)  # fade at edges
        color = _lerp_color(NAVY_MID, GOLD, alpha * 0.55)
        draw.point((x, h - 1), fill=color)
        draw.point((x, h - 2), fill=_lerp_color(NAVY_MID, color, 0.5))

    return img


# ── Main ──────────────────────────────────────────────────────────────────────


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    sidebar_path = OUT_DIR / "sidebar.bmp"
    header_path = OUT_DIR / "header.bmp"

    print(f"Using icon: {ICON_PATH}")
    if not ICON_PATH.exists():
        print(f"  ✗ Icon not found! Please ensure icon.png exists.")
        return

    print(f"Generating sidebar image ({SIDEBAR_SIZE[0]}x{SIDEBAR_SIZE[1]})...")
    sidebar = generate_sidebar()
    sidebar.save(sidebar_path, format="BMP")
    print(f"  -> {sidebar_path}")

    print(f"Generating header image ({HEADER_SIZE[0]}x{HEADER_SIZE[1]})...")
    header = generate_header()
    header.save(header_path, format="BMP")
    print(f"  -> {header_path}")

    # Save PNG previews for easy inspection
    sidebar.save(sidebar_path.with_suffix(".png"), format="PNG")
    header.save(header_path.with_suffix(".png"), format="PNG")
    print(f"  -> PNG previews saved alongside BMPs")

    print("\nDone!")


if __name__ == "__main__":
    main()
