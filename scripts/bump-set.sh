#!/usr/bin/env bash
# Release a new version of a set, end to end.
#
#   npx jake "bump-set[base-set,0.4]"
#   scripts/bump-set.sh base-set 0.4
#   scripts/bump-set.sh base-set 0.4 --dry-run
#
# What it does, for a FREE set:
#   1. writes the new version into the set's set.json (source of truth)
#   2. runs sync-sets-manifest.sh, which copies it into the site manifest
#   3. rebuilds the public zip
#
# The zip's filename carries no version (cannons-and-coastlines-base-set.zip,
# with a versioned folder inside), so its URL never changes: no redirects to
# add, no old zip to retire. _headers gives zips a short cache so a new
# release reaches people straight away.
#
# For a PAID set only steps 1-2 apply: its files never enter the published
# tree. The script says so and stops, leaving `npx jake publish-sets` to push
# to R2.
#
# Re-running with the version already in place is a no-op rather than an
# error, so an interrupted bump can simply be run again.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/lib" && pwd)/common.sh"

command -v jq >/dev/null 2>&1 || { echo "error: jq is required" >&2; exit 1; }

usage() {
    echo "usage: $(basename "$0") <set-id> <new-version> [--dry-run]" >&2
    echo "   e.g. $(basename "$0") base-set 0.4" >&2
    exit 1
}

set_id="${1:-}"
new_version="${2:-}"
dry_run=""
[[ -n "$set_id" && -n "$new_version" ]] || usage
case "${3:-}" in
    --dry-run) dry_run=1 ;;
    "")        ;;
    *)         usage ;;
esac

# A version becomes a filename and a URL path segment, so keep it boring.
[[ "$new_version" =~ ^[0-9A-Za-z._-]+$ ]] || {
    echo "error: '$new_version' is not a usable version (letters, digits, . _ - only)" >&2
    exit 1
}

dir="$(set_dir "$set_id")" || exit 1
old_version="$(set_field "$dir" '.version')"
paid="$(set_field "$dir" '.paid' 'false')"

# run <cmd...>  — run it, or say so under --dry-run.
run() {
    if [[ -n "$dry_run" ]]; then
        echo "    would run: $*"
    else
        "$@"
    fi
}

# run_quiet <label> <cmd...> — same, but swallows the child's own chatter on a
# real run. The announcement has to happen out here: redirecting the call site
# would hide the dry-run line along with the output it was meant to suppress.
run_quiet() {
    local label="$1"; shift
    if [[ -n "$dry_run" ]]; then
        echo "    would run: $*"
    else
        "$@" >/dev/null
        # A plain `[[ ... ]] && echo` here would be the function's last command
        # and would return 1 whenever the label is empty, which under `set -e`
        # silently aborts the whole release halfway through. Use an if.
        if [[ -n "$label" ]]; then
            echo "  $label"
        fi
    fi
}

echo "▸ $set_id  v$old_version → v$new_version${dry_run:+  (dry run)}"

if [[ "$old_version" == "$new_version" ]]; then
    echo "  set.json is already on v$new_version; re-running the rest anyway."
else
    # Going backwards is legal (a rollback) but is far more often a typo, so
    # say something and keep going rather than guess.
    newest="$(printf '%s\n%s\n' "$old_version" "$new_version" | sort -V | tail -1)"
    [[ "$newest" == "$new_version" ]] || \
        echo "  note: v$new_version sorts BELOW the current v$old_version — rolling back?"

    if [[ -n "$dry_run" ]]; then
        echo "    would write version $new_version into ${dir#"$REPO_ROOT"/}/set.json"
    else
        tmp="$(mktemp)"
        jq --arg v "$new_version" '.version = $v' "$dir/set.json" > "$tmp"
        mv "$tmp" "$dir/set.json"
        echo "  set.json      → v$new_version"
    fi
fi

# Manifest: version, and freeDownloadUrl derived from it.
run_quiet "site manifest → v$new_version" "$REPO_ROOT/scripts/sync-sets-manifest.sh"

if [[ "$paid" == "true" ]]; then
    cat <<MSG

  $set_id is a paid set: no public zip, no redirect. Its files stage outside
  the published tree and ship to R2:

      npx jake "publish-sets[$set_id]"
MSG
    exit 0
fi

base_name="$(set_field "$dir" '.publicZipBaseName')"
zip_path="$STL_ROOT/${base_name}.zip"

run_quiet "" "$REPO_ROOT/scripts/build-stl-zip.sh" "$set_id"
[[ -n "$dry_run" ]] || echo "  zip           → $(basename "$zip_path") ($(du -h "$zip_path" | cut -f1)), same URL as before"

# Zips from before the URL stopped carrying a version: a real file at one of
# those paths would outrank the _redirects rule that sends it to the zip
# above, so they must not linger.
shopt -s nullglob
for legacy in "$STL_ROOT/${base_name}"-*.zip; do
    run rm -f "$legacy"
    [[ -n "$dry_run" ]] || echo "  removed       → $(basename "$legacy") (old versioned filename)"
done
shopt -u nullglob

if [[ -z "$dry_run" ]]; then
    echo
    echo "Done. Review with: git status && git diff -- nuxt-site/server/data/sets.json"
fi
