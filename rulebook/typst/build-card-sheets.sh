#!/usr/bin/env bash
# Build the combined faction-card print sheet (two cards per US-letter page,
# Shadow Fleet alone). Imposes the source faction-card PDFs directly via
# impose-card-sheets.py; depends on rulebook/pdf/faction-card-*.pdf from
# build-cards.sh.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUT_PDF="$ROOT_DIR/rulebook/pdf"

mkdir -p "$OUT_PDF"

echo "Imposing faction-card print sheet..."
python3 "$SCRIPT_DIR/impose-card-sheets.py" \
  "$OUT_PDF" \
  "$OUT_PDF/faction-cards-print-sheet.pdf"

echo "Building print-optimized print sheet (preserved as faction-cards-print-sheet-print.pdf)..."
"$SCRIPT_DIR/compress-pdf.sh" --profile prepress \
  "$OUT_PDF/faction-cards-print-sheet.pdf" \
  "$OUT_PDF/faction-cards-print-sheet-print.pdf"

echo "Compressing print sheet for web..."
"$SCRIPT_DIR/compress-pdf.sh" "$OUT_PDF/faction-cards-print-sheet.pdf"

echo "Done. PDF: $OUT_PDF/faction-cards-print-sheet.pdf"
