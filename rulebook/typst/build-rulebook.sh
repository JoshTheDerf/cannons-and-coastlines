#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PDF_DIR="$ROOT_DIR/rulebook/pdf"
PNG_DIR="$ROOT_DIR/rulebook/png"
SVG_DIR="$ROOT_DIR/rulebook/svg"
TYPST="${TYPST:-typst}"

mkdir -p "$PDF_DIR" "$PNG_DIR" "$SVG_DIR"

# Clear stale per-page artifacts so a shrinking page count doesn't leave
# orphans behind (bookletic would silently pick them up).
rm -f "$PNG_DIR"/rulebook-*.png "$SVG_DIR"/rulebook-*.svg

echo "Building rulebook PDF..."
"$TYPST" compile \
  --root "$ROOT_DIR" \
  --font-path "$SCRIPT_DIR/fonts" \
  "$SCRIPT_DIR/rulebook.typ" \
  "$PDF_DIR/rulebook.pdf"

echo "Compressing rulebook PDF..."
"$SCRIPT_DIR/compress-pdf.sh" "$PDF_DIR/rulebook.pdf"

echo "Building rulebook PNGs (300dpi, one per page)..."
"$TYPST" compile \
  --root "$ROOT_DIR" \
  --font-path "$SCRIPT_DIR/fonts" \
  --format png --ppi 300 \
  "$SCRIPT_DIR/rulebook.typ" \
  "$PNG_DIR/rulebook-{p}.png"

echo "Building rulebook SVGs (one per page, for booklet imposition)..."
"$TYPST" compile \
  --root "$ROOT_DIR" \
  --font-path "$SCRIPT_DIR/fonts" \
  --format svg \
  "$SCRIPT_DIR/rulebook.typ" \
  "$SVG_DIR/rulebook-{p}.svg"

PAGES=$(pdfinfo "$PDF_DIR/rulebook.pdf" 2>/dev/null | awk '/^Pages:/ {print $2}')
echo "Done. ${PAGES:-?} pages. PDF in $PDF_DIR, PNGs in $PNG_DIR, SVGs in $SVG_DIR."
