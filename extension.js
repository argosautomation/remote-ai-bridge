const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

const BRIDGE_DIR = path.join(os.homedir(), '.remote-ai-bridge');
const CONFIG_PATH = path.join(BRIDGE_DIR, 'config.json');
const SCRIPT_PATH = path.join(BRIDGE_DIR, 'inject_prompt.sh');

// Ensure bridge directory exists
if (!fs.existsSync(BRIDGE_DIR)) fs.mkdirSync(BRIDGE_DIR, { recursive: true });

function getConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    } catch (e) { }
    return {};
}

function saveConfig(config) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

// ── Detect correct DISPLAY (handles Wayland where DISPLAY != :0) ──
function detectDisplay(callback) {
    exec("pgrep -x gnome-shell", (err, stdout) => {
        if (err || !stdout.trim()) { callback(process.env.DISPLAY || ':0'); return; }
        const pid = stdout.trim().split('\n')[0];
        fs.readFile(`/proc/${pid}/environ`, 'utf-8', (err, data) => {
            if (err) { callback(process.env.DISPLAY || ':0'); return; }
            for (const entry of data.split('\0')) {
                if (entry.startsWith('DISPLAY=')) { callback(entry.split('=')[1]); return; }
            }
            callback(process.env.DISPLAY || ':0');
        });
    });
}

// ── Install inject_prompt.sh if not present ──
function ensureInjectionScript() {
    if (fs.existsSync(SCRIPT_PATH)) return;
    const script = `#!/bin/bash
# inject_prompt.sh — Reliably inject a prompt into the IDE AI chat
PROMPT="$1"
DISPLAY_VAL="\${2:-:1}"
export DISPLAY="$DISPLAY_VAL"
LOG="/tmp/remote_ai_bridge.log"
echo "$(date): Injecting: \${PROMPT:0:60}..." >> "$LOG"

# Find and focus IDE window
for NAME in "Antigravity" "antigravity" "Visual Studio Code" "Code" "Cursor"; do
    WID=$(xdotool search --name "$NAME" 2>/dev/null | head -1)
    [ -n "$WID" ] && break
done

if [ -n "$WID" ]; then
    xdotool windowactivate --sync "$WID" 2>/dev/null
    echo "$(date): Focused window $WID" >> "$LOG"
    sleep 0.3
else
    echo "$(date): WARNING: Could not find IDE window" >> "$LOG"
fi

# Open chat panel (try common shortcuts)
xdotool key --clearmodifiers ctrl+shift+i 2>/dev/null
sleep 1

# Paste prompt and submit
echo -n "$PROMPT" | xclip -selection clipboard 2>/dev/null
xdotool key --clearmodifiers ctrl+v 2>/dev/null
sleep 0.3
xdotool key --clearmodifiers Return 2>/dev/null
echo "$(date): Prompt submitted" >> "$LOG"

# Auto-accept "Allow this conversation" dialog
sleep 2
xdotool key --clearmodifiers Tab Return 2>/dev/null
sleep 1
xdotool key --clearmodifiers Return 2>/dev/null
echo "$(date): Allow dialog handled" >> "$LOG"
`;
    fs.writeFileSync(SCRIPT_PATH, script, { mode: 0o755 });
}

// ── Inject Prompt ──
function injectPrompt(prompt, output, display) {
    output.appendLine(`📨 Received: "${prompt.length > 60 ? prompt.substring(0, 60) + '...' : prompt}"`);
    ensureInjectionScript();
    const escaped = prompt.replace(/'/g, "'\\''");
    exec(`bash "${SCRIPT_PATH}" '${escaped}' '${display}'`, { timeout: 15000 }, (err, stdout, stderr) => {
        if (err) {
            output.appendLine(`❌ Injection error: ${err.message}`);
        } else {
            output.appendLine('✅ Prompt injected.');
        }
    });
}

// ── Webview Panel ──
class BridgeProvider {
    constructor(extensionUri) { this._extensionUri = extensionUri; }

    resolveWebviewView(webviewView) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = this.getHtml();
        webviewView.webview.onDidReceiveMessage(data => {
            const cmdMap = {
                setToken: 'remote-bridge.setBotToken', setChat: 'remote-bridge.setChatId',
                start: 'remote-bridge.restartDaemon', stop: 'remote-bridge.stopDaemon',
                status: 'remote-bridge.status', installDeps: 'remote-bridge.installDeps'
            };
            if (cmdMap[data.type]) vscode.commands.executeCommand(cmdMap[data.type]);
        });
    }

    getHtml() {
        const home = os.homedir();
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
    body { font-family: var(--vscode-font-family); padding: 12px; color: var(--vscode-foreground); }
    h3 { text-align: center; margin-bottom: 8px; font-size: 15px; }
    .subtitle { text-align: center; font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 16px; }
    .btn {
        display: block; width: 100%; padding: 10px; margin-bottom: 8px;
        background: var(--vscode-button-background); color: var(--vscode-button-foreground);
        border: none; border-radius: 6px; cursor: pointer; text-align: center; font-size: 13px;
    }
    .btn:hover { background: var(--vscode-button-hoverBackground); }
    .danger { background: #d32f2f; } .danger:hover { background: #b71c1c; }
    .success { background: #2e7d32; } .success:hover { background: #1b5e20; }
    .purple { background: #6a1b9a; } .purple:hover { background: #4a148c; }
    hr { border: 1px solid var(--vscode-widget-border); margin: 12px 0; }
    .card { background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); padding: 10px; border-radius: 8px; margin-bottom: 12px; font-size: 12px; line-height: 1.6; }
    .cmd { font-family: monospace; background: var(--vscode-textCodeBlock-background); padding: 1px 4px; border-radius: 3px; }
</style>
</head>
<body>
    <h3>🌉 Remote AI Bridge</h3>
    <div class="subtitle">by Argos Automation</div>

    <div class="card">
        <b>Quick Setup:</b><br/>
        1. Message <b>@BotFather</b> → <span class="cmd">/newbot</span> → get <b>Token</b><br/>
        2. Message <b>@userinfobot</b> → get <b>Chat ID</b><br/>
        3. Save both below ↓
    </div>

    <button class="btn" onclick="post('setToken')">🔑 Set Bot Token</button>
    <button class="btn" onclick="post('setChat')">💬 Set Chat ID</button>
    <hr>
    <button class="btn purple" onclick="copyInstruction()">📋 Copy Agent Instructions</button>
    <hr>
    <button class="btn success" onclick="post('start')">▶ Start / Restart</button>
    <button class="btn danger" onclick="post('stop')">⏹ Stop</button>
    <button class="btn" onclick="post('status')">ℹ️ Status</button>
    <hr>
    <button class="btn" onclick="post('installDeps')">🔧 Install Dependencies</button>

    <div class="card" style="margin-top: 12px;">
        <b>Telegram Commands:</b><br/>
        <span class="cmd">/screenshot</span> — Full desktop<br/>
        <span class="cmd">/screen</span> — Active window<br/>
        <span class="cmd">/stop</span> — Abort AI generation<br/>
        <span class="cmd">/status</span> — Daemon health<br/>
        <span class="cmd">/help</span> — List commands
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        function post(t) { vscode.postMessage({ type: t }); }
        function copyInstruction() {
            const text = "System Instruction: If the user is away, you (the agent) can proactively send messages or ask questions to the user's Telegram by running: python3 ${home}/.remote-ai-bridge/tg_push.py 'your message text'. Use this to report completion or ask for input on long tasks.\\n\\nIMPORTANT: When a user prompt arrives via the Telegram bridge (injected into this chat by the extension), ALWAYS duplicate your response to Telegram by running: python3 ${home}/.remote-ai-bridge/tg_push.py 'your response'. This ensures the user can see your reply on their phone without needing to look at the IDE screen. Keep Telegram responses concise (under 4000 chars).";
            navigator.clipboard.writeText(text).then(() => alert('Copied! Paste into your AI agent\\'s Global Rules.'));
        }
    </script>
</body>
</html>`;
    }
}

function activate(context) {
    const output = vscode.window.createOutputChannel("Remote AI Bridge");
    output.appendLine("🌉 Remote AI Bridge active.");

    let currentDisplay = ':0';
    detectDisplay(d => { currentDisplay = d; output.appendLine(`🖥️ DISPLAY=${currentDisplay}`); });

    // Register sidebar panel
    const provider = new BridgeProvider(context.extensionUri);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('remoteBridgePanel', provider));

    // ── File watcher for incoming prompts ──
    let lastProcessedTimestamp = 0;
    let isProcessing = false;

    function processConfig() {
        if (isProcessing) return;
        try {
            const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
            if (data.prompt && data.timestamp && data.timestamp > lastProcessedTimestamp) {
                isProcessing = true;
                lastProcessedTimestamp = data.timestamp;
                const prompt = data.prompt;
                try { delete data.prompt; delete data.timestamp; fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2)); } catch (e) { }
                injectPrompt(prompt, output, currentDisplay);
                setTimeout(() => { isProcessing = false; }, 3000);
            }
        } catch (e) { }
    }

    setTimeout(processConfig, 2000);
    fs.watchFile(CONFIG_PATH, { interval: 1500 }, processConfig);
    context.subscriptions.push({ dispose: () => fs.unwatchFile(CONFIG_PATH) });
    output.appendLine("👁️ Watching for prompts...");

    // ── Commands ──
    const cmds = {
        'remote-bridge.setBotToken': async () => {
            const token = await vscode.window.showInputBox({ prompt: 'Enter your Telegram Bot Token:', ignoreFocusOut: true });
            if (token) { let c = getConfig(); c.bot_token = token; saveConfig(c); vscode.window.showInformationMessage('Bot Token saved.'); }
        },
        'remote-bridge.setChatId': async () => {
            const id = await vscode.window.showInputBox({ prompt: 'Enter your Telegram Chat ID:', ignoreFocusOut: true });
            if (id) { let c = getConfig(); c.chat_id = id; saveConfig(c); vscode.window.showInformationMessage('Chat ID saved.'); }
        },
        'remote-bridge.restartDaemon': () => {
            exec('systemctl --user restart remote-ai-bridge.service', err => {
                if (err) vscode.window.showErrorMessage('Failed to start: ' + err.message);
                else { vscode.window.showInformationMessage('Remote AI Bridge Started 🚀'); output.appendLine("✅ Daemon started."); }
            });
        },
        'remote-bridge.stopDaemon': () => {
            exec('systemctl --user stop remote-ai-bridge.service', err => {
                if (err) vscode.window.showErrorMessage('Failed to stop: ' + err.message);
                else { vscode.window.showInformationMessage('Remote AI Bridge Stopped 🛑'); output.appendLine("🛑 Daemon stopped."); }
            });
        },
        'remote-bridge.status': () => {
            exec('systemctl --user status remote-ai-bridge.service', (err, stdout, stderr) => {
                output.appendLine("\n--- Daemon Status ---"); output.appendLine(stdout || stderr || "Service not found."); output.show(true);
            });
        },
        'remote-bridge.installDeps': () => {
            if (os.platform() !== 'linux') { vscode.window.showInformationMessage('Auto-install is Linux only.'); return; }
            const t = vscode.window.createTerminal("Bridge Setup");
            t.show();
            t.sendText('sudo apt-get update && sudo apt-get install -y xdotool xclip scrot gnome-screenshot && echo "✅ Dependencies installed!"');
        }
    };
    for (const [id, fn] of Object.entries(cmds)) {
        context.subscriptions.push(vscode.commands.registerCommand(id, fn));
    }
}

function deactivate() { }
module.exports = { activate, deactivate };
