# Child Workspace Template

This folder contains example persona files for a Kid Chat child agent workspace.

Use it as a starting point when creating a new child workspace such as:

- `~/.openclaw/workspace-grace`
- `~/.openclaw/workspace-george`
- `~/.openclaw/workspace-emma`

## How to use

1. Copy this folder into a real child workspace.
2. Edit `IDENTITY.md`, `USER.md`, and `SOUL.md` for the child.
3. Keep `MEMORY.md` small at first.
4. Point the child's `agentId` at that workspace in OpenClaw.

## Files

- `AGENTS.md` — workspace operating rules
- `SOUL.md` — personality and teaching style
- `USER.md` — who the child is
- `IDENTITY.md` — short identity card
- `TOOLS.md` — local notes if needed
- `MEMORY.md` — durable learned preferences over time

## Design rule

- stable persona lives here
- long-term memory lives here
- app settings belong in `data/kid-settings.json`
- do not rely on a separate `profile.json` layer
