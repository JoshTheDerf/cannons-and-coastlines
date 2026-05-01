#!/usr/bin/env bash
# Re-distill a PDF through Ghostscript /printer to shrink embedded raster
# assets. Typst emits PDFs with full-resolution PNGs/JPEGs inline; that's
# fine for print but blows past Cloudflare Pages' 25 MiB per-asset cap on
# the imposed booklet. /printer keeps 300dpi quality while dropping the
# booklet from ~27 MiB to ~11 MiB.
#
# Usage: compress-pdf.sh <path-to-pdf>
# Replaces the input file in place. No-op if ghostscript is missing or if
# compression would make the file larger.
set -euo pipefail

PDF="$1"

if ! command -v gs >/dev/null 2>&1; then
  echo "  (gs not found; skipping compression of $(basename "$PDF"))" >&2
  exit 0
fi

TMP="${PDF%.pdf}.compressed.pdf"
gs -sDEVICE=pdfwrite -dPDFSETTINGS=/printer \
   -dNOPAUSE -dQUIET -dBATCH \
   -sOutputFile="$TMP" "$PDF"

before=$(stat -c%s "$PDF")
after=$(stat -c%s "$TMP")
if (( after < before )); then
  mv "$TMP" "$PDF"
  printf "  compressed %s: %s → %s\n" \
    "$(basename "$PDF")" \
    "$(numfmt --to=iec --suffix=B "$before")" \
    "$(numfmt --to=iec --suffix=B "$after")"
else
  rm -f "$TMP"
  printf "  %s already optimal (%s)\n" \
    "$(basename "$PDF")" \
    "$(numfmt --to=iec --suffix=B "$before")"
fi
