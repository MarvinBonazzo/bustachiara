#!/usr/bin/env python3
"""Genera le icone PWA di BustaChiara: quadrato verde con 'scontrino' bianco."""
import zlib, struct, os

VERDE = (29, 122, 74, 255)      # #1d7a4a
VERDE_SCURO = (22, 96, 57, 255)
BIANCO = (255, 255, 255, 255)

def png_bytes(w, h, pixel):
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        for x in range(w):
            raw.extend(pixel(x, y))
    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    return (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(bytes(raw), 9))
            + chunk(b'IEND', b''))

def dentro_rett_arrotondato(x, y, x0, y0, x1, y1, r):
    if x < x0 or x > x1 or y < y0 or y > y1:
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r

def icona(size, margine_ricevuta=0.30):
    """Sfondo verde pieno; ricevuta bianca centrata con righe verdi."""
    s = size
    rx0, rx1 = s * margine_ricevuta, s * (1 - margine_ricevuta)
    ry0, ry1 = s * 0.20, s * 0.80
    rw = rx1 - rx0
    linee = []   # (y0, y1, x0, x1) delle righe verdi dentro la ricevuta
    n = 4
    for i in range(n):
        ly = ry0 + (ry1 - ry0) * (0.22 + i * 0.18)
        lh = max(2, s * 0.035)
        lx1 = rx1 - rw * (0.18 if i < n - 1 else 0.45)
        linee.append((ly, ly + lh, rx0 + rw * 0.18, lx1))
    def pixel(x, y):
        if dentro_rett_arrotondato(x, y, rx0, ry0, rx1, ry1, s * 0.035):
            for (ly0, ly1, lx0, lx1) in linee:
                if ly0 <= y <= ly1 and lx0 <= x <= lx1:
                    return VERDE
            return BIANCO
        return VERDE
    return png_bytes(s, s, pixel)

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pwa', 'icons')
os.makedirs(out, exist_ok=True)
for nome, size, margine in [
    ('icon-192.png', 192, 0.28),
    ('icon-512.png', 512, 0.28),
    ('icon-maskable-512.png', 512, 0.34),  # contenuto nel "safe zone" per le forme Android
    ('apple-touch-icon.png', 180, 0.28),
]:
    with open(os.path.join(out, nome), 'wb') as f:
        f.write(icona(size, margine))
    print('creata', nome)
