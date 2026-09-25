#!/usr/bin/env bash
# Build (and optionally render) the hero battle scene on this machine.
#
#   scripts/blender/hero/build.sh [sunny|storm|both] [extra hero_battle.py args]
#
# Examples:
#   scripts/blender/hero/build.sh both                          # rebuild both .blend files
#   scripts/blender/hero/build.sh sunny --pct 40 --samples 32 --still 66,125
#   scripts/blender/hero/build.sh storm --render                # full animation frames
#
# Writes scripts/blender/hero/hero-battle-<weather>.blend (tracked, editable)
# plus stills/frames under build/hero/. Needs Blender 5.2+ on PATH, or set
# BLENDER=/path/to/blender.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
BLENDER="${BLENDER:-$(command -v blender || echo /snap/bin/blender)}"
[[ -x "$BLENDER" ]] || { echo "Blender not found. Install Blender 5.2+ or set BLENDER=/path/to/blender" >&2; exit 1; }
"$BLENDER" --version | head -1

which="${1:-both}"; shift || true
case "$which" in both) weathers=(sunny storm) ;; sunny|storm) weathers=("$which") ;;
  *) echo "usage: $0 [sunny|storm|both] [args]" >&2; exit 2 ;; esac

mkdir -p "$REPO/build/hero"
cd "$REPO"
for w in "${weathers[@]}"; do
  echo "==> $w"
  "$BLENDER" -b --python scripts/blender/hero_battle.py -- \
      --weather "$w" --save "$HERE/hero-battle-$w.blend" "$@"
done
