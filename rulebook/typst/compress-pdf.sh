#!/usr/bin/env bash
# Re-distill a PDF through Ghostscript to shrink embedded raster assets.
# Typst emits PDFs with full-resolution PNGs/JPEGs inline, which produces
# large files. Ghostscript /printer or /prepress shrinks them substantially
# while keeping print-grade quality.
#
# Usage:
#   compress-pdf.sh <path-to-pdf>                 # /printer, in place
#   compress-pdf.sh <input.pdf> <output.pdf>      # /printer, write to output
#   compress-pdf.sh --profile <printer|prepress|ebook|screen> <input> [output]
#
# Profiles (Ghostscript -dPDFSETTINGS):
#   /printer  — 300 dpi, good print quality, smaller file (web-friendly).
#   /prepress — 300 dpi, color-preserving, preferred for print houses.
#   /ebook    — 150 dpi, screen reading.
#   /screen   — 72 dpi, smallest.
#
# No-op if ghostscript is missing or compression would make the file larger
# (when writing in place). When an explicit output path is given, the file
# is written even if larger than the input.
set -euo pipefail

PROFILE="/printer"
if [[ "${1:-}" == "--profile" ]]; then
  PROFILE="/$2"
  shift 2
fi

PDF="$1"
OUT="${2:-}"
IN_PLACE=0
if [[ -z "$OUT" ]]; then
  OUT="${PDF%.pdf}.compressed.pdf"
  IN_PLACE=1
fi

if ! command -v gs >/dev/null 2>&1; then
  echo "  (gs not found; skipping compression of $(basename "$PDF"))" >&2
  exit 0
fi

gs -sDEVICE=pdfwrite -dPDFSETTINGS="$PROFILE" \
   -dNOPAUSE -dQUIET -dBATCH \
   -sOutputFile="$OUT" "$PDF"

before=$(stat -c%s "$PDF")
after=$(stat -c%s "$OUT")

if (( IN_PLACE )); then
  if (( after < before )); then
    mv "$OUT" "$PDF"
    printf "  compressed %s (%s): %s → %s\n" \
      "$(basename "$PDF")" "$PROFILE" \
      "$(numfmt --to=iec --suffix=B "$before")" \
      "$(numfmt --to=iec --suffix=B "$after")"
  else
    rm -f "$OUT"
    printf "  %s already optimal (%s)\n" \
      "$(basename "$PDF")" \
      "$(numfmt --to=iec --suffix=B "$before")"
  fi
else
  printf "  wrote %s (%s): %s → %s\n" \
    "$(basename "$OUT")" "$PROFILE" \
    "$(numfmt --to=iec --suffix=B "$before")" \
    "$(numfmt --to=iec --suffix=B "$after")"
fi
