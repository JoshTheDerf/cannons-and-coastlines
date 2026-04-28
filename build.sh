#!/usr/bin/env bash
# Build script for Cloudflare Pages.
# Copies the public site into dist/ so the deploy doesn't try to upload
# .git internals, drafts in _internal/, or other dev-only files.
set -euo pipefail

DIST=dist
rm -rf "$DIST"
mkdir -p "$DIST"

# Copy each public top-level item explicitly.
# (CF Pages' build image lacks rsync, so use plain cp.)
for item in \
    assets \
    css \
    game \
    js \
    privacy \
    rulebook \
    starter-pack \
    index.html \
    _headers \
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
       "$DIST/assets/playtesting"

echo "Built $DIST/ ($(du -sh "$DIST" | cut -f1))"
