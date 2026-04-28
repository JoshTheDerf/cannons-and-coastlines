#!/usr/bin/env bash
# Build script for Cloudflare Pages.
# Copies the public site into dist/ so the deploy doesn't try to upload
# .git internals, drafts in _internal/, or other dev-only files.
set -euo pipefail

DIST=dist
rm -rf "$DIST"
mkdir -p "$DIST"

rsync -a \
    --exclude='.git/' \
    --exclude='.github/' \
    --exclude='.gitignore' \
    --exclude='.claude/' \
    --exclude='_internal/' \
    --exclude="$DIST/" \
    --exclude='build.sh' \
    --exclude='README.md' \
    --exclude='node_modules/' \
    --exclude='.DS_Store' \
    --exclude='rulebook/png/' \
    --exclude='rulebook/svg/' \
    --exclude='rulebook/assets/' \
    --exclude='assets/playtesting/' \
    ./ "$DIST/"

echo "Built $DIST/ ($(du -sh $DIST | cut -f1))"
