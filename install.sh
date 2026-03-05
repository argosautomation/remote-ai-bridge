#!/bin/bash
# install.sh - Sets up the Remote AI Bridge daemon as a standalone service

echo "🌉 Remote AI Bridge - Standalone Setup"
echo "======================================"

BRIDGE_DIR="$HOME/.remote-ai-bridge"
CONFIG_FILE="$BRIDGE_DIR/config.json"

mkdir -p "$BRIDGE_DIR"

echo ""
echo "Please enter your Telegram Bot Token (from @BotFather):"
read -r BOT_TOKEN

echo ""
echo "Please enter your Telegram Chat ID (from @userinfobot):"
read -r CHAT_ID

echo ""
echo "What IDE do you use? (e.g., Antigravity, Cursor, VS Code)"
echo "Press Enter to use default shortcut (ctrl+shift+i) or type a custom shortcut (like ctrl+l):"
read -r CHAT_SHORTCUT
if [ -z "$CHAT_SHORTCUT" ]; then
    CHAT_SHORTCUT="ctrl+shift+i"
fi

# Write config
cat > "$CONFIG_FILE" << EOF
{
  "bot_token": "$BOT_TOKEN",
  "chat_id": "$CHAT_ID",
  "chat_shortcut": "$CHAT_SHORTCUT"
}
EOF

echo "✅ Config saved to $CONFIG_FILE"

echo ""
echo "🔧 Installing dependencies..."
cp standalone_bot.js "$BRIDGE_DIR/"
cd "$BRIDGE_DIR"
npm init -y >/dev/null 2>&1
npm install node-telegram-bot-api >/dev/null 2>&1

echo "📦 Installing systemd service..."
SERVICE_DIR="$HOME/.config/systemd/user"
mkdir -p "$SERVICE_DIR"

cat > "$SERVICE_DIR/remote-ai-bridge.service" << EOF
[Unit]
Description=Remote AI Bridge Daemon
After=network.target

[Service]
ExecStart=/usr/bin/node $BRIDGE_DIR/standalone_bot.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now remote-ai-bridge.service

echo ""
echo "🎉 Setup Complete!"
echo "The daemon is now running in the background."
echo "You can check its status with: systemctl --user status remote-ai-bridge"
