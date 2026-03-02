# 🌉 Remote AI Bridge

**Control your AI coding assistant from Telegram.** Two-way messaging, screenshots, prompt injection, and auto-recovery — all from your phone.

By [Argos Automation](https://github.com/argosautomation)

---

## ✨ Features

| Feature | Description |
|---|---|
| 📱 **Two-way messaging** | Send prompts from Telegram, get AI responses back |
| 📸 **Remote screenshots** | Capture full desktop or active window from your phone |
| 🛑 **Stop generation** | Abort AI responses with `/stop` |
| ♻️ **Auto-recovery** | Daemon restarts within 3 seconds after any crash |
| 🖥️ **Multi-IDE support** | Works with VS Code, Antigravity, Cursor, and forks |
| 🔒 **No hardcoded credentials** | All config stored locally in `~/.remote-ai-bridge/` |
| 🐧 **Wayland support** | Auto-detects correct DISPLAY on Wayland/Xwayland |

## 🚀 Quick Start

### 1. Create a Telegram Bot

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` and follow the prompts
3. Copy the **Bot Token**
4. Message [@userinfobot](https://t.me/userinfobot) to get your **Chat ID**

### 2. Install the Extension

Install from `.vsix`:
```bash
code --install-extension remote-ai-bridge-1.0.0.vsix
```

### 3. Configure

1. Open the **Remote AI Bridge** panel in the sidebar
2. Click **Set Bot Token** and paste your token
3. Click **Set Chat ID** and paste your ID
4. Click **Install Dependencies** (installs `xdotool`, `xclip`, `scrot`)
5. Click **Start / Restart**

### 4. Enable AI Responses to Telegram

Click **📋 Copy Agent Instructions** and paste into your AI assistant's Global Rules. This tells the AI to send responses back to Telegram.

## 📱 Telegram Commands

| Command | Description |
|---|---|
| `/screenshot` | Full desktop screenshot |
| `/screen` | Active window screenshot |
| `/stop` | Abort current AI generation |
| `/status` | Check daemon health |
| `/help` | List available commands |
| *any text* | Send as prompt to AI chat |

## 🏗️ Architecture

```
Phone (Telegram)
    │
    ▼
Telegram Bot API
    │
    ▼
standalone_bot.js (daemon)  ◄── systemd auto-restart
    │
    ▼
~/.remote-ai-bridge/config.json  (prompt + timestamp)
    │
    ▼
extension.js (file watcher)
    │
    ▼
inject_prompt.sh  →  IDE AI Chat
    │
    ▼
AI responds  →  tg_push.py  →  Telegram
```

## 🔧 Manual Setup (Advanced)

### Install the systemd service:
```bash
cp remote-ai-bridge.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now remote-ai-bridge.service
```

### Install dependencies:
```bash
sudo apt install xdotool xclip scrot
```

### Install node dependencies:
```bash
cd ~/.remote-ai-bridge && npm install node-telegram-bot-api
```

## 📄 License

MIT — use it however you want.

---

Made with ❤️ by [Argos Automation](https://github.com/argosautomation)
