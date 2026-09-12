#!/usr/bin/env bash
# Command-line front end for the shared compress_pdf helper, for one-off
# manual re-distills. The implementation (and the profile documentation)
# lives in scripts/lib/common.sh, which the build scripts source directly.
#
# Usage:
#   compress-pdf.sh <path-to-pdf>                 # /printer, in place
#   compress-pdf.sh <input.pdf> <output.pdf>      # /printer, write to output
#   compress-pdf.sh --profile <printer|prepress|ebook|screen> <input> [output]
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)/common.sh"

if [[ $# -eq 0 ]]; then
  sed -n '2,12p' "${BASH_SOURCE[0]}" >&2
  exit 1
fi

compress_pdf "$@"
