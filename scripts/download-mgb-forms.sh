#!/usr/bin/env bash
set -euo pipefail

# Downloads the official MGB Form 29 XLS files to ./docs/forms
# Requires: curl

TARGET_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/docs/forms"
mkdir -p "$TARGET_DIR"

base="https://mgb.gov.ph/images/stories"
files=(
  "mgb29-01.xls"
  "mgb29-02.xls"
  "mgb29-03.xls"
  "mgb29-04.xls"
  "mgb29-05.xls"
  "mgb29-06.xls"
  "mgb29-07.xls"
  "mgb29-08.xls"
  "mgb29-09.xls"
  "mgb29-10.xls"
  "mgb29-12.xls"
  "mgb29-13.xls"
  "mgb29-21.xls"
)

for f in "${files[@]}"; do
  url="$base/$f"
  echo "Downloading $url"
  curl -L --fail -o "$TARGET_DIR/$f" "$url"
done

echo "Done. Files saved to: $TARGET_DIR"
