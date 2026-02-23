#!/bin/sh
set -e

REPO="circlesac/cgrok"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$OS-$ARCH" in
  darwin-arm64)  TARGET="cgrok-darwin-arm64" ;;
  darwin-x86_64) TARGET="cgrok-darwin-x64" ;;
  linux-aarch64) TARGET="cgrok-linux-arm64" ;;
  linux-x86_64)  TARGET="cgrok-linux-x64" ;;
  *) echo "Unsupported platform: $OS-$ARCH"; exit 1 ;;
esac

VERSION=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | cut -d'"' -f4)
URL="https://github.com/$REPO/releases/download/$VERSION/$TARGET.tar.gz"

echo "Installing cgrok $VERSION..."
curl -fsSL "$URL" | tar xz -C "$INSTALL_DIR"
chmod +x "$INSTALL_DIR/cgrok"
echo "Installed to $INSTALL_DIR/cgrok"
