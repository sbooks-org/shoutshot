#!/usr/bin/env python3
# Copyright (C) 2026 Simplebooks Foundation
# Copyright (C) 2026 Josh Rodd
# SPDX-License-Identifier: MIT-0
"""Draws the Shoutshot icon (blue rounded square, white upload arrow) with no
dependencies and writes extension/icons/icon{16,32,48,128}.png."""
import struct, zlib, os

def png(path, w, h, rgba):
    raw = b''.join(b'\0' + bytes(rgba[y * w * 4:(y + 1) * w * 4]) for y in range(h))
    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
                + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

def inside_rrect(x, y, r):  # unit square with corner radius r
    cx = min(max(x, r), 1 - r); cy = min(max(y, r), 1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r and 0 <= x <= 1 and 0 <= y <= 1

def glyph(x, y):
    # arrow head (triangle) + shaft + tray
    if 0.22 <= y <= 0.48 and abs(x - 0.5) <= (y - 0.22) * 0.95: return True
    if 0.47 <= y <= 0.66 and abs(x - 0.5) <= 0.075: return True
    if 0.72 <= y <= 0.80 and 0.24 <= x <= 0.76: return True
    if 0.60 <= y <= 0.80 and (0.24 <= x <= 0.32 or 0.68 <= x <= 0.76): return True
    return False

def draw(size, ss=6):
    px = []
    for j in range(size):
        for i in range(size):
            acc = [0, 0, 0, 0]
            for sj in range(ss):
                for si in range(ss):
                    x = (i + (si + .5) / ss) / size; y = (j + (sj + .5) / ss) / size
                    if not inside_rrect(x, y, 0.22): continue
                    if glyph(x, y): c = (255, 255, 255)
                    else:  # diagonal blue gradient
                        t = (x + y) / 2
                        c = (int(59 + (29 - 59) * t), int(130 + (78 - 130) * t), int(246 + (216 - 246) * t))
                    acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]; acc[3] += 255
            n = ss * ss; a = acc[3] / n
            if a: px += [round(acc[0] / (acc[3] / 255)), round(acc[1] / (acc[3] / 255)), round(acc[2] / (acc[3] / 255)), round(a)]
            else: px += [0, 0, 0, 0]
    return px

out = os.path.join(os.path.dirname(__file__), '..', 'extension', 'icons')
for s in (16, 32, 48, 128):
    png(os.path.join(out, f'icon{s}.png'), s, s, draw(s))
    print('wrote', f'icon{s}.png')
