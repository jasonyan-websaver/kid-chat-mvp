# Kid Chat Isolation Architecture

Last verified: 2026-04-05

## Purpose

This document records how Kid Chat routes messages to child agents, which workspace files are loaded, and what is and is not isolated from the main assistant workspace.

## Short answer

Kid Chat is **not** sending messages to the main `coder` assistant workspace.
It is sending messages to dedicated OpenClaw child agents:

- `grace` → `/Users/jason/.openclaw/workspace-grace`
- `george` → `/Users/jason/.openclaw/workspace-george`

These child agents load their own workspace files, including:

- `AGENTS.md`
- `SOUL.md`
- `USER.md`
- `IDENTITY.md`
- `TOOLS.md`
- `MEMORY.md`
- `memory/*.md`

## Message path

Current message path:

```text
Kid Chat UI
  -> app/api/chat/route.ts
  -> lib/openclaw.ts
  -> openclaw agent --agent <agentId> --message <prompt> --json
  -> OpenClaw child agent runtime
  -> child workspace files injected into system prompt
  -> agent reply returned to Kid Chat
  -> local chat transcript stored under data/chat-store/<kidId>/
```

## Code-level evidence

### Kid-to-agent mapping

Defined in `lib/kids.ts`:

- `grace` uses `agentId: 'grace'`
- `george` uses `agentId: 'george'`

### Real agent invocation

Defined in `lib/openclaw.ts`:

```bash
openclaw agent --agent <agentId> --message <prompt> --json
```

This means Kid Chat calls OpenClaw by agent id, not by reusing the main coder session.

### Child memory/workspace path resolution

Defined in `lib/kid-paths.ts`:

Default workspace path:

```text
~/.openclaw/workspace-<kidId>
```

Default memory path:

```text
~/.openclaw/workspace-<kidId>/MEMORY.md
```

Environment overrides are supported:

- `KID_CHAT_WORKSPACE_GRACE`
- `KID_CHAT_WORKSPACE_GEORGE`

## Runtime verification

OpenClaw runtime configuration (`~/.openclaw/openclaw.json`) explicitly registers:

- `grace` with workspace `/Users/jason/.openclaw/workspace-grace`
- `george` with workspace `/Users/jason/.openclaw/workspace-george`
- `coder` with workspace `/Users/jason/.openclaw/workspace-coder`

This confirms the child agents and the main assistant are configured as separate workspaces.

## Direct runtime proof

The following commands were run successfully:

```bash
openclaw agent --agent grace --message 'Reply with exactly: WORKSPACE_CHECK' --json
openclaw agent --agent george --message 'Reply with exactly: WORKSPACE_CHECK' --json
```

Both returned `WORKSPACE_CHECK` and also returned `systemPromptReport` metadata showing the actual runtime workspace.

### Grace runtime report showed

- `workspaceDir: /Users/jason/.openclaw/workspace-grace`
- injected workspace files included:
  - `workspace-grace/AGENTS.md`
  - `workspace-grace/SOUL.md`
  - `workspace-grace/TOOLS.md`
  - `workspace-grace/IDENTITY.md`
  - `workspace-grace/USER.md`
  - `workspace-grace/HEARTBEAT.md`
  - `workspace-grace/BOOTSTRAP.md`
  - `workspace-grace/MEMORY.md`

### George runtime report showed

- `workspaceDir: /Users/jason/.openclaw/workspace-george`
- injected workspace files included:
  - `workspace-george/AGENTS.md`
  - `workspace-george/SOUL.md`
  - `workspace-george/TOOLS.md`
  - `workspace-george/IDENTITY.md`
  - `workspace-george/USER.md`
  - `workspace-george/HEARTBEAT.md`
  - `workspace-george/BOOTSTRAP.md`
  - `workspace-george/MEMORY.md`

## What is isolated

The following are isolated per child agent:

- workspace root
- agent persona files
- child-specific `USER.md`
- child-specific `IDENTITY.md`
- child-specific `SOUL.md`
- child-specific `AGENTS.md`
- child-specific `TOOLS.md`
- child-specific `MEMORY.md`
- child-specific `memory/` notes
- OpenClaw agent id (`grace` / `george`)

## What is not fully isolated

Some lower-level runtime resources are still shared via symlink or shared installation layout.
Observed examples:

- `.env` points to a shared location
- `skills` points to a shared location
- `.learnings` points to a shared location

This means the system is **context-isolated**, but not fully physically sandbox-isolated.

## Risk assessment

### Low risk

- accidental loading of `workspace-coder` persona/memory during child chat
- direct reuse of Jason main assistant context in Kid Chat replies

### Moderate/shared-runtime considerations

- shared environment variables
- shared installed skills
- shared learning/logging support paths

These do not currently contradict the main architectural claim that Kid Chat uses separate child-agent workspaces.

## Important product conclusion

Kid Chat should be understood as:

- a custom app/UI layer for children and parents
- backed by OpenClaw child agents
- with each child agent using its own workspace context

It is **not** just a thin UI on top of the main `coder` workspace.

## Recommended maintenance rules

1. Keep child persona files only in `workspace-grace` and `workspace-george`.
2. Do not place child-facing persona instructions in `workspace-coder` and expect Kid Chat to use them.
3. Keep child `MEMORY.md` files backed up separately.
4. If a new child is added, create a dedicated workspace and agent id.
5. When auditing isolation in the future, verify all three layers:
   - Kid Chat code mapping (`lib/kids.ts`)
   - OpenClaw config mapping (`openclaw.json`)
   - runtime `systemPromptReport.workspaceDir`

## Audit checklist

Use this checklist when validating the setup again:

- [ ] `lib/kids.ts` points each child to the intended `agentId`
- [ ] `lib/openclaw.ts` still uses `openclaw agent --agent <agentId>`
- [ ] `openclaw.json` maps each child agent to its own workspace
- [ ] each child workspace contains `AGENTS.md`, `SOUL.md`, `USER.md`, `IDENTITY.md`, `TOOLS.md`, and `MEMORY.md`
- [ ] runtime test confirms `systemPromptReport.workspaceDir` matches the child workspace
- [ ] no unexpected fallback to `workspace-coder`
