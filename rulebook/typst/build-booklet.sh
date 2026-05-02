#!/usr/bin/env bash
# Build the saddle-stitch booklet imposition of the rulebook.
#
# Imposes pages directly from rulebook.pdf via impose-booklet.py (pypdf).
# The earlier bookletic+SVG approach worked, but composing each page from
# its SVG export caused Typst to re-emit every parchment background, gold
# rule, and ornament path *per page*, blowing the imposed PDF up by ~15x.
# Working from the source PDF lets pypdf reference each page once, so the
# imposed booklet stays close to source-PDF size.
#
# Print double-sided (flip on short edge), stack, fold, staple → standard
# spine-on-left half-letter booklet.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PDF_DIR="$ROOT_DIR/rulebook/pdf"

mkdir -p "$PDF_DIR"

if [[ ! -f "$PDF_DIR/rulebook.pdf" ]]; then
  echo "rulebook.pdf not found; running build-rulebook.sh first..."
  "$SCRIPT_DIR/build-rulebook.sh"
fi

PAGES=$(pdfinfo "$PDF_DIR/rulebook.pdf" 2>/dev/null | awk '/^Pages:/ {print $2}')
if [[ -z "${PAGES:-}" ]]; then
  echo "Could not determine rulebook page count; aborting." >&2
  exit 1
fi

echo "Imposing $PAGES-page rulebook as booklet signatures..."
python3 "$SCRIPT_DIR/impose-booklet.py" \
  "$PDF_DIR/rulebook.pdf" \
  "$PDF_DIR/rulebook-booklet.pdf"

echo "Building print-optimized booklet PDF (preserved as rulebook-booklet-print.pdf)..."
"$SCRIPT_DIR/compress-pdf.sh" --profile prepress \
  "$PDF_DIR/rulebook-booklet.pdf" "$PDF_DIR/rulebook-booklet-print.pdf"

echo "Compressing booklet PDF for web (Cloudflare Pages caps assets at 25 MiB)..."
"$SCRIPT_DIR/compress-pdf.sh" "$PDF_DIR/rulebook-booklet.pdf"

SHEETS=$(pdfinfo "$PDF_DIR/rulebook-booklet.pdf" 2>/dev/null | awk '/^Pages:/ {print $2}')
echo "Done. $SHEETS imposed sheet-sides ($((SHEETS / 2)) physical sheets, double-sided)."
echo "PDF: $PDF_DIR/rulebook-booklet.pdf"
