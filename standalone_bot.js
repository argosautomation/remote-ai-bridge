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
try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
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
                    let existing = {};
                    try { existing = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch (e) { }
                    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ ...existing, prompt: text, timestamp: Date.now() }, null, 2));
                    bot.sendMessage(fromId, '⏳ Prompt sent to IDE...');
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
