#!/usr/bin/env bash
set -euo pipefail

rich_text_script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
rich_text_test_directory="$(mktemp -d "${TMPDIR:-/tmp}/zhihu-rich-text-models.XXXXXX")"
trap 'rm -rf "$rich_text_test_directory"' EXIT

xcrun swiftc \
  -module-cache-path "$rich_text_test_directory/cache" \
  "$rich_text_script_directory/../ios/RichTextModels.swift" \
  "$rich_text_script_directory/ModelsSmoke.swift" \
  -o "$rich_text_test_directory/models-smoke"
"$rich_text_test_directory/models-smoke"
