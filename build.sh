#!/usr/bin/env bash
# Build script for Cloudflare Pages.
# Copies the public site into dist/ so the deploy doesn't try to upload
# .git internals, drafts in _internal/, or other dev-only files.
set -euo pipefail

DIST=dist
rm -rf "$DIST"
mkdir -p "$DIST"

# Copy each public top-level item explicitly. Anything not on this list
# stays out of dist/ and therefore out of the Cloudflare Pages deploy --
# notably scripts/ (Blender render pipeline), _internal/ (drafts and other
# private working files), and .git*. Typst sources under rulebook/typst/
# are stripped below.
# (CF Pages' build image lacks rsync, so use plain cp.)
for item in \
    assets \
    css \
    game \
    js \
    parts \
    privacy \
    rulebook \
    starter-pack \
    index.html \
    _headers \
    _redirects \
    LICENSE
do
    if [ -e "$item" ]; then
        cp -R "$item" "$DIST/"
    fi
done

# Strip subdirectories we don't serve (rulebook source files, unused media).
rm -rf "$DIST/rulebook/png" \
       "$DIST/rulebook/svg" \
       "$DIST/rulebook/assets" \
       "$DIST/rulebook/typst" \
       "$DIST/assets/playtesting"

# Print-optimized PDFs are preserved in the repo for the print pipeline but
# blow past Cloudflare Pages' 25 MiB per-asset cap; only the web-compressed
# versions are deployed.
rm -f "$DIST/rulebook/pdf"/*-print.pdf

echo "Built $DIST/ ($(du -sh "$DIST" | cut -f1))"
