#!/usr/bin/env python3
"""Saddle-stitch booklet imposition.

Takes a portrait half-letter PDF (5.5 x 8.5) and produces a landscape
US-letter PDF where each sheet-side carries two source pages in
saddle-stitch signature order. Print double-sided (flip on short edge),
stack, fold, staple.

Why this exists instead of the bookletic+SVG approach: composing the
booklet from per-page SVGs causes Typst to re-emit the parchment
background, gold ornaments, and other vector art *per page*, blowing the
imposed PDF up by ~15x. Working from the source PDF lets pypdf reference
each page once and share embedded images across the imposed sheets.

Usage:
    impose-booklet.py <input.pdf> <output.pdf>
"""
from __future__ import annotations

import sys
from pypdf import PdfReader, PdfWriter, Transformation
from pypdf.generic import RectangleObject

# US-letter landscape, in PDF points (72 / inch).
SHEET_W = 11.0 * 72
SHEET_H = 8.5 * 72
HALF_W = SHEET_W / 2  # = 5.5 in, matches the source page width


def signature_order(page_count: int) -> list[int | None]:
    """Return the imposition order for a saddle-stitch booklet.

    Pads to the next multiple of 4 with `None` (blank pages). The result
    lists pages in sheet-side order: each pair of entries is one
    landscape sheet-side (left page, right page).
    """
    padded = page_count + (-page_count % 4)
    indices: list[int | None] = list(range(1, page_count + 1)) + [None] * (padded - page_count)
    order: list[int | None] = []
    sheets = padded // 4
    for s in range(sheets):
        # Front of sheet s: [last, first] from the remaining stack.
        front_left = indices[padded - 1 - 2 * s]
        front_right = indices[2 * s]
        # Back of sheet s: [second, second-last].
        back_left = indices[2 * s + 1]
        back_right = indices[padded - 2 - 2 * s]
        order.extend([front_left, front_right, back_left, back_right])
    return order


def main(in_path: str, out_path: str) -> None:
    reader = PdfReader(in_path)
    writer = PdfWriter()

    src_pages = reader.pages
    page_count = len(src_pages)
    order = signature_order(page_count)

    for i in range(0, len(order), 2):
        left_idx, right_idx = order[i], order[i + 1]
        sheet = writer.add_blank_page(width=SHEET_W, height=SHEET_H)
        if left_idx is not None:
            sheet.merge_transformed_page(
                src_pages[left_idx - 1],
                Transformation().translate(0, 0),
            )
        if right_idx is not None:
            sheet.merge_transformed_page(
                src_pages[right_idx - 1],
                Transformation().translate(HALF_W, 0),
            )
        sheet.mediabox = RectangleObject((0, 0, SHEET_W, SHEET_H))

    writer.compress_identical_objects()
    with open(out_path, "wb") as f:
        writer.write(f)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(2)
    main(sys.argv[1], sys.argv[2])
