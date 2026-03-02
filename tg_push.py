#!/usr/bin/env python3
"""
Remote AI Bridge — Push messages to Telegram.
Used by AI agents to reply when the user is on their phone.

Usage: python3 tg_push.py "Your message here"
"""
import sys, json, os, urllib.request

CONFIG = os.path.join(os.path.expanduser("~"), ".remote-ai-bridge", "config.json")


def load_creds():
    try:
        with open(CONFIG) as f:
            d = json.load(f)
            return d.get("bot_token", ""), d.get("chat_id", "")
    except Exception:
        return "", ""


def send(text):
    token, chat_id = load_creds()
    if not token or not chat_id:
        print("Error: No credentials. Configure via Remote AI Bridge panel.")
        sys.exit(1)

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = json.dumps({"chat_id": chat_id, "text": text}).encode()
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})

    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            res = json.loads(r.read())
            if res.get("ok"):
                print(f"Sent to {chat_id}")
            else:
                print(f"API error: {res}")
    except Exception as e:
        print(f"Error: {e}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 tg_push.py 'message'")
        sys.exit(1)
    send(" ".join(sys.argv[1:]))
