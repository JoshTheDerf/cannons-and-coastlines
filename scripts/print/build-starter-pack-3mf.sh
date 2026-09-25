#!/usr/bin/env bash
# Build printable 3MFs for one or more Cannons & Coastlines starter-pack
# orders using OrcaSlicer's CLI. For each faction with a non-zero order
# count, emits six grouped 3MFs (main / sails / cannonballs / coins /
# islands / terrain) so each plate can be printed in its own filament or
# run.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

ORCA="${ORCA:-$HOME/Downloads/OrcaSlicer_Linux_AppImage_Ubuntu2404_V2.3.2.AppImage}"
STL_DIR="${STL_DIR:-$BASE_SET_DIR}"
PRESETS_DIR="${PRESETS_DIR:-$SCRIPT_DIR/presets}"
PROFILE_CACHE="${ORCA_PROFILE_CACHE:-$HOME/.cache/orcaslicer-resources}"

QUEENS_ORDERS=0
CORSAIRS_ORDERS=0
OUTDIR="$REPO_ROOT/build/3mf"
EXTRA_ARGS=()

usage() {
    cat <<EOF
Usage: $(basename "$0") [--queens N] [--corsairs N] [--outdir DIR] [-- <orca args...>]

Generates one set of 3MFs per faction with a non-zero order count.
Each set contains seven files, scaled by order count:
  <faction>-x<N>-main.3mf              ships, masts, wheels, cargo, cannons
  <faction>-x<N>-sails.3mf             sails
  <faction>-x<N>-cannonballs-tpu.3mf   half of the cannonballs (TPU)
  <faction>-x<N>-cannonballs-pla.3mf   half of the cannonballs (PLA)
  <faction>-x<N>-coins.3mf             all coin faces
  <faction>-x<N>-islands.3mf           island toppers
  <faction>-x<N>-terrain.3mf           rocks + reefs

Each group uses a process preset from scripts/print/presets/<group>.json.
Anything after \`--\` is forwarded to OrcaSlicer.

Three bulk full-plate batches are always emitted alongside the orders:
  bulk-cannonballs-tpu.3mf   as many cannonballs as fit on one plate (TPU)
  bulk-cannonballs-pla.3mf   same, for PLA
  bulk-coins.3mf             evenly-distributed coin faces filling one plate

Env:
  ORCA                  Path to the OrcaSlicer AppImage.
  STL_DIR               Where the source STLs live (defaults to the
                        bundled base-set in this repo).
  PRESETS_DIR           Where the per-group process presets live
                        (defaults to scripts/print/presets).
  ORCA_PROFILE_CACHE    Where to extract Orca's bundled profiles
                        (default: ~/.cache/orcaslicer-resources).
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --queens)   QUEENS_ORDERS="$2"; shift 2 ;;
        --corsairs) CORSAIRS_ORDERS="$2"; shift 2 ;;
        --outdir)   OUTDIR="$2"; shift 2 ;;
        -h|--help)  usage; exit 0 ;;
        --)         shift; EXTRA_ARGS+=("$@"); break ;;
        *)          echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
    esac
done

mkdir -p "$OUTDIR"

# --- Profile cache (one-time AppImage extraction) -------------------------
if [[ ! -d "$PROFILE_CACHE/profiles/Elegoo" ]]; then
    echo "Extracting Orca profiles to $PROFILE_CACHE …"
    mkdir -p "$PROFILE_CACHE"
    (cd "$PROFILE_CACHE" \
        && "$ORCA" --appimage-extract resources/profiles >/dev/null \
        && mv squashfs-root/resources/profiles ./profiles \
        && rm -rf squashfs-root)
fi

# --- Pick any ECC printer the user has on this system ---------------------
shopt -s nullglob
ecc_machines=()
for f in "$PROFILE_CACHE/profiles/Elegoo/machine/"ECC*/*.json; do
    case "$(basename "$f")" in
        *"0.4 nozzle"*) ecc_machines=("$f" "${ecc_machines[@]}") ;;
        *" nozzle"*)    ecc_machines+=("$f") ;;
    esac
done
shopt -u nullglob

[[ ${#ecc_machines[@]} -gt 0 ]] || { echo "No ECC machine profile in $PROFILE_CACHE" >&2; exit 1; }
MACHINE="${ecc_machines[0]}"

machine_line="$(basename "$(dirname "$MACHINE")")"
nozzle="$(basename "$MACHINE" .json | sed -n 's/.* \([0-9]\.[0-9]\) nozzle/\1/p')"
process_dir="$PROFILE_CACHE/profiles/Elegoo/process/$machine_line"

# Resolve any process JSON (system or user preset) into a flat profile by
# walking its `inherits` chain. Orca's CLI rejects partial diffs.
RESOLVED_DIR="$(mktemp -d)"
trap 'rm -rf "$RESOLVED_DIR"' EXIT

resolve_process() {
    local input="$1" output="$2"
    python3 - "$input" "$output" "$process_dir" <<'PY'
import json, os, sys
src, dst, search_dir = sys.argv[1:]
def load(p):
    with open(p) as f: return json.load(f)
def resolve(p):
    cfg = load(p)
    parent = cfg.pop("inherits", None)
    if parent:
        merged = resolve(os.path.join(search_dir, parent + ".json"))
        merged.update(cfg)
        cfg = merged
    return cfg
out = resolve(src)
out["from"] = "system"
with open(dst, "w") as f: json.dump(out, f, indent=2)
PY
}

# Resolve and cache one preset → returns its resolved-JSON path on stdout.
resolve_preset() {
    local name="$1"
    local src="$PRESETS_DIR/${name}.json"
    local dst="$RESOLVED_DIR/${name}.json"
    [[ -f "$src" ]] || { echo "Missing preset: $src" >&2; exit 1; }
    [[ -f "$dst" ]] || resolve_process "$src" "$dst"
    echo "$dst"
}

# --- Per-pack quantities --------------------------------------------------
mast_per_ship=2     # the mast carries the flag holder at its top
sail_per_ship=2
wheel_per_ship=2
cargo_per_ship=4

cannons_per_pack=8
cannonballs_per_pack=30
islands_per_pack=3
rocks_per_pack=2
reefs_per_pack=2

# Coins per pack, as "<stem>:<count>", matching the rulebook's 20-coin set:
# 5 Brace · 2 Full Sail · 2 Evasive · 5 Gunner · 4 Repair · 2 Boarding.
# Listed in a fixed order so plate layout stays reproducible.
COIN_COUNTS=(
    coin-brace-for-impact:5
    coin-full-sail:2
    coin-evasive-maneuver:2
    coin-skilled-gunner:5
    coin-repair-crew:4
    coin-boarding-party:2
)

# --- Helpers --------------------------------------------------------------
# Append `count` copies of $STL_DIR/$file to the array named in $1.
add_to() {
    local -n target="$1"; shift
    local file="$1" count="$2" i
    [[ "$count" -le 0 ]] && return
    [[ -f "$STL_DIR/$file" ]] || { echo "Missing STL: $file" >&2; exit 1; }
    for (( i = 0; i < count; i++ )); do target+=("$STL_DIR/$file"); done
}

# Slice a single 3MF group (skips empty groups). $2 is the resolved
# process JSON path for this group's preset.
run_orca_group() {
    local out_path="$1" process="$2"; shift 2
    if [[ $# -eq 0 ]]; then echo "  skip $(basename "$out_path") (empty)"; return; fi
    echo "  → $(basename "$out_path")  ($# instances)"
    "$ORCA" \
        "$@" \
        --load-settings "$process;$MACHINE" \
        --orient 0 \
        --arrange 1 \
        --allow-rotations \
        --ensure-on-bed \
        --outputdir "$(dirname "$out_path")" \
        --export-3mf "$(basename "$out_path")" \
        "${EXTRA_ARGS[@]}" >/dev/null
}

# Bulk single-plate counts. Estimated for the ECC 256² plate with default
# arrange spacing — open the resulting 3MF in Orca and tweak if too sparse
# or too crowded. Cannonball footprint ≈10×10 mm, coin ≈15×15 mm.
BULK_CANNONBALLS=400
BULK_COIN_SETS=10  # the bulk plate holds ten full coin sets

build_bulk_single() {
    local out_path="$1" process="$2" stl="$3" count="$4"
    local -a files=()
    local i
    for (( i = 0; i < count; i++ )); do files+=("$STL_DIR/$stl"); done
    run_orca_group "$out_path" "$process" "${files[@]}"
}

build_faction() {
    local faction="$1" orders="$2" ship_stl="$3" ship_count="$4"
    [[ "$orders" -le 0 ]] && return

    local total_ships=$(( ship_count * orders ))
    local prefix="$OUTDIR/${faction}-x${orders}"

    echo "── $faction × $orders order(s) ($total_ships ships) ──"

    local -a main=() sails=() balls=() coins=() islands=() terrain=()

    add_to main "$ship_stl"                     "$total_ships"
    add_to main "mast.stl"                      "$(( mast_per_ship * total_ships ))"
    add_to main "movement-wheel.stl"            "$(( wheel_per_ship * total_ships ))"
    add_to main "cargo.stl"                     "$(( cargo_per_ship * total_ships ))"
    add_to main "cannon.stl"                    "$(( cannons_per_pack * orders ))"

    add_to sails "sail.stl"       "$(( sail_per_ship * total_ships ))"
    add_to balls "cannonball.stl" "$(( cannonballs_per_pack * orders ))"

    local spec c n
    for spec in "${COIN_COUNTS[@]}"; do
        c="${spec%:*}"; n="${spec#*:}"
        add_to coins "${c}.stl" "$(( n * orders ))"
    done

    add_to islands "island-topper.stl" "$(( islands_per_pack * orders ))"
    add_to terrain "rock1.stl"         "$(( rocks_per_pack * orders ))"
    add_to terrain "reef.stl"          "$(( reefs_per_pack * orders ))"

    # Cannonballs split 50/50 across two filaments (TPU + PLA), same preset.
    local n=${#balls[@]} half=$(( ${#balls[@]} / 2 ))
    local -a balls_tpu=("${balls[@]:0:half}") balls_pla=("${balls[@]:half}")

    run_orca_group "${prefix}-main.3mf"            "$P_MAIN"        "${main[@]}"
    run_orca_group "${prefix}-sails.3mf"           "$P_SAILS"       "${sails[@]}"
    run_orca_group "${prefix}-cannonballs-tpu.3mf" "$P_CANNONBALLS" "${balls_tpu[@]}"
    run_orca_group "${prefix}-cannonballs-pla.3mf" "$P_CANNONBALLS" "${balls_pla[@]}"
    run_orca_group "${prefix}-coins.3mf"           "$P_COINS"       "${coins[@]}"
    run_orca_group "${prefix}-islands.3mf"         "$P_TERRAIN"     "${islands[@]}"
    run_orca_group "${prefix}-terrain.3mf"         "$P_TERRAIN"     "${terrain[@]}"
}

# Resolve all presets up-front.
P_MAIN="$(resolve_preset main)"
P_SAILS="$(resolve_preset sails)"
P_TERRAIN="$(resolve_preset terrain)"
P_COINS="$(resolve_preset coins)"
P_CANNONBALLS="$(resolve_preset cannonballs)"

echo "Output dir: $OUTDIR"
echo "Printer:    $(basename "$MACHINE" .json)"
echo "Presets:    $PRESETS_DIR"

build_faction queens   "$QUEENS_ORDERS"   ship-queens-fleet.stl 3
build_faction corsairs "$CORSAIRS_ORDERS" ship-corsair.stl       4

# --- Bulk single-plate plates --------------------------------------------
# Always emit three full-plate batches independent of order count.
echo "── bulk full-plate batches ──"
build_bulk_single "$OUTDIR/bulk-cannonballs-tpu.3mf" "$P_CANNONBALLS" cannonball.stl "$BULK_CANNONBALLS"
build_bulk_single "$OUTDIR/bulk-cannonballs-pla.3mf" "$P_CANNONBALLS" cannonball.stl "$BULK_CANNONBALLS"

bulk_coins=()
for spec in "${COIN_COUNTS[@]}"; do
    c="${spec%:*}"; n="${spec#*:}"
    for ((i=0; i<n*BULK_COIN_SETS; i++)); do bulk_coins+=("$STL_DIR/${c}.stl"); done
done
run_orca_group "$OUTDIR/bulk-coins.3mf" "$P_COINS" "${bulk_coins[@]}"

echo "Done."
