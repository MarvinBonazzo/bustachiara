#!/usr/bin/env python3
"""Rigenera le icone PWA a partire dal foglio illuminato approvato."""
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parent
OUT = ROOT / "pwa" / "icons"
SOURCE = OUT / "app-icon-source.png"
BACKGROUND = (5, 91, 65)  # verde foresta coerente con il tema PWA


def render(size: int, scale: float = 1.0) -> Image.Image:
    """Crea un PNG opaco; `scale` lascia più safe area per l'icona maskable."""
    source = Image.open(SOURCE).convert("RGB")
    canvas = Image.new("RGB", (size, size), BACKGROUND)
    inner = round(size * scale)
    art = source.resize((inner, inner), Image.Resampling.LANCZOS)

    # Scarta il bordo esterno prodotto dal modello e raccorda l'illustrazione
    # a un fondo pieno: niente spigoli neri nelle forme circolari di Android.
    crop = round(inner * 0.018)
    art = art.crop((crop, crop, inner - crop, inner - crop))
    art = art.resize((inner, inner), Image.Resampling.LANCZOS)
    mask = Image.new("L", (inner, inner), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, inner - 1, inner - 1), radius=round(inner * 0.22), fill=255
    )
    offset = ((size - inner) // 2, (size - inner) // 2)
    canvas.paste(art, offset, mask)
    return canvas


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"Sorgente mancante: {SOURCE}")
    targets = [
        ("icon-192.png", 192, 1.0),
        ("icon-512.png", 512, 1.0),
        ("icon-maskable-512.png", 512, 0.82),
        ("apple-touch-icon.png", 180, 1.0),
    ]
    for name, size, scale in targets:
        path = OUT / name
        render(size, scale).save(path, optimize=True)
        print("creata", path.relative_to(ROOT))


if __name__ == "__main__":
    main()
