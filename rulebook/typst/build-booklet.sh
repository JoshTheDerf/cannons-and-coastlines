#!/usr/bin/env bash
# Build the saddle-stitch booklet imposition of the rulebook.
#
# Depends on per-page SVGs from build-rulebook.sh — runs it first if SVGs are
# missing. Output is a PDF where each page is a landscape-letter sheet with
# two half-letter rulebook pages side by side in signature order. Print
# double-sided (flip on short edge), stack, fold, staple.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PDF_DIR="$ROOT_DIR/rulebook/pdf"
SVG_DIR="$ROOT_DIR/rulebook/svg"
TYPST="${TYPST:-typst}"

mkdir -p "$PDF_DIR"

if ! compgen -G "$SVG_DIR/rulebook-*.svg" > /dev/null; then
  echo "No rulebook SVGs found; running build-rulebook.sh first..."
  "$SCRIPT_DIR/build-rulebook.sh"
fi

PAGES=$(pdfinfo "$PDF_DIR/rulebook.pdf" 2>/dev/null | awk '/^Pages:/ {print $2}')
if [[ -z "${PAGES:-}" ]]; then
  echo "Could not determine rulebook page count; aborting." >&2
  exit 1
fi

echo "Imposing $PAGES-page rulebook as booklet signatures..."
"$TYPST" compile \
  --root "$ROOT_DIR" \
  --font-path "$SCRIPT_DIR/fonts" \
  --input "pages=$PAGES" \
  "$SCRIPT_DIR/rulebook-booklet.typ" \
  "$PDF_DIR/rulebook-booklet.pdf"

echo "Compressing booklet PDF (Cloudflare Pages caps assets at 25 MiB)..."
"$SCRIPT_DIR/compress-pdf.sh" "$PDF_DIR/rulebook-booklet.pdf"

SHEETS=$(pdfinfo "$PDF_DIR/rulebook-booklet.pdf" 2>/dev/null | awk '/^Pages:/ {print $2}')
echo "Done. $SHEETS imposed sheet-sides ($((SHEETS / 2)) physical sheets, double-sided)."
echo "PDF: $PDF_DIR/rulebook-booklet.pdf"
