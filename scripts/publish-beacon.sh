#!/usr/bin/env bash
# Publish this repo to GitHub and serve the Road Beacon over HTTPS via GitHub Pages.
# Geolocation needs a secure context, so a hosted URL is the reliable way to run
# the beacon in mobile Safari. Run: bash scripts/publish-beacon.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if ! gh repo view earchibald/travel-time >/dev/null 2>&1; then
  gh repo create travel-time --public --source=. --push
else
  git push -u origin main
fi

gh api -X POST repos/earchibald/travel-time/pages \
  -f 'source[branch]=main' -f 'source[path]=/' 2>/dev/null \
  || gh api -X PUT repos/earchibald/travel-time/pages \
       -f 'source[branch]=main' -f 'source[path]=/' >/dev/null

echo
echo "Beacon URL (allow a minute for the first deploy):"
echo "  https://earchibald.github.io/travel-time/companion/road-beacon.html"
