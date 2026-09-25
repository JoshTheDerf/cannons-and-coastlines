#!/usr/bin/env bash
# Build the combined faction-card print sheet (two cards per US-letter page,
# Shadow Fleet alone). Imposes the source faction-card PDFs directly via
# impose-card-sheets.py; depends on rulebook/pdf/faction-card-*.pdf from
# build-cards.sh.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/../lib/common.sh"

mkdir -p "$PDF_DIR"

echo "Imposing faction-card print sheet..."
pypdf_python "$HERE/impose-card-sheets.py" \
  "$PDF_DIR" \
  "$PDF_DIR/faction-cards-print-sheet.pdf"

echo "Compressing print sheet for web..."
compress_pdf "$PDF_DIR/faction-cards-print-sheet.pdf"

echo "Done. PDF: $PDF_DIR/faction-cards-print-sheet.pdf"
