#!/usr/bin/env bash
# Build the paid downloads: one zip per paid set, and the all-fleets bundle.
#
#   scripts/build-paid-zips.sh                   # every paid set, plus bundles
#   scripts/build-paid-zips.sh stone-fleet-set   # just these sets, plus bundles
#   NO_BUNDLES=1 scripts/build-paid-zips.sh ...  # skip the bundles
#   PAID_SET_ROOT=/path/to/paid-sets scripts/build-paid-zips.sh
#
# Output goes to build/paid-zips/ (gitignored, and outside assets/, which is
# served publicly), laid out exactly as the R2 keys the Worker asks for:
#
#   <set-id>/v<version>/<set-id>-v<version>.zip
#   <set-id>/v<version>/MANIFEST.txt
#   <bundle-id>/<set-id>-v<version>_.../<zipBaseName>.zip
#   <bundle-id>/<set-id>-v<version>_.../MANIFEST.txt
#
# r2ZipKey() and r2BundleKey() in nuxt-site/server/utils/sets.ts build the
# same strings; keep them in step. scripts/publish-paid-sets.sh runs this and
# uploads the result, so there is normally no need to run it on its own
# (except to look inside a zip before publishing).
#
# Zips are built from whatever is in the set folders right now. Every zip
# gets a PRINTING.pdf (rulebook/typst/print-list.typ) and a PRINTING.md
# (scripts/lib/print_guide.py), both from nuxt-site/content/pages/print-lists.yml
# and print-guide.yml. The bundle holds a folder per set (bundles[].includes
# in nuxt-site/server/data/sets.json, the free base set too), each with its
# own PRINTING.md, and one combined PRINTING.pdf and PRINTING.md at the top.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")/lib" && pwd)/common.sh"

command -v jq >/dev/null 2>&1 || { echo "error: jq is required but not installed" >&2; exit 1; }
command -v sha256sum >/dev/null 2>&1 || { echo "error: sha256sum is required but not installed" >&2; exit 1; }

OUT="${PAID_ZIP_OUT:-$REPO_ROOT/build/paid-zips}"
case "$(realpath -m "$OUT")/" in
    "$(realpath -m "$REPO_ROOT/assets")"/*)
        echo "error: $OUT is under assets/, which is served publicly" >&2; exit 1 ;;
esac
rm -rf "$OUT"
mkdir -p "$OUT"

# set_files <dir>: the model files that go in a download. set.json is repo
# bookkeeping and stays out.
set_files() {
    local dir="$1"
    shopt -s nullglob
    local files=("$dir"/*.stl "$dir"/*.svg "$dir"/*.3mf)
    shopt -u nullglob
    (( ${#files[@]} )) && printf '%s\n' "${files[@]}"
    return 0
}

# checked_dir <set-id>: the set's folder, after checking its version.
checked_dir() {
    local dir
    dir="$(set_dir "$1")" || return 1
    require_version_agreement "$1" "$dir" || return 1
    echo "$dir"
}

# write_manifest <out> <title> <root>: sha256 of every file under <root>.
write_manifest() {
    local out="$1" title="$2" root="$3"
    {
        echo "# $title"
        echo "# packed $(date -u +%Y-%m-%dT%H:%M:%SZ)"
        echo
        ( cd "$root" && find . -type f -printf '%P\0' | sort -z | xargs -0 sha256sum )
    } > "$out"
}

if (( $# )); then
    requested=("$@")
else
    mapfile -t requested < <(jq -r '.sets[] | select(.paid) | .id' "$SETS_MANIFEST")
fi

built=0
skipped=0

# ── One zip per paid set ──────────────────────────────────────────────
for set_id in "${requested[@]}"; do
    paid="$(jq -r --arg id "$set_id" '.sets[] | select(.id == $id) | .paid' "$SETS_MANIFEST")"
    if [[ -z "$paid" ]]; then
        echo "error: '$set_id' is not in $SETS_MANIFEST" >&2
        exit 1
    fi
    if [[ "$paid" != "true" ]]; then
        echo "skip  $set_id (free set; \`npx jake stl\` builds its public zip)"
        (( skipped++ )) || true
        continue
    fi

    dir="$(checked_dir "$set_id")"
    version="$(set_field "$dir" '.version')"
    mapfile -t files < <(set_files "$dir")
    if (( ${#files[@]} == 0 )); then
        # An empty folder is the normal state for a set that isn't finished.
        echo "skip  $set_id ($dir has no .stl/.svg/.3mf files)"
        (( skipped++ )) || true
        continue
    fi

    name="${set_id}-v${version}"
    dest="$OUT/$set_id/v$version"
    mkdir -p "$dest"

    staging="$(mktemp -d)"
    trap 'rm -rf "$staging"' EXIT
    # One top-level folder, so extracting doesn't scatter STLs in Downloads.
    mkdir "$staging/$name"
    cp "${files[@]}" "$staging/$name/"
    print_guide check "$set_id" "$dir"
    print_guide set "$set_id" "$dir" > "$staging/$name/PRINTING.md"
    print_list_pdf "$set_id" "$staging/$name/PRINTING.pdf"
    make_zip "$dest/$name.zip" "$staging"
    write_manifest "$dest/MANIFEST.txt" "$set_id v$version" "$staging"
    rm -rf "$staging"
    trap - EXIT

    echo "▸ $set_id v$version  $(du -h "$dest/$name.zip" | cut -f1)  ${dest#"$REPO_ROOT"/}/$name.zip"
    (( built++ )) || true
done

# ── Bundles ───────────────────────────────────────────────────────────
if [[ -z "${NO_BUNDLES:-}" ]]; then
    mapfile -t bundle_ids < <(jq -r '.bundles[]?.id' "$SETS_MANIFEST")
    for bundle_id in "${bundle_ids[@]}"; do
        bundle="$(jq -c --arg id "$bundle_id" '.bundles[] | select(.id == $id)' "$SETS_MANIFEST")"
        base="$(jq -r '.zipBaseName' <<<"$bundle")"
        mapfile -t includes < <(jq -r '.includes[] | "\(.folder)=\(.set)"' <<<"$bundle")

        staging="$(mktemp -d)"
        trap 'rm -rf "$staging"' EXIT
        root="$staging/$base"
        mkdir "$root"

        stamp=()
        missing=""
        for pair in "${includes[@]}"; do
            folder="${pair%%=*}" set_id="${pair#*=}"
            dir="$(checked_dir "$set_id")"
            stamp+=("${set_id}-v$(set_field "$dir" '.version')")
            mapfile -t files < <(set_files "$dir")
            if (( ${#files[@]} == 0 )); then missing="$set_id"; break; fi
            mkdir "$root/$folder"
            cp "${files[@]}" "$root/$folder/"
            print_guide check "$set_id" "$dir"
            print_guide bundle-fleet "$set_id" "$dir" > "$root/$folder/PRINTING.md"
        done
        if [[ -n "$missing" ]]; then
            # Never ship a bundle with a hole in it.
            echo "skip  bundle $bundle_id ($missing has no files yet)"
            rm -rf "$staging"; trap - EXIT
            (( skipped++ )) || true
            continue
        fi
        print_guide bundle-top "${includes[@]}" > "$root/PRINTING.md"
        # One combined PDF for the whole bundle, at the top.
        print_list_pdf "$bundle_id" "$root/PRINTING.pdf"

        stamp_str="$(IFS=_; echo "${stamp[*]}")"
        dest="$OUT/$bundle_id/$stamp_str"
        mkdir -p "$dest"
        make_zip "$dest/$base.zip" "$staging"
        write_manifest "$dest/MANIFEST.txt" "$bundle_id ($stamp_str)" "$staging"
        rm -rf "$staging"
        trap - EXIT

        echo "▸ bundle $bundle_id  $(du -h "$dest/$base.zip" | cut -f1)  ${dest#"$REPO_ROOT"/}/$base.zip"
        (( built++ )) || true
    done
fi

echo
echo "Done: $built zip(s) built in ${OUT#"$REPO_ROOT"/}/, $skipped skipped."
