#!/usr/bin/env bash
# Build the combined faction-card print sheet (two cards per US-letter page,
# Shadow Fleet alone). Depends on rulebook/png/faction-card-*.png from
# build-cards.sh — run that first if any card has changed.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUT_PDF="$ROOT_DIR/rulebook/pdf"
TYPST="${TYPST:-typst}"

mkdir -p "$OUT_PDF"

echo "Building faction-card print sheet..."
"$TYPST" compile \
  --root "$ROOT_DIR" \
  --font-path "$SCRIPT_DIR/fonts" \
  "$SCRIPT_DIR/card-sheets.typ" \
  "$OUT_PDF/faction-cards-print-sheet.pdf"

"$SCRIPT_DIR/compress-pdf.sh" "$OUT_PDF/faction-cards-print-sheet.pdf"

echo "Done. PDF: $OUT_PDF/faction-cards-print-sheet.pdf"
