#!/usr/bin/env bash
# Release a new version of a set, end to end.
#
#   npx jake "bump-set[base-set,0.4]"
#   scripts/bump-set.sh base-set 0.4
#   scripts/bump-set.sh base-set 0.4 --dry-run
#
# A version bump used to be six manual steps in a fixed order, and skipping
# any one of them left something broken in a way nothing checked:
#
#   edit set.json · sync the manifest · fix freeDownloadUrl · rebuild the zip
#   · add a _redirects line · delete the superseded zip
#
# Miss the URL and the site links at a file you are about to delete. Miss the
# redirect and every link anyone has shared 404s. Delete nothing and the old
# zip shadows its own redirect, so the fix silently does nothing. None of that
# is interesting work, so this script owns all of it and the checklist is gone.
#
# What it does, for a FREE set:
#   1. writes the new version into the set's set.json (source of truth)
#   2. runs sync-sets-manifest.sh, which copies it into the site manifest and
#      rewrites freeDownloadUrl to match
#   3. rebuilds the public zip at the new version
#   4. points every _redirects rule that aimed at the old zip to the new one,
#      and adds a rule for the version just superseded
#   5. deletes the superseded zip, because a real file at that path would take
#      precedence over the redirect that replaces it
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
old_zip="$STL_ROOT/${base_name}-${old_version}.zip"
new_zip="$STL_ROOT/${base_name}-${new_version}.zip"

run_quiet "" "$REPO_ROOT/scripts/build-stl-zip.sh" "$set_id"
[[ -n "$dry_run" ]] || echo "  zip           → $(basename "$new_zip") ($(du -h "$new_zip" | cut -f1))"

# ── Redirects ────────────────────────────────────────────────────────────
# Only the root _redirects is edited. nuxt-site/public/_redirects is a build
# artifact that build.sh copies there, and is gitignored.
REDIRECTS="$REPO_ROOT/_redirects"
old_url="/assets/stls/$(basename "$old_zip")"
new_url="/assets/stls/$(basename "$new_zip")"

if [[ "$old_version" != "$new_version" && -f "$REDIRECTS" ]]; then
    if [[ -n "$dry_run" ]]; then
        echo "    would repoint _redirects rules at $new_url and add $old_url"
    else
        tmp="$(mktemp)"
        # Existing rules aimed at the old zip now aim at the new one, so a
        # chain of past versions never points at a file that just went away.
        # The [[:space:]]\+ matches the whole gap; consuming only one space
        # would leave the rewritten column misaligned.
        sed "s#[[:space:]]\+${old_url}[[:space:]]*301\$#  ${new_url}  301#" \
            "$REDIRECTS" > "$tmp"
        # ...and the version being retired gets a rule of its own.
        if ! grep -qF "$old_url  " "$tmp"; then
            printf '%s  %s  301\n' "$old_url" "$new_url" >> "$tmp"
        fi
        mv "$tmp" "$REDIRECTS"
        echo "  _redirects    → $(grep -c '301$' "$REDIRECTS") rule(s), all → v$new_version"
    fi
fi

# ── Retire the superseded zip ────────────────────────────────────────────
# Must happen: a static file at the old path outranks the redirect above it.
if [[ "$old_zip" != "$new_zip" && -f "$old_zip" ]]; then
    run rm -f "$old_zip"
    [[ -n "$dry_run" ]] || echo "  retired       → $(basename "$old_zip")"
fi

if [[ -z "$dry_run" ]]; then
    echo
    echo "Done. Review with: git status && git diff -- _redirects nuxt-site/server/data/sets.json"
fi
