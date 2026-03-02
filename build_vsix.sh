#!/bin/bash
# build_vsix.sh — Build .vsix package without vsce (works on Node 18)
set -e

DIR="/home/phil/Projects/remote-ai-bridge"
cd "$DIR"

VERSION=$(node -e "console.log(require('./package.json').version)")
NAME=$(node -e "console.log(require('./package.json').name)")
PUBLISHER=$(node -e "console.log(require('./package.json').publisher)")
VSIX_NAME="${NAME}-${VERSION}.vsix"

echo "Building ${VSIX_NAME}..."

# Create build directory
BUILD_DIR=$(mktemp -d)
EXT_DIR="$BUILD_DIR/extension"
mkdir -p "$EXT_DIR"

# Copy extension files (exclude dev stuff)
cp package.json extension.js standalone_bot.js tg_push.py "$EXT_DIR/"
cp icon.png "$EXT_DIR/" 2>/dev/null || true
cp LICENSE "$EXT_DIR/" 2>/dev/null || true
cp README.md "$EXT_DIR/" 2>/dev/null || true
cp remote-ai-bridge.service "$EXT_DIR/" 2>/dev/null || true

# Copy node_modules (only production deps)
if [ -d node_modules/node-telegram-bot-api ]; then
    mkdir -p "$EXT_DIR/node_modules"
    cp -r node_modules/node-telegram-bot-api "$EXT_DIR/node_modules/"
    # Copy transitive deps
    for dep in debug ms pump once wrappy end-of-stream bl readable-stream string_decoder safe-buffer inherits util-deprecate qs side-channel get-intrinsic es-errors has-symbols hasown function-bind gopd has-proto set-function-length define-data-property call-bind object-inspect es-define-property eventemitter3 p-cancelable mime file-type strtok3 ieee754 token-types peek-readable; do
        [ -d "node_modules/$dep" ] && cp -r "node_modules/$dep" "$EXT_DIR/node_modules/" 2>/dev/null
    done
fi

# Generate [Content_Types].xml
cat > "$BUILD_DIR/[Content_Types].xml" << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension=".json" ContentType="application/json"/>
  <Default Extension=".js" ContentType="application/javascript"/>
  <Default Extension=".py" ContentType="text/x-python"/>
  <Default Extension=".png" ContentType="image/png"/>
  <Default Extension=".md" ContentType="text/markdown"/>
  <Default Extension=".service" ContentType="text/plain"/>
  <Default Extension=".txt" ContentType="text/plain"/>
  <Default Extension=".vsixmanifest" ContentType="text/xml"/>
</Types>
EOF

# Generate extension.vsixmanifest
cat > "$BUILD_DIR/extension.vsixmanifest" << EOF
<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US" Id="${NAME}" Version="${VERSION}" Publisher="${PUBLISHER}"/>
    <DisplayName>Remote AI Bridge</DisplayName>
    <Description xml:space="preserve">Control your AI coding assistant from Telegram. Two-way messaging, screenshots, and more.</Description>
    <Tags>telegram,remote,ai,bridge,chat,automation</Tags>
    <Categories>Other</Categories>
    <GalleryFlags>Public</GalleryFlags>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="^1.80.0"/>
      <Property Id="Microsoft.VisualStudio.Services.GitHubFlavoredMarkdown" Value="true"/>
    </Properties>
    <Icon>extension/icon.png</Icon>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code"/>
  </Installation>
  <Dependencies/>
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/>
    <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true"/>
    <Asset Type="Microsoft.VisualStudio.Services.Icons.Default" Path="extension/icon.png" Addressable="true"/>
  </Assets>
</PackageManifest>
EOF

# Build the VSIX (it's just a ZIP)
cd "$BUILD_DIR"
zip -r "$DIR/$VSIX_NAME" . -x "*.DS_Store" > /dev/null

# Cleanup
rm -rf "$BUILD_DIR"

echo "✅ Built: $DIR/$VSIX_NAME"
ls -lh "$DIR/$VSIX_NAME"
