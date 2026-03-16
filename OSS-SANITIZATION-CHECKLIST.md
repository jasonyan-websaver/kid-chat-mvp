# OSS Sanitization Checklist

Use this checklist before publishing Kid Chat MVP as an open-source repository.

## 1. Secrets and env files

- [ ] `.env.local` is not committed
- [ ] no real PIN values are present in tracked files
- [ ] `.env.local.example` contains only safe demo values
- [ ] no real API keys, tokens, or cookies appear anywhere in the repo

## 2. Personal machine / server fingerprints

- [ ] no real absolute local paths remain (for example `/Users/<name>/...`)
- [ ] no real server hostnames remain
- [ ] no real private LAN IPs remain unless intentionally documented as placeholders
- [ ] no personal usernames remain in docs or scripts

## 3. OpenClaw-specific deployment details

- [ ] OpenClaw integration is described generically, not as a private server layout
- [ ] child workspace paths use placeholders like `~/.openclaw/workspace-<kidId>/MEMORY.md`
- [ ] any custom production paths are replaced with `/path/to/...`
- [ ] examples do not expose your actual machine naming conventions unless intended

## 4. Documentation review

Review these files carefully:

- [ ] `README.md`
- [ ] `CHANGELOG.md`
- [ ] `RELEASE-NOTES-v0.1.0.md`
- [ ] `PRODUCTION-CHECKLIST.md`
- [ ] `BACKUP-AND-RECOVERY.md`
- [ ] `REVERSE-PROXY-EXAMPLES.md`
- [ ] `data/profiles/README.md`

## 5. Data and sample content

- [ ] `data/chat-store/` does not contain private real conversations
- [ ] `data/profiles/*.json` do not contain private family details you do not want public
- [ ] `data/kid-settings.json` does not expose private names/themes you want to keep private
- [ ] sample content is intentionally publishable

## 6. Product positioning

- [ ] README describes the project as a generic reusable project, not your private deployment
- [ ] examples use placeholders where appropriate
- [ ] any internal-only assumptions are clearly marked as MVP or example behavior

## 7. Final pre-publish check

Recommended quick scan:

```bash
rg -n "/Users/|/home/|workspace-coder|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|@|token|secret|cookie|KID_CHAT_PIN_|ADMIN_PIN" . --glob '!node_modules'
```

Then manually review matches before pushing.

## 8. Optional release hygiene

- [ ] add a LICENSE file
- [ ] add a public-facing CONTRIBUTING.md if needed
- [ ] confirm package/project name is what you want publicly
- [ ] confirm screenshots do not expose private data

If all boxes are checked, the repo is in much better shape for public release.
