#!/usr/bin/env bash
# Build the standalone scoring card: web PDF, 300dpi PNG, and a two-up
# US-letter print sheet (scoring-card-print-sheet.pdf), plus the same sheet
# with blank write-in squares for playtesting (scoring-card-blank-*.pdf).
#
# Source is rulebook/typst/scoring-card.typ. It builds in neutral brown here;
# `--input faction=<id>` gives a faction-colored variant for when it becomes
# the back of the faction cards.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/../lib/common.sh"

mkdir -p "$PDF_DIR" "$PNG_DIR"

echo "Building scoring card..."
typst_compile scoring-card.typ "$PDF_DIR/scoring-card.pdf"
compress_pdf "$PDF_DIR/scoring-card.pdf"
typst_compile scoring-card.typ "$PNG_DIR/scoring-card.png" --format png --ppi 300

pages="$(pdf_pages "$PDF_DIR/scoring-card.pdf")"
if [[ -n "$pages" && "$pages" != 1 ]]; then
  echo "error: scoring-card.pdf has $pages pages; the card overflowed" >&2
  exit 1
fi

echo "Imposing two-up print sheet..."
pypdf_python "$HERE/impose-card-sheets.py" --twin \
  "$PDF_DIR/scoring-card.pdf" "$PDF_DIR/scoring-card-print-sheet.pdf"
compress_pdf "$PDF_DIR/scoring-card-print-sheet.pdf"

# Playtest variant: write-in squares in place of the point values.
echo "Building blank playtest sheet..."
typst_compile scoring-card.typ "$PDF_DIR/scoring-card-blank.pdf" --input blank=1
pypdf_python "$HERE/impose-card-sheets.py" --twin \
  "$PDF_DIR/scoring-card-blank.pdf" "$PDF_DIR/scoring-card-blank-print-sheet.pdf"
compress_pdf "$PDF_DIR/scoring-card-blank-print-sheet.pdf"

echo "Done. PDFs in $PDF_DIR: scoring-card{,-blank}{,-print-sheet}.pdf"
