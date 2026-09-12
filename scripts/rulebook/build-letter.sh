#!/usr/bin/env bash
# Build the welcome letter from Goldenbeard that goes in the box
# (rulebook/typst/letter.typ → rulebook/pdf/welcome-letter.pdf).
#
# Single-page US Letter; printed for orders via _internal/orders/justfile.
# The build script this source referenced had gone missing — the PDF was
# being rebuilt by hand — so this restores it as a normal jake step.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)/common.sh"

mkdir -p "$PDF_DIR"

echo "Building welcome letter PDF..."
typst_compile letter.typ "$PDF_DIR/welcome-letter.pdf"

echo "Compressing welcome letter for print..."
compress_pdf --profile prepress "$PDF_DIR/welcome-letter.pdf"

echo "Done. PDF: $PDF_DIR/welcome-letter.pdf ($(pdf_pages "$PDF_DIR/welcome-letter.pdf") page)"
