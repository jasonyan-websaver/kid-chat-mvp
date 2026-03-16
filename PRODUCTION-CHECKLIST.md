# Production Checklist

Use this checklist before treating Kid Chat MVP as a stable family-facing service.

---

## 1. Environment and secrets

### Required

- [ ] `.env.local` exists on the target machine
- [ ] `KID_CHAT_PIN_GRACE` is set
- [ ] `KID_CHAT_PIN_GEORGE` is set
- [ ] `KID_CHAT_ADMIN_PIN` is set
- [ ] `OPENCLAW_USE_MOCK` is set correctly for the environment
- [ ] `KID_CHAT_PM2_NAME` matches the PM2 process name you actually use

### Strongly recommended

- [ ] No PIN is left as a demo value such as `1111`, `2222`, or `9999`
- [ ] Admin PIN is different from every child PIN
- [ ] Every PIN is at least 4 digits and contains digits only
- [ ] `.env.local` is excluded from backups or logs that should not contain secrets

### Real-mode only

- [ ] `OPENCLAW_USE_MOCK=false`
- [ ] OpenClaw CLI is installed on the same host
- [ ] The target child agents exist and respond normally

Suggested quick checks:

```bash
openclaw agent --agent grace --message "hello" --json
openclaw agent --agent george --message "hello" --json
```

---

## 2. Child workspace and file paths

The app relies on per-child profile files and per-child OpenClaw workspaces.

### Profiles

- [ ] `data/profiles/grace.json` exists
- [ ] `data/profiles/george.json` exists
- [ ] Each profile JSON is valid

### Agent memory paths

By default, memory files resolve to:

```text
~/.openclaw/workspace-<kidId>/MEMORY.md
```

Or you can override with env vars like:

```text
KID_CHAT_WORKSPACE_GRACE=/custom/path
KID_CHAT_WORKSPACE_GEORGE=/custom/path
```

Checklist:

- [ ] Grace workspace exists
- [ ] George workspace exists
- [ ] Each workspace contains or can create `MEMORY.md`
- [ ] The production process user has read/write access to those files

Suggested quick checks:

```bash
ls -la ~/.openclaw/workspace-grace/MEMORY.md
ls -la ~/.openclaw/workspace-george/MEMORY.md
```

If using custom workspace env vars, verify those exact paths instead.

---

## 3. Build and process management

### Build

- [ ] `npm install` completes successfully
- [ ] `npm run build` completes successfully

### PM2

- [ ] `pm2` is installed on the host
- [ ] `ecosystem.config.cjs` is present
- [ ] PM2 process name matches `KID_CHAT_PM2_NAME`
- [ ] App starts cleanly from PM2
- [ ] App survives `pm2 restart`
- [ ] PM2 startup persistence is configured if needed on reboot

Recommended commands:

```bash
npm install
npm run build
pm2 start ecosystem.config.cjs
pm2 status
pm2 logs kid-chat-mvp
pm2 save
```

If you want PM2 to auto-start on reboot, also run:

```bash
pm2 startup
pm2 save
```

---

## 4. Networking and reverse proxy

### Local/LAN only

- [ ] Port `3000` is reachable only where you intend
- [ ] You understand who can access it on your local network

### Public or VPS deployment

- [ ] The app is behind Nginx or Caddy
- [ ] HTTPS is enabled
- [ ] Raw Node port is not unnecessarily exposed to the internet
- [ ] Reverse proxy forwards requests correctly to `0.0.0.0:3000`
- [ ] If using a domain, DNS is set correctly
- [ ] `REVERSE-PROXY-EXAMPLES.md` has been reviewed and adapted to the actual host/domain

### Security notes

- [ ] Do not rely on child/admin PINs as your only internet-facing protection if the app is public
- [ ] Consider IP restriction, VPN, Tailscale, or another outer access layer if this is family-only

---

## 5. Functional smoke test

Run this after production start.

### Child flow

- [ ] Home page loads
- [ ] Grace card opens correctly
- [ ] George card opens correctly
- [ ] Wrong PIN is rejected
- [ ] Correct PIN is accepted
- [ ] Existing history loads
- [ ] New chat can be created
- [ ] Sending a message works
- [ ] Waiting indicator appears while a reply is pending
- [ ] Chat auto-scrolls to the bottom and keeps the composer visible
- [ ] Left sidebar preview updates with the latest message summary
- [ ] Refreshing the page keeps the conversation history

### Admin flow

- [ ] Admin PIN page loads
- [ ] Wrong admin PIN is rejected
- [ ] Correct admin PIN is accepted
- [ ] Agent memory can be read
- [ ] Agent memory can be saved
- [ ] Profile JSON can be read
- [ ] Profile JSON can be saved
- [ ] PIN settings can be saved
- [ ] Restart action works if using PM2-managed production

---

## 6. Real-mode integration checks

Only needed when `OPENCLAW_USE_MOCK=false`.

- [ ] Sending a child message returns a real agent response
- [ ] The response is stored in `data/chat-store/<kidId>/...`
- [ ] New chats appear in `data/chat-store/<kidId>/index.json`
- [ ] Long-term memory extraction does not crash the app if OpenClaw is slow or unavailable
- [ ] Memory extraction writes only when expected

Suggested quick checks:

```bash
find data/chat-store -maxdepth 3 -type f | sort
```

And inspect the saved chat index/files.

---

## 7. File permissions

The production process user must be able to read/write:

- [ ] `data/chat-store/`
- [ ] `data/profiles/`
- [ ] `data/memory-throttle/`
- [ ] each child workspace `MEMORY.md`

Suggested quick checks:

```bash
ls -la data
ls -la data/chat-store
ls -la data/profiles
ls -la data/memory-throttle
```

If production runs under a different user than your shell, verify permissions for that user specifically.

---

## 8. Logging and recovery

- [ ] PM2 logs are viewable
- [ ] You know how to restart the app manually
- [ ] You know how to stop the app manually
- [ ] You know how to rebuild after code changes
- [ ] You know where chat data is stored for backup or restore

Recommended operational commands:

```bash
pm2 status
pm2 logs kid-chat-mvp
pm2 restart kid-chat-mvp
pm2 stop kid-chat-mvp
pm2 delete kid-chat-mvp
npm run build
```

---

## 9. Known current MVP limitations

Before calling it production-ready, remember the current design still has these constraints:

- only built-in kids are supported unless code is extended
- there is no extra moderation/safety filtering layer yet
- profile editing is still raw JSON text
- memory extraction depends on external OpenClaw agent behavior
- the app is family-scale, not multi-tenant SaaS architecture

Checklist:

- [ ] These limitations are acceptable for the intended use
- [ ] Everyone operating the app understands it is a controlled family deployment, not a hardened public platform

---

## 10. Final go-live decision

You are probably ready to use production if all of these are true:

- [ ] build succeeds
- [ ] PM2 process is stable
- [ ] child flows work end-to-end
- [ ] admin flows work end-to-end
- [ ] real agent calls work if real mode is enabled
- [ ] file paths and permissions are correct
- [ ] PINs are not default/demo values
- [ ] deployment exposure matches your risk tolerance

If any of the above is still uncertain, fix that first before treating the service as reliable.
