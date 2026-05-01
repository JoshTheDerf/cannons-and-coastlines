#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUT_PDF="$ROOT_DIR/rulebook/pdf"
OUT_PNG="$ROOT_DIR/rulebook/png"
TYPST="${TYPST:-typst}"

mkdir -p "$OUT_PDF" "$OUT_PNG"

FACTIONS=(queens-fleet corsairs treasure-fleet shadow-fleet sun-fleet the-industry the-islanders)

for f in "${FACTIONS[@]}"; do
  echo "Building $f..."
  "$TYPST" compile \
    --root "$ROOT_DIR" \
    --font-path "$SCRIPT_DIR/fonts" \
    --input "faction=$f" \
    "$SCRIPT_DIR/factions.typ" \
    "$OUT_PDF/faction-card-$f.pdf"
  "$SCRIPT_DIR/compress-pdf.sh" "$OUT_PDF/faction-card-$f.pdf"
  "$TYPST" compile \
    --root "$ROOT_DIR" \
    --font-path "$SCRIPT_DIR/fonts" \
    --input "faction=$f" \
    --format png --ppi 300 \
    "$SCRIPT_DIR/factions.typ" \
    "$OUT_PNG/faction-card-$f.png"
done

echo "Done. PDFs in $OUT_PDF, PNGs in $OUT_PNG."
