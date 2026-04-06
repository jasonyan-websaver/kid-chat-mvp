# Backup and Recovery

This document explains what to back up, what can be rebuilt, and how to recover Kid Chat MVP after data loss, migration, or a bad deployment.

---

## 1. What matters most

If you only remember one thing, back up these first:

1. `.env.local`
2. `data/chat-store/`
3. `data/kid-settings.json`
4. `data/memory-throttle/`
5. each child workspace `MEMORY.md`

For the current setup, child memory is usually outside this repo:

```text
~/.openclaw/workspace-grace/MEMORY.md
~/.openclaw/workspace-george/MEMORY.md
```

If those files are missing from your backup, the app may still run, but you will lose the child agents' long-term memory.

---

## 2. Backup priority by importance

### Critical: cannot easily be recreated

#### `.env.local`
Contains:

- child PINs
- admin PIN
- runtime mode
- PM2 name
- optional custom workspace paths

If lost:

- access settings may break
- admin login may fail
- the app may start in the wrong mode
- memory path overrides may be lost

#### `data/chat-store/`
Contains:

- per-child chat indexes
- chat history JSON files
- conversation continuity inside this web app

If lost:

- chat history sidebar becomes empty or incomplete
- old conversations disappear

#### child workspace `MEMORY.md`
Contains:

- durable learned memory for each child agent
- long-term learned preferences and recurring facts

If lost:

- the agent may still work
- but it loses accumulated long-term memory

---

### Important: should be backed up

#### `data/kid-settings.json`
Contains UI overrides such as:

- display name
- emoji
- accent color
- title
- welcome text

If lost:

- the app falls back to defaults from code
- customizations disappear

#### `data/memory-throttle/`
Contains the memory extraction cooldown state.

If lost:

- the app still runs
- but memory extraction timing resets
- this may cause temporary over-extraction or under-extraction until state settles again

---

### Rebuildable: nice to keep, but not essential

#### `.next/`
Do not back this up.

Reason:

- build output can always be regenerated with `npm run build`
- dev cache is disposable

#### `node_modules/`
Do not back this up.

Reason:

- dependencies can be restored with `npm install`

#### PM2 process state
Optional.

Reason:

- PM2 can be recreated from `ecosystem.config.cjs`
- `pm2 save` is useful, but not your primary backup target

---

## 3. Recommended backup set

For this project, the recommended minimum backup set is:

```text
kid-chat-mvp/.env.local
kid-chat-mvp/data/chat-store/
kid-chat-mvp/data/kid-settings.json
kid-chat-mvp/data/memory-throttle/
~/.openclaw/workspace-grace/MEMORY.md
~/.openclaw/workspace-george/MEMORY.md
```

If you use custom workspace env vars such as:

```text
KID_CHAT_WORKSPACE_GRACE=/custom/path
KID_CHAT_WORKSPACE_GEORGE=/custom/path
```

then back up those custom locations instead of the default `~/.openclaw/workspace-*` paths.

---

## 4. Backup scripts

This repo now includes:

```text
scripts/backup.sh
scripts/restore.sh
```

### Create a backup

From the project root:

```bash
npm run backup
```

This will:

- create a timestamped folder under `backups/`
- copy `.env.local`
- copy `data/`
- copy each child's `MEMORY.md` when present
- create a `.tar.gz` archive by default

Example output location:

```text
backups/kid-chat-mvp-YYYYMMDD-HHMMSS/
backups/kid-chat-mvp-YYYYMMDD-HHMMSS.tar.gz
```

### Optional script settings

You can override behavior with env vars:

```bash
BACKUP_ROOT=/custom/backup/path npm run backup
ARCHIVE_MODE=none npm run backup
RETAIN_COUNT=30 npm run backup
```

Supported `ARCHIVE_MODE` values:

- `tar.gz` (default)
- `none`

`RETAIN_COUNT` controls how many timestamped backup folders and archives to keep.

- default: `14`
- `0` = disable pruning

### Restore from a backup folder

```bash
npm run restore -- ./backups/kid-chat-mvp-YYYYMMDD-HHMMSS
```

The restore script will:

- restore `.env.local` when present
- restore `data/`
- restore each child's `MEMORY.md` when present
- print the next rebuild/restart steps

## 4.1 Manual backup commands

If you prefer to do it manually, run from the parent directory that contains `kid-chat-mvp`.

### Create a timestamped backup folder

```bash
mkdir -p backups
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "backups/kid-chat-mvp-$STAMP"
```

### Copy app data

```bash
cp kid-chat-mvp/.env.local "backups/kid-chat-mvp-$STAMP/"
cp -R kid-chat-mvp/data "backups/kid-chat-mvp-$STAMP/"
```

### Copy child agent memory

```bash
mkdir -p "backups/kid-chat-mvp-$STAMP/openclaw-memory"
cp ~/.openclaw/workspace-grace/MEMORY.md "backups/kid-chat-mvp-$STAMP/openclaw-memory/grace-MEMORY.md"
cp ~/.openclaw/workspace-george/MEMORY.md "backups/kid-chat-mvp-$STAMP/openclaw-memory/george-MEMORY.md"
```

### Optional: compress it

```bash
tar -czf "backups/kid-chat-mvp-$STAMP.tar.gz" -C backups "kid-chat-mvp-$STAMP"
```

---

## 5. What to restore first

If you are recovering onto the same machine or a new machine, use this order:

1. restore project files
2. run `npm install`
3. restore `.env.local`
4. restore `data/`
5. restore child workspace `MEMORY.md`
6. run `npm run build`
7. start with PM2 or `npm run start:prod`
8. verify in admin self-check page

This order matters because:

- `.env.local` affects runtime mode and path resolution
- `data/` restores chat and profile state
- child `MEMORY.md` restores long-term agent memory

---

## 6. Recovery scenarios

### Scenario A: lost only the build output

Symptoms:

- app does not start after deploy
- `.next/` is missing or stale

Recovery:

```bash
npm install
npm run build
pm2 restart kid-chat-mvp
```

No data restore needed.

---

### Scenario B: lost only `node_modules/`

Recovery:

```bash
npm install
npm run build
pm2 restart kid-chat-mvp
```

No data restore needed.

---

### Scenario C: lost `data/chat-store/`

Symptoms:

- old chats missing
- sidebar history empty

Recovery:

- restore `data/chat-store/` from backup
- restart the app

If no backup exists, chat history is effectively gone.

---


### Scenario E: lost `data/kid-settings.json`

Symptoms:

- names, emoji, colors, titles, and welcome text revert to code defaults

Recovery:

- restore `data/kid-settings.json`
- refresh the app

If no backup exists, re-enter the custom values in admin.

---

### Scenario F: lost `data/memory-throttle/`

Symptoms:

- app still works
- memory extraction timing behaves like a fresh install

Recovery:

- optional: restore `data/memory-throttle/`
- otherwise let the app rebuild this state naturally

This is not usually a critical incident.

---

### Scenario G: lost child workspace `MEMORY.md`

Symptoms:

- child agents lose long-term learned memory
- short-term chat history may still exist in `data/chat-store/`

Recovery:

- restore each child's `MEMORY.md`
- verify workspace paths in admin runtime self-check

If no backup exists, long-term agent memory is gone and must be rebuilt gradually over time.

---

### Scenario H: moved to a new machine

Recovery checklist:

- [ ] install Node.js
- [ ] install OpenClaw if using real mode
- [ ] copy repo
- [ ] restore `.env.local`
- [ ] restore `data/`
- [ ] restore child workspace `MEMORY.md`
- [ ] verify workspace paths still match `.env.local`
- [ ] run `npm install`
- [ ] run `npm run build`
- [ ] start app
- [ ] open admin and verify runtime self-check
- [ ] run per-child agent connectivity test

If home directory paths changed, update env vars such as:

```text
KID_CHAT_WORKSPACE_GRACE=...
KID_CHAT_WORKSPACE_GEORGE=...
```

---

## 7. Restore commands example

Assume you have a backup folder like:

```text
backups/kid-chat-mvp-20260316-103000/
```

### Restore app data

```bash
cp backups/kid-chat-mvp-20260316-103000/.env.local kid-chat-mvp/.env.local
rm -rf kid-chat-mvp/data
cp -R backups/kid-chat-mvp-20260316-103000/data kid-chat-mvp/data
```

### Restore child memory

```bash
cp backups/kid-chat-mvp-20260316-103000/openclaw-memory/grace-MEMORY.md ~/.openclaw/workspace-grace/MEMORY.md
cp backups/kid-chat-mvp-20260316-103000/openclaw-memory/george-MEMORY.md ~/.openclaw/workspace-george/MEMORY.md
```

### Rebuild and restart

```bash
cd kid-chat-mvp
npm install
npm run build
pm2 restart kid-chat-mvp
```

---

## 8. Post-recovery verification

After restore, verify these in order:

### App and auth

- [ ] home page loads
- [ ] child PIN login works
- [ ] admin PIN login works

### Child data

- [ ] chat history appears in sidebar
- [ ] opening an old chat shows the expected messages
- [ ] creating a new chat still works

### Admin data

- [ ] profile content is present
- [ ] memory content is present
- [ ] text settings are correct

### Runtime health

- [ ] runtime self-check shows expected paths
- [ ] no unexpected missing file warnings
- [ ] per-child agent connectivity test passes in real mode

---

## 9. Suggested backup frequency

For family-scale usage, a practical baseline is:

- daily backup of `.env.local` and `data/`
- daily or every-few-days backup of child `MEMORY.md`
- immediate backup before major deployment or refactor
- immediate backup before moving to another host

If usage becomes frequent, consider:

- hourly or twice-daily `data/chat-store/` backups
- daily compressed archive rotation

### Example scheduled backup with cron

Run every day at 03:15:

```cron
15 3 * * * cd /path/to/kid-chat-mvp && /bin/bash -lc 'npm run backup >> backups/backup.log 2>&1'
```

Run twice a day and keep 30 backup sets:

```cron
0 3,15 * * * cd /path/to/kid-chat-mvp && /bin/bash -lc 'RETAIN_COUNT=30 npm run backup >> backups/backup.log 2>&1'
```

Notes:

- use absolute paths in cron
- use `/bin/bash -lc` so the shell behaves more like your normal login shell
- write logs to `backups/backup.log` or another known path
- test `npm run backup` manually before scheduling

---

## 10. Practical recommendation

If you want the simplest reliable habit:

- back up `.env.local`
- back up `data/`
- back up each child's `MEMORY.md`

That covers almost everything you actually care about.

If you skip the child `MEMORY.md` files, the app UI may look fine after recovery, but the agents will have forgotten the durable things they learned.
