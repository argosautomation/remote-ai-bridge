const TelegramBot = require('node-telegram-bot-api');
const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ── Config ──
const BRIDGE_DIR = path.join(os.homedir(), '.remote-ai-bridge');
const CONFIG_PATH = path.join(BRIDGE_DIR, 'config.json');

if (!fs.existsSync(BRIDGE_DIR)) fs.mkdirSync(BRIDGE_DIR, { recursive: true });

let botToken = '';
let chatId = '';

// Read credentials from config
let config = {};
try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    botToken = config.bot_token || '';
    chatId = config.chat_id || '';
} catch (e) { }

if (!botToken) {
    console.error('No bot token found. Configure via the extension panel.');
    process.exit(1);
}

// ── Detect DISPLAY ──
let DISPLAY = process.env.DISPLAY || ':0';
try {
    const pid = execSync('pgrep -x gnome-shell', { encoding: 'utf8' }).trim().split('\n')[0];
    const env = fs.readFileSync(`/proc/${pid}/environ`, 'utf8');
    for (const entry of env.split('\0')) {
        if (entry.startsWith('DISPLAY=')) { DISPLAY = entry.split('=')[1]; break; }
    }
} catch (e) { }

console.log(`🌉 Remote AI Bridge daemon (DISPLAY=${DISPLAY}, PID=${process.pid})`);

// ── Bot Setup ──
const bot = new TelegramBot(botToken, {
    polling: { interval: 2000, autoStart: true, params: { timeout: 30 } }
});

// Keep-alive
const keepAlive = setInterval(() => { }, 60000);

// ── Error Handling ──
process.on('uncaughtException', err => console.error('Uncaught:', err.message));
process.on('unhandledRejection', reason => console.error('Unhandled:', reason));
process.on('SIGTERM', () => { clearInterval(keepAlive); bot.stopPolling().then(() => process.exit(0)); });
process.on('SIGINT', () => { clearInterval(keepAlive); bot.stopPolling().then(() => process.exit(0)); });

// ── Commands ──
const HELP_TEXT = `🌉 *Remote AI Bridge Commands*

/screenshot — Full desktop capture
/screen — Active window capture
/stop — Abort AI generation
/status — Daemon health check
/help — This help message

_Any other text is sent as a prompt to your AI assistant._`;

bot.on('message', async msg => {
    const text = msg.text;
    const fromId = msg.chat.id;

    if (chatId && fromId.toString() !== chatId.toString()) return;
    if (!text) return;

    console.log(`📨 ${text.substring(0, 60)}`);

    try {
        switch (text) {
            case '/help':
            case '/start':
                bot.sendMessage(fromId, HELP_TEXT, { parse_mode: 'Markdown' });
                break;

            case '/stop':
                exec(`DISPLAY=${DISPLAY} xdotool key Escape Escape`, () => {
                    bot.sendMessage(fromId, '🛑 Stop signal sent.');
                });
                break;

            case '/screen':
            case '/screenshot':
                takeScreenshot(fromId, text === '/screenshot');
                break;

            case '/status': {
                const uptime = process.uptime();
                const h = Math.floor(uptime / 3600);
                const m = Math.floor((uptime % 3600) / 60);
                bot.sendMessage(fromId, `✅ *Remote AI Bridge*\n🖥️ DISPLAY: ${DISPLAY}\n📍 PID: ${process.pid}\n⏱️ Uptime: ${h}h ${m}m`, { parse_mode: 'Markdown' });
                break;
            }

            default:
                if (!text.startsWith('/')) {
                    const SCRIPT_PATH = path.join(BRIDGE_DIR, 'inject_prompt.sh');
                    const script = `#!/bin/bash
PROMPT="$1"
DISPLAY_VAL="\${2:-:1}"
CHAT_KEY="\${3:-ctrl+shift+i}"
export DISPLAY="$DISPLAY_VAL"
LOG="/tmp/remote_ai_bridge.log"
echo "$(date): Injecting: \${PROMPT:0:60}..." >> "$LOG"

for NAME in "Antigravity" "antigravity" "Visual Studio Code" "Code" "Cursor" "Windsurf"; do
    WID=$(xdotool search --name "$NAME" 2>/dev/null | head -1)
    [ -n "$WID" ] && break
done

if [ -n "$WID" ]; then
    xdotool windowactivate "$WID" 2>/dev/null
    sleep 0.5
fi

xdotool key --clearmodifiers $CHAT_KEY 2>/dev/null
sleep 1

echo -n "$PROMPT" | xclip -selection clipboard 2>/dev/null
xdotool key --clearmodifiers ctrl+v 2>/dev/null
sleep 0.5
xdotool key --clearmodifiers Return 2>/dev/null

for WAIT in 3 5 8 12; do
    sleep $WAIT
    [ -n "$WID" ] && xdotool windowactivate "$WID" 2>/dev/null
    xdotool key --clearmodifiers Tab Tab Return 2>/dev/null
done
`;
                    fs.writeFileSync(SCRIPT_PATH, script, { mode: 0o755 });
                    const escaped = text.replace(/'/g, "'\\''");
                    const chatShortcut = config.chat_shortcut || 'ctrl+shift+i';
                    exec(`bash "${SCRIPT_PATH}" '${escaped}' '${DISPLAY}' '${chatShortcut}'`, { timeout: 45000 });
                    bot.sendMessage(fromId, '✅ Prompt injected directly into IDE.');
                }
        }
    } catch (err) {
        console.error('Handler error:', err.message);
        try { bot.sendMessage(fromId, '❌ ' + err.message); } catch (e) { }
    }
});

// ── Screenshots ──
function takeScreenshot(targetId, fullScreen = true) {
    const tmp = path.join(os.tmpdir(), `bridge_${Date.now()}.png`);
    const cmd = fullScreen
        ? `DISPLAY=${DISPLAY} scrot "${tmp}" 2>/dev/null || DISPLAY=${DISPLAY} gnome-screenshot -f "${tmp}" 2>/dev/null`
        : `DISPLAY=${DISPLAY} scrot -u "${tmp}" 2>/dev/null || DISPLAY=${DISPLAY} gnome-screenshot -w -f "${tmp}" 2>/dev/null`;

    bot.sendMessage(targetId, '📸 Capturing...');
    exec(cmd, { timeout: 15000 }, async () => {
        if (!fs.existsSync(tmp) || fs.statSync(tmp).size < 1000) {
            bot.sendMessage(targetId, '❌ Screenshot failed. Is scrot installed?');
            return;
        }
        try {
            await bot.sendPhoto(targetId, tmp, { caption: fullScreen ? '💻 Full Desktop' : '🖼️ Active Window' });
            setTimeout(() => { try { fs.unlinkSync(tmp); } catch (e) { } }, 2000);
        } catch (err) {
            bot.sendMessage(targetId, '❌ ' + err.message);
        }
    });
}

// ── Polling Recovery ──
let errorCount = 0;
bot.on('polling_error', err => {
    errorCount++;
    console.error(`Polling error #${errorCount}: ${err.message}`);
    if (errorCount > 10) {
        errorCount = 0;
        bot.stopPolling().then(() => setTimeout(() => bot.startPolling(), 5000));
    }
});
bot.on('message', () => { errorCount = 0; });

console.log('🌉 Listening for Telegram messages...');
