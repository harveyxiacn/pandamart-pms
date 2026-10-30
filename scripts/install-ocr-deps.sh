#!/usr/bin/env bash
# Install the system packages used by the local invoice OCR plugin.
# Ubuntu / Debian only; safe to run repeatedly.
set -euo pipefail

if ! command -v apt-get >/dev/null 2>&1; then
  echo "This script supports Debian/Ubuntu. Install tesseract, chi_sim data and poppler-utils manually on other systems." >&2
  exit 1
fi

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  SUDO="sudo"
fi

$SUDO apt-get update
$SUDO apt-get install -y \
  tesseract-ocr \
  tesseract-ocr-eng \
  tesseract-ocr-chi-sim \
  poppler-utils

echo
echo "Installed:"
tesseract --version | head -1
tesseract --list-langs
pdftoppm -v 2>&1 | head -1
