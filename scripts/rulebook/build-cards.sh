#!/usr/bin/env bash
# Build the seven faction cards: web PDF, print PDF and 300dpi PNG each.
#
# Layout lives in rulebook/typst/card.typ, content in factions.typ (which
# dispatches on --input faction=<id>). Adding a faction means adding it to
# the data dict there *and* to FACTIONS below.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)/common.sh"

mkdir -p "$PDF_DIR" "$PNG_DIR"

FACTIONS=(queens-fleet corsairs treasure-fleet shadow-fleet sun-fleet the-industry the-islanders)

for f in "${FACTIONS[@]}"; do
  echo "Building $f..."
  typst_compile factions.typ "$PDF_DIR/faction-card-$f.pdf" --input "faction=$f"
  compress_pdf --profile prepress \
    "$PDF_DIR/faction-card-$f.pdf" "$PDF_DIR/faction-card-$f-print.pdf"
  compress_pdf "$PDF_DIR/faction-card-$f.pdf"
  typst_compile factions.typ "$PNG_DIR/faction-card-$f.png" \
    --input "faction=$f" --format png --ppi 300
done

echo "Done. PDFs in $PDF_DIR, PNGs in $PNG_DIR."
