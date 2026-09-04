#!/usr/bin/env python3
"""Read-only Discord server audit: activity, spam patterns, inactive members.

Intended to run via the discord-audit GitHub Actions workflow
(.github/workflows/discord-audit.yml), triggered manually from the Actions
tab. Makes no changes to the server - it only reads and reports.

Required environment variables:
  DISCORD_BOT_TOKEN  Bot token with View Channels / Read Message History
                      permissions, and the "Server Members Intent" enabled
                      in the Discord Developer Portal.
  GUILD_ID            Optional. If unset and the bot is in exactly one
                      server, that server is used automatically.
"""

import os
import re
import sys
import time

import requests

API = "https://discord.com/api/v10"
TOKEN = os.environ.get("DISCORD_BOT_TOKEN")
GUILD_ID = os.environ.get("GUILD_ID", "").strip()

MAX_MESSAGES_PER_CHANNEL = 10_000
CHANNEL_TYPES_TEXT = {0, 5}  # GUILD_TEXT, GUILD_ANNOUNCEMENT

SPAM_PATTERNS = [
    (re.compile(r"discord\.gg/\S+", re.I), "discord invite link"),
    (re.compile(r"\bfree\s+nitro\b", re.I), "'free nitro' scam phrasing"),
    (re.compile(r"\bsteam\s*gift\b", re.I), "steam gift scam phrasing"),
    (re.compile(r"@everyone|@here"), "mass mention"),
    (re.compile(r"(https?://\S+){3,}", re.I), "3+ links in one message"),
    (re.compile(r"(.)\1{9,}"), "long repeated-character spam"),
]

session = requests.Session()
session.headers.update(
    {
        "Authorization": f"Bot {TOKEN}",
        "User-Agent": "DiscordAuditBot (read-only server audit, 1.0)",
    }
)


def api_get(path, **params):
    url = f"{API}{path}"
    while True:
        resp = session.get(url, params=params)
        if resp.status_code == 429:
            retry_after = resp.json().get("retry_after", 1)
            time.sleep(retry_after + 0.5)
            continue
        resp.raise_for_status()
        if resp.headers.get("X-RateLimit-Remaining") == "0":
            time.sleep(float(resp.headers.get("X-RateLimit-Reset-After", 0.5)))
        return resp.json()


def pick_guild():
    guilds = api_get("/users/@me/guilds")
    if GUILD_ID:
        for g in guilds:
            if g["id"] == GUILD_ID:
                return g
        sys.exit(
            f"GUILD_ID {GUILD_ID} not found among the bot's servers: "
            f"{[(g['id'], g['name']) for g in guilds]}"
        )
    if len(guilds) == 1:
        return guilds[0]
    print("The bot is in multiple servers. Re-run the workflow with the")
    print("guild_id input set to one of:")
    for g in guilds:
        print(f"  {g['id']}  {g['name']}")
    sys.exit(1)


def fetch_channel_messages(channel_id):
    messages = []
    before = None
    while len(messages) < MAX_MESSAGES_PER_CHANNEL:
        params = {"limit": 100}
        if before:
            params["before"] = before
        batch = api_get(f"/channels/{channel_id}/messages", **params)
        if not batch:
            break
        messages.extend(batch)
        before = batch[-1]["id"]
        if len(batch) < 100:
            break
    return messages


def fetch_members(guild_id):
    members = []
    after = "0"
    while True:
        batch = api_get(f"/guilds/{guild_id}/members", limit=1000, after=after)
        if not batch:
            break
        members.extend(batch)
        after = batch[-1]["user"]["id"]
        if len(batch) < 1000:
            break
    return members


def flag_spam(content):
    return [label for pattern, label in SPAM_PATTERNS if pattern.search(content or "")]


def main():
    if not TOKEN:
        sys.exit("DISCORD_BOT_TOKEN is not set")

    guild = pick_guild()
    guild_id = guild["id"]
    print(f"Auditing guild: {guild['name']} ({guild_id})")

    channels = api_get(f"/guilds/{guild_id}/channels")
    text_channels = [c for c in channels if c["type"] in CHANNEL_TYPES_TEXT]

    report = [f"# Discord Audit: {guild['name']}", ""]
    all_authors = set()
    flagged_total = 0

    for ch in sorted(text_channels, key=lambda c: c.get("position", 0)):
        messages = fetch_channel_messages(ch["id"])
        author_ids = {m["author"]["id"] for m in messages}
        all_authors |= author_ids
        flagged = [(m, flag_spam(m.get("content", ""))) for m in messages]
        flagged = [(m, hits) for m, hits in flagged if hits]
        flagged_total += len(flagged)

        last_ts = messages[0]["timestamp"] if messages else None
        report.append(f"## #{ch['name']}")
        capped = " (capped)" if len(messages) >= MAX_MESSAGES_PER_CHANNEL else ""
        report.append(f"- Messages scanned: {len(messages)}{capped}")
        report.append(f"- Distinct authors: {len(author_ids)}")
        report.append(f"- Most recent message: {last_ts or 'none'}")
        report.append(f"- Flagged as likely spam: {len(flagged)}")
        if flagged:
            report.append("")
            report.append("| Author | Timestamp | Reason | Link |")
            report.append("|---|---|---|---|")
            for m, hits in flagged[:50]:
                link = f"https://discord.com/channels/{guild_id}/{ch['id']}/{m['id']}"
                author = f"{m['author']['username']} ({m['author']['id']})"
                report.append(f"| {author} | {m['timestamp']} | {', '.join(hits)} | [jump]({link}) |")
            if len(flagged) > 50:
                report.append(f"| ... | {len(flagged) - 50} more not shown | | |")
        report.append("")

    members = fetch_members(guild_id)
    inactive = [m for m in members if not m["user"].get("bot") and m["user"]["id"] not in all_authors]

    report.append("## Members")
    report.append(f"- Total members: {len(members)}")
    report.append(f"- Members with zero messages in the scanned history: {len(inactive)}")
    report.append("")
    report.append("## Summary")
    report.append(f"- Total messages flagged as likely spam: {flagged_total}")
    report.append("")
    report.append(
        "_This is a read-only report. No messages, members, or roles were "
        "changed. Review flagged items before taking any action._"
    )

    text = "\n".join(report)
    print(text)

    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a") as f:
            f.write(text + "\n")

    with open("discord_audit_report.md", "w") as f:
        f.write(text)


if __name__ == "__main__":
    main()
