#!/usr/bin/env python3
"""Combined faction-card print sheet.

Lays out the seven faction-card PDFs two-per-page on US-letter portrait
with a gap between them. Pairings:
    Page 1: Corsairs + Queens Fleet
    Page 2: The Islanders + Sun Fleet
    Page 3: The Industry + Treasure Fleet
    Page 4: Shadow Fleet (vertically centered, alone)

Why pypdf instead of including PNGs in a Typst file: the PNG approach
re-rasterized each card at 300dpi and embedded ~1.5-3MB per card, leaving
a 24MB pre-compression print sheet that only shrinks back to 2.6MB after
Ghostscript distillation. Composing from the source PDFs preserves all
vector content and shared images, producing an order-of-magnitude smaller
sheet.

Usage:
    impose-card-sheets.py <pdf_dir> <output.pdf>
"""
from __future__ import annotations

import sys
from pathlib import Path
from pypdf import PdfReader, PdfWriter, Transformation
from pypdf.generic import RectangleObject

# US-letter portrait, in PDF points (72 / inch).
PAGE_W = 8.5 * 72
PAGE_H = 11.0 * 72

# Card with bleed: 6.25 x 4.25 in.
CARD_W = 6.25 * 72
CARD_H = 4.25 * 72

# Gap between paired cards.
GAP = 0.6 * 72

# Pairings (top, bottom). None for the bottom slot means "centered solo".
PAIRS = [
    ("corsairs", "queens-fleet"),
    ("the-islanders", "sun-fleet"),
    ("the-industry", "treasure-fleet"),
    ("shadow-fleet", None),
]


def card_page(pdf_dir: Path, faction: str):
    return PdfReader(str(pdf_dir / f"faction-card-{faction}.pdf")).pages[0]


def main(pdf_dir: str, out_path: str) -> None:
    pdf_dir_p = Path(pdf_dir)
    writer = PdfWriter()

    side_margin = (PAGE_W - CARD_W) / 2

    for top, bottom in PAIRS:
        sheet = writer.add_blank_page(width=PAGE_W, height=PAGE_H)

        if bottom is None:
            # Solo card, vertically centered.
            y = (PAGE_H - CARD_H) / 2
            sheet.merge_transformed_page(
                card_page(pdf_dir_p, top),
                Transformation().translate(side_margin, y),
            )
        else:
            v_margin = (PAGE_H - 2 * CARD_H - GAP) / 2
            y_top = PAGE_H - v_margin - CARD_H
            y_bottom = v_margin
            sheet.merge_transformed_page(
                card_page(pdf_dir_p, top),
                Transformation().translate(side_margin, y_top),
            )
            sheet.merge_transformed_page(
                card_page(pdf_dir_p, bottom),
                Transformation().translate(side_margin, y_bottom),
            )

        sheet.mediabox = RectangleObject((0, 0, PAGE_W, PAGE_H))

    writer.compress_identical_objects()
    with open(out_path, "wb") as f:
        writer.write(f)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(2)
    main(sys.argv[1], sys.argv[2])
