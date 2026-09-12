#!/usr/bin/env bash
# Build "The Versatile Admiral" addon rulebook. Mirrors build-rulebook.sh.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PDF_DIR="$ROOT_DIR/rulebook/pdf"
PNG_DIR="$ROOT_DIR/rulebook/png"
TYPST="${TYPST:-typst}"

mkdir -p "$PDF_DIR" "$PNG_DIR"

rm -f "$PNG_DIR"/versatile-admiral-*.png

echo "Building Versatile Admiral PDF..."
"$TYPST" compile \
  --root "$ROOT_DIR" \
  --font-path "$SCRIPT_DIR/fonts" \
  "$SCRIPT_DIR/versatile-admiral.typ" \
  "$PDF_DIR/versatile-admiral.pdf"

echo "Compressing Versatile Admiral PDF for web..."
"$SCRIPT_DIR/compress-pdf.sh" "$PDF_DIR/versatile-admiral.pdf"

echo "Building Versatile Admiral PNGs (300dpi, one per page)..."
"$TYPST" compile \
  --root "$ROOT_DIR" \
  --font-path "$SCRIPT_DIR/fonts" \
  --format png --ppi 300 \
  "$SCRIPT_DIR/versatile-admiral.typ" \
  "$PNG_DIR/versatile-admiral-{p}.png"

PAGES=$(pdfinfo "$PDF_DIR/versatile-admiral.pdf" 2>/dev/null | awk '/^Pages:/ {print $2}')
echo "Done. ${PAGES:-?} pages. PDF in $PDF_DIR, PNGs in $PNG_DIR."
