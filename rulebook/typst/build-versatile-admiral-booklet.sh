#!/usr/bin/env bash
# Saddle-stitch booklet imposition of The Versatile Admiral.
# Mirrors build-booklet.sh.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PDF_DIR="$ROOT_DIR/rulebook/pdf"

mkdir -p "$PDF_DIR"

if [[ ! -f "$PDF_DIR/versatile-admiral.pdf" ]]; then
  echo "versatile-admiral.pdf not found; running build-versatile-admiral.sh first..."
  "$SCRIPT_DIR/build-versatile-admiral.sh"
fi

PAGES=$(pdfinfo "$PDF_DIR/versatile-admiral.pdf" 2>/dev/null | awk '/^Pages:/ {print $2}')
if [[ -z "${PAGES:-}" ]]; then
  echo "Could not determine page count; aborting." >&2
  exit 1
fi

echo "Imposing $PAGES-page Versatile Admiral as booklet signatures..."
python3 "$SCRIPT_DIR/impose-booklet.py" \
  "$PDF_DIR/versatile-admiral.pdf" \
  "$PDF_DIR/versatile-admiral-booklet.pdf"

echo "Compressing booklet PDF for web..."
"$SCRIPT_DIR/compress-pdf.sh" "$PDF_DIR/versatile-admiral-booklet.pdf"

SHEETS=$(pdfinfo "$PDF_DIR/versatile-admiral-booklet.pdf" 2>/dev/null | awk '/^Pages:/ {print $2}')
echo "Done. $SHEETS imposed sheet-sides ($((SHEETS / 2)) physical sheets, double-sided)."
echo "PDF: $PDF_DIR/versatile-admiral-booklet.pdf"
