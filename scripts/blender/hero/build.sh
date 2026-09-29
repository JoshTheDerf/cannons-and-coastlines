#!/usr/bin/env bash
# Build (and optionally render) the hero battle scene on this machine.
#
#   scripts/blender/hero/build.sh [WEATHER[,WEATHER..]|both|all] [extra hero_battle.py args]
#
# WEATHER is sunny, sunrise, sunset, overcast, fog, storm or night
# (scripts/blender/seascape/weather.py). "both" is sunny,storm (the two
# tracked .blend files); "all" is every look.
#
# Examples:
#   scripts/blender/hero/build.sh both                          # rebuild both .blend files
#   scripts/blender/hero/build.sh sunny --pct 40 --samples 32 --still 66,125
#   scripts/blender/hero/build.sh storm --render                # full animation frames
#
# Writes scripts/blender/hero/hero-battle-<weather>.blend for sunny and storm
# (tracked, editable) and build/hero/hero-battle-<weather>.blend for the other
# looks, plus stills/frames under build/hero/. Needs Blender 5.2+ on PATH, or set
# BLENDER=/path/to/blender.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
BLENDER="${BLENDER:-$(command -v blender || echo /snap/bin/blender)}"
[[ -x "$BLENDER" ]] || { echo "Blender not found. Install Blender 5.2+ or set BLENDER=/path/to/blender" >&2; exit 1; }
"$BLENDER" --version | head -1

ALL=(sunny sunrise sunset overcast fog storm night)
which="${1:-both}"; shift || true
case "$which" in
  both) weathers=(sunny storm) ;;
  all) weathers=("${ALL[@]}") ;;
  *) IFS=, read -r -a weathers <<< "$which"
     for w in "${weathers[@]}"; do
       [[ " ${ALL[*]} " == *" $w "* ]] || { echo "usage: $0 [${ALL[*]// /|}|both|all] [args]" >&2; exit 2; }
     done ;;
esac

mkdir -p "$REPO/build/hero"
cd "$REPO"
for w in "${weathers[@]}"; do
  echo "==> $w"
  # nice + a thread cap (in hero_battle.py, --threads, default 6) keep the
  # CPU side from cooking a laptop; the render itself is on the GPU.
  case "$w" in sunny|storm) save="$HERE/hero-battle-$w.blend" ;; *) save="$REPO/build/hero/hero-battle-$w.blend" ;; esac
  nice -n 10 "$BLENDER" -b -t "${BLENDER_THREADS:-6}" --python scripts/blender/hero_battle.py -- \
      --weather "$w" --save "$save" "$@"
done
