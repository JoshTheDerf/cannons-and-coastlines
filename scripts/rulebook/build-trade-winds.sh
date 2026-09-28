#!/usr/bin/env bash
# Build the Trade Winds variant as a standalone one-page handout
# (rulebook/pdf/trade-winds.pdf + rulebook/png/trade-winds.png).
#
# The page is the rulebook's own Trade Winds page, not a second source: the
# <trade-winds-page> marker in rulebook.typ reports which page it landed on,
# and that single page is compiled out. Edit the rules there and both the
# rulebook and this handout follow.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)/common.sh"

mkdir -p "$PDF_DIR" "$PNG_DIR"

page=$("$TYPST" query --root "$REPO_ROOT" --font-path "$FONT_DIR" \
    "$TYPST_DIR/rulebook.typ" "<trade-winds-page>" --field value --one)
[[ "$page" =~ ^[0-9]+$ ]] || { echo "error: could not find the Trade Winds page (got '$page')" >&2; exit 1; }

echo "Building Trade Winds handout (rulebook page $page)..."
typst_compile rulebook.typ "$PDF_DIR/trade-winds.pdf" --pages "$page"
compress_pdf "$PDF_DIR/trade-winds.pdf"
typst_compile rulebook.typ "$PNG_DIR/trade-winds.png" --pages "$page" --format png --ppi 300

echo "Done. $(pdf_pages "$PDF_DIR/trade-winds.pdf") page. PDF: $PDF_DIR/trade-winds.pdf"
