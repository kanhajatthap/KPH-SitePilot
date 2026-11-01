#!/usr/bin/env bash
#
# Packages the SitePilot Connector as an installable WordPress plugin ZIP.
#
#   scripts/build-connector-zip.sh            → dist/kph-sitepilot-connector-<version>.zip
#
# The archive contains exactly one top-level directory (WordPress requires it),
# keeps the readme, and drops development-only files. The version is read from
# the plugin header, so the ZIP name and the header can never disagree.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_DIR="$ROOT/wordpress/kph-sitepilot-connector"
MAIN_FILE="$PLUGIN_DIR/kph-sitepilot-connector.php"
OUT_DIR="${OUT_DIR:-$ROOT/dist}"

if [[ ! -f "$MAIN_FILE" ]]; then
  echo "build-connector-zip: missing $MAIN_FILE" >&2
  exit 1
fi

if ! command -v zip >/dev/null 2>&1; then
  echo "build-connector-zip: the 'zip' command is required" >&2
  exit 1
fi

VERSION="$(sed -n 's/^ \* Version: *//p' "$MAIN_FILE" | head -n1 | tr -d '\r')"
CONST_VERSION="$(sed -n "s/.*define( 'KPH_SP_VERSION', '\([^']*\)' ).*/\1/p" "$MAIN_FILE" | head -n1 | tr -d '\r')"

if [[ -z "$VERSION" ]]; then
  echo "build-connector-zip: could not read Version from the plugin header" >&2
  exit 1
fi

if [[ "$VERSION" != "$CONST_VERSION" ]]; then
  echo "build-connector-zip: header version ($VERSION) != KPH_SP_VERSION ($CONST_VERSION)" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
ZIP="$OUT_DIR/kph-sitepilot-connector-$VERSION.zip"
rm -f "$ZIP"

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/kph-sitepilot-connector"

# Copy only what a production site needs.
(
  cd "$PLUGIN_DIR"
  find . -type f \
    ! -name '.*' \
    ! -path './tests/*' \
    ! -path './node_modules/*' \
    ! -path './assets/src/*' \
    ! -name '*.map' \
    ! -name '*.md' \
    -print0 | while IFS= read -r -d '' file; do
      mkdir -p "$STAGE/kph-sitepilot-connector/$(dirname "$file")"
      cp "$file" "$STAGE/kph-sitepilot-connector/$file"
    done
)

( cd "$STAGE" && zip -qr "$ZIP" kph-sitepilot-connector )

SIZE="$(wc -c < "$ZIP" | tr -d ' ')"
echo "built $ZIP ($SIZE bytes, version $VERSION)"

# Smoke-test the archive: one root directory, a main file, and no tests.
# The listing is captured once: piping into `grep -q` under `pipefail` reports
# the SIGPIPE from grep exiting early as a failure of the whole pipeline.
LISTING="$(unzip -Z1 "$ZIP")"

if ! printf '%s\n' "$LISTING" | grep -q '^kph-sitepilot-connector/kph-sitepilot-connector\.php$'; then
  echo "build-connector-zip: archive is missing the plugin bootstrap" >&2
  exit 1
fi
if printf '%s\n' "$LISTING" | grep -q '/tests/'; then
  echo "build-connector-zip: archive leaked development tests" >&2
  exit 1
fi
if printf '%s\n' "$LISTING" | awk -F/ '{print $1}' | sort -u | grep -qv '^kph-sitepilot-connector$'; then
  echo "build-connector-zip: archive must have exactly one top-level directory" >&2
  exit 1
fi

echo "ok: main file present, no tests included"
