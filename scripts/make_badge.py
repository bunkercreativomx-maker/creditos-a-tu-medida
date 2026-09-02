#!/usr/bin/env python3
"""Genera el badge monocromo (silueta blanca sobre transparente) para las
notificaciones del CRM. Android renderiza el icono pequeño de la barra de
estado usando SOLO el canal alfa; un icono a color opaco sale como cuadro
blanco. Este badge es la silueta blanca del monograma CM sobre transparente.
"""
from PIL import Image

SRC = "public/icon-192.png"
OUT = "public/badge-192.png"

img = Image.open(SRC).convert("RGBA")
w, h = img.size
px = img.load()

# Color de fondo (navy oscuro) del icono original — se vuelve transparente.
# Todo lo demás (C y M blancas + acento dorado) se vuelve blanco puro.
bg = (1, 31, 75)  # navy real del icono
tol = 40

for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        if a == 0:
            continue
        if abs(r - bg[0]) <= tol and abs(g - bg[1]) <= tol and abs(b - bg[2]) <= tol:
            px[x, y] = (0, 0, 0, 0)  # transparente
        else:
            px[x, y] = (255, 255, 255, 255)  # blanco puro

img.save(OUT)
print("OK", OUT, img.size)
