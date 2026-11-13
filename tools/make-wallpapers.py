#!/usr/bin/env python3
"""Génère les fonds d'écran spatiaux de Flix Home (images fixes 1920×1080).

Les images sont calculées une fois ici : sur la TV, un fond est une simple image,
sans aucun coût de calcul pendant l'utilisation. Le sujet est placé à droite pour
laisser la zone de texte (à gauche) lisible.

    python3 tools/make-wallpapers.py      # écrit assets/wall-*.jpg
"""
import math
import os
import numpy as np
from PIL import Image, ImageFilter

W, H = 1920, 1080
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets')
rng = np.random.default_rng(7)
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)


def noise(scale, seed):
    """Bruit lisse : grille aléatoire agrandie en bicubique."""
    r = np.random.default_rng(seed)
    gw, gh = max(2, int(W / scale)), max(2, int(H / scale))
    g = (r.random((gh, gw)) * 255).astype(np.uint8)
    im = Image.fromarray(g, 'L').resize((W, H), Image.BICUBIC)
    return np.asarray(im, np.float32) / 255.0


def fbm(base, octaves, seed):
    out, amp, tot = np.zeros((H, W), np.float32), 1.0, 0.0
    for i in range(octaves):
        out += amp * noise(base / (2 ** i), seed + i)
        tot += amp
        amp *= 0.5
    return out / tot


def stars(img, count, seed, max_size=1.6, tint=True):
    r = np.random.default_rng(seed)
    layer = np.zeros((H, W, 3), np.float32)
    xs, ys = r.integers(0, W, count), r.integers(0, H, count)
    mag = r.random(count) ** 6  # beaucoup d'étoiles faibles, peu de brillantes
    for x, y, m in zip(xs, ys, mag):
        c = np.array([1.0, 1.0, 1.0])
        if tint:
            t = r.random()
            c = np.array([0.75, 0.85, 1.0]) if t < 0.3 else np.array([1.0, 0.9, 0.75]) if t < 0.45 else c
        layer[y, x] += c * (0.25 + 1.6 * m)
    # Les plus brillantes reçoivent un léger halo.
    halo = Image.fromarray(np.clip(layer * 255, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(max_size))
    return img + layer * 0.9 + np.asarray(halo, np.float32) / 255.0 * 1.8


def bloom(img, radius, strength):
    im = Image.fromarray(np.clip(img * 255, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius))
    return img + np.asarray(im, np.float32) / 255.0 * strength


def save(img, name):
    img = np.clip(img, 0, 1) ** (1 / 1.05)
    Image.fromarray((img * 255).astype(np.uint8)).save(os.path.join(OUT, name), 'JPEG', quality=86, optimize=True, progressive=True)
    print('écrit', name, os.path.getsize(os.path.join(OUT, name)) // 1024, 'Ko')


def black_hole():
    cx, cy, rs = 1440.0, 300.0, 104.0
    img = np.zeros((H, W, 3), np.float32)
    haze = fbm(700, 3, 11) ** 4
    img += haze[..., None] * np.array([0.02, 0.03, 0.07])
    img = stars(img, 2600, 3)
    dx, dy = xx - cx, yy - cy
    d = np.sqrt(dx * dx + dy * dy)
    theta = np.arctan2(dy, dx)
    turb = 0.8 + 0.4 * fbm(70, 3, 21)
    # Disque d'accrétion, vu un peu au-dessus de son plan.
    tilt = 0.18
    v = dy / tilt
    r = np.sqrt(dx * dx + v * v)
    inner, outer = 1.06 * rs, 4.4 * rs
    e = np.exp(-np.maximum(r - inner, 0) / (1.05 * rs)) * np.clip((r - inner) / (0.1 * rs), 0, 1) * np.clip((outer - r) / (1.4 * rs), 0, 1)
    beam = 1 + 0.4 * (-dx / np.maximum(r, 1))  # le côté qui vient vers nous est plus brillant
    e = e * turb * beam
    # Côté lointain du disque caché derrière l'horizon ; côté proche passe devant.
    e = np.where((d < rs) & (dy < 0), 0, e)
    e = np.where((d < rs * 1.05) & (dy > 0), e * 1.9, e)  # la bande qui passe devant l'ombre ressort
    # Image déviée du côté lointain : arc épais qui passe par-dessus l'ombre (et un fin arc dessous).
    top = np.clip(-np.sin(theta), 0, 1)
    bottom = np.clip(np.sin(theta), 0, 1)
    width = 0.1 * rs + 0.42 * rs * top ** 1.3
    lens = np.exp(-np.maximum(d - 1.04 * rs, 0) / width) * (d > 1.0 * rs)
    lens *= (0.18 + 0.82 * top ** 1.2 + 0.35 * bottom ** 2)
    lens *= 0.9 + 0.2 * fbm(90, 2, 31)
    photon = np.exp(-((d - 1.025 * rs) / (0.02 * rs)) ** 2)
    lum = e * 1.5 + lens * 1.15 + photon * 0.7
    hot = np.clip(lum, 0, 1.6)
    color = np.stack([0.5 + hot * 0.75, 0.24 + hot * 0.62, 0.07 + hot * 0.48], -1)
    img += lum[..., None] * color
    img = bloom(img, 14, 0.4)
    img = bloom(img, 55, 0.22)
    # Ombre : noir absolu, sauf là où le disque proche passe devant.
    inside = d < rs
    edge = np.clip((d - rs * 0.965) / (0.035 * rs), 0, 1) ** 2
    keep = np.where(dy > 0, np.clip(e / 0.35, 0, 1) ** 1.5, 0)  # fondu doux, sans coupure nette
    img = np.where(inside[..., None], img * (keep + (1 - keep) * edge)[..., None], img)
    save(img, 'wall-blackhole.jpg')


def nebula():
    img = np.zeros((H, W, 3), np.float32)
    a = fbm(520, 6, 41)
    b = fbm(380, 6, 51)
    mask = np.clip(1.15 - np.hypot((xx - 1420) / 900, (yy - 340) / 620), 0, 1) ** 1.6
    clouds = np.clip(a - 0.42, 0, 1) * 2.4 * mask
    wisps = np.clip(b - 0.5, 0, 1) * 3.0 * mask
    img += clouds[..., None] * np.array([0.55, 0.12, 0.55])
    img += wisps[..., None] * np.array([0.05, 0.42, 0.55])
    dust = np.clip(fbm(160, 4, 61) - 0.55, 0, 1) * 2
    img *= (1 - 0.6 * dust)[..., None]
    img = stars(img, 3200, 5)
    img = bloom(img, 30, 0.35)
    save(img, 'wall-nebula.jpg')


def galaxy():
    img = np.zeros((H, W, 3), np.float32)
    cx, cy = 1400.0, 330.0
    ang = math.radians(-24)
    dx, dy = xx - cx, yy - cy
    u = dx * math.cos(ang) - dy * math.sin(ang)
    v = (dx * math.sin(ang) + dy * math.cos(ang)) / 0.42
    r = np.sqrt(u * u + v * v) + 1
    th = np.arctan2(v, u)
    arms = (0.5 + 0.5 * np.cos(2 * (th - 2.6 * np.log(r / 40)))) ** 3
    n = 0.6 + 0.6 * fbm(90, 4, 71)
    disk = np.exp(-r / 230) * (0.25 + arms * n)
    core = np.exp(-(r / 70) ** 1.5)
    img += disk[..., None] * np.array([0.42, 0.55, 0.95]) * 1.4
    img += core[..., None] * np.array([1.0, 0.86, 0.62]) * 1.3
    lanes = np.clip(fbm(50, 3, 81) - 0.55, 0, 1) * 2.2 * np.exp(-r / 300)
    img *= (1 - 0.7 * lanes)[..., None]
    img = stars(img, 3000, 9)
    img = bloom(img, 24, 0.5)
    save(img, 'wall-galaxy.jpg')


def deep_space():
    img = np.zeros((H, W, 3), np.float32)
    glow = np.exp(-np.hypot((xx - 1500) / 1100, (yy - 200) / 700) ** 2)
    img += glow[..., None] * np.array([0.02, 0.03, 0.07])
    img = stars(img, 1400, 13, tint=False)
    save(img, 'wall-deepspace.jpg')


if __name__ == '__main__':
    black_hole()
    nebula()
    galaxy()
    deep_space()
