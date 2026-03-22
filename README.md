# Kid Chat MVP

**Version:** v0.2.0  
**License:** MIT

Kid Chat MVP is an open-source, family-oriented chat app designed for children and parents.

Each child gets a dedicated PIN-protected chat space, separate history, and an optional OpenClaw-powered agent. Parents get a protected admin interface for profile management, memory editing, runtime checks, and chat history review.

This project is built as a practical MVP: simple enough to run locally, structured enough to deploy with PM2, back up safely, and extend into a richer parent/child AI product.

Installation note:

- Kid Chat MVP can live in any directory
- it does **not** need to be installed inside an OpenClaw repo or OpenClaw workspace
- for real mode, the host machine only needs access to the `openclaw` CLI and the configured child workspace paths

## Highlights

- Separate child entry points with PIN protection
- Independent chat history per child
- Parent admin for profiles, memory, runtime checks, image storage visibility, and cache cleanup
- Parent-only chat history review with search, highlighting, and time filters
- Raw JSON + structured form profile editing
- Mock mode and real OpenClaw mode
- Multimodal groundwork for image understanding / generation / edit flows
- Upload safety guardrails for image type, size, dimensions, pixel count, and per-kid upload throttling
- PM2, backup/recovery, and reverse proxy docs included

## Project Notes

- `data/chat-store/` is intentionally ignored so real chat transcripts are not published
- See also:
  - `CHANGELOG.md`
  - `RELEASE-NOTES-v0.2.0.md`
  - `RELEASE-NOTES-v0.1.0.md`
  - `OSS-SANITIZATION-CHECKLIST.md`

---

## Language Policy

- The user-facing app interface may use **Chinese or French**.
- Development documentation should use **English or Chinese**.
- Do **not** write development documentation in French.
- In the current family setup, the children are **French-first and Chinese-second**.

---

## Features

### Child-facing

- Separate entry cards for each child
- Kid-specific PIN gate
- Chat history sidebar
- Create new chats
- Child-specific colors, emoji, and welcome text
- Light mode / dark mode
- Kid-friendly PIN keypad UI

### Parent-facing

- Parent PIN gate for admin pages
- Read each child's saved chat history in a parent-only admin view
- Edit each child's `profile.json` in raw JSON or optional structured form mode, both backed by the same normalized schema; raw JSON can optionally preserve advanced extra fields
- Edit each child's agent `MEMORY.md`
- Runtime self-check panel for env, profile, workspace, memory path visibility, image backend visibility, and per-agent connectivity testing
- Child-specific controls for TTS, image understanding, image generation, and image edit readiness
- Child-facing capability preview so parents can see which buttons / modes the child will actually see
- Local image storage visibility with per-child cache cleanup controls
- Recent smoke-test result visibility for image backends
- Save changes directly in the browser
- Light mode / dark mode

### Runtime behavior

- Mock mode for UI/demo work
- Real OpenClaw mode for live agents
- Local chat persistence per child
- Profile injection into prompts
- Automatic long-term memory extraction with throttling
- Uploaded image understanding in real mode
- Image-generation backend selection groundwork
- Browser TTS playback and per-child voice preferences
- Image upload guardrails:
  - accepted types: PNG / JPG / WEBP / GIF
  - per-file size limit: 8MB
  - maximum dimensions: 4096 × 4096
  - maximum total pixels: 12MP
  - per-kid upload throttling between image uploads
- Local generated / uploaded image cache under `public/chat-media/`

---

## Routes

### Pages

- `/` — home page
- `/kid/grace` — Grace chat page
- `/kid/george` — George chat page
- `/enter-pin` — child PIN page
- `/enter-admin-pin` — parent PIN page
- `/admin/memory` — parent admin page

### API

- `POST /api/chat` — send a message
- `POST /api/chats` — create a new chat
- `GET /api/memory?kidId=...` — read agent memory
- `POST /api/memory` — save agent memory
- `GET /api/profile?kidId=...` — read profile JSON
- `POST /api/profile` — save profile JSON
- `GET /api/media-storage` — read local image-cache usage summary
- `POST /api/media-storage` — clear one child's local image cache
- `POST /api/verify-pin` — verify child PIN
- `POST /api/verify-admin-pin` — verify parent PIN
- `POST /api/clear-pin` — clear child PIN cookies

---

## Quick Start

### 1. Install

```bash
cd kid-chat-mvp
npm install
```

### 2. Create local env file

```bash
cp .env.local.example .env.local
```

Example:

```bash
KID_CHAT_PIN_GRACE=1111
KID_CHAT_PIN_GEORGE=2222
KID_CHAT_ADMIN_PIN=9999
OPENCLAW_USE_MOCK=true
```

### 3. Start dev server

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

---

## Build and Run

```bash
npm run build
npm run start
```

For a production-style local/LAN run:

```bash
npm run build
npm run start:prod
```

Available scripts:

```bash
npm run dev
npm run build
npm run start
npm run start:prod
npm run backup
npm run restore -- ./backups/kid-chat-mvp-YYYYMMDD-HHMMSS
npm run lint
npm run typecheck
```

---

## Configuration

Create `.env.local` in the project root.

### Environment variables

#### `KID_CHAT_PIN_GRACE`
Grace's PIN.

#### `KID_CHAT_PIN_GEORGE`
George's PIN.

#### `KID_CHAT_ADMIN_PIN`
Parent admin PIN.

Important:

- this must be set explicitly in `.env.local`
- there is no production-safe fallback in code

#### `OPENCLAW_USE_MOCK`
Controls runtime mode.

- `true` → mock/demo mode
- `false` → real OpenClaw mode

Important:

`lib/openclaw.ts` checks:

```ts
process.env.OPENCLAW_USE_MOCK === 'true'
```

So only the literal string `true` enables mock mode.

#### `KID_CHAT_IMAGE_PROVIDER`
Controls which image-generation backend Kid Chat uses.

Supported values:

- `media-agent` → ask a dedicated media agent to choose and run the image workflow
- `gemini-direct` → call Gemini image generation directly via API
- `inference-sh` → use `infsh` / inference.sh backend

Default:

- `media-agent`

#### `KID_CHAT_MEDIA_AGENT_ID`
Which agent handles image generation when `KID_CHAT_IMAGE_PROVIDER=media-agent`.

Default:

- `media`

#### `KID_CHAT_IMAGE_MODEL`
Optional Gemini image model override for `gemini-direct`.

Default:

- `gemini-2.0-flash-preview-image-generation`

#### `KID_CHAT_GEMINI_API_KEY`
API key for Gemini direct image generation.

Fallback lookup order:

- `KID_CHAT_GEMINI_API_KEY`
- `GEMINI_API_KEY`
- `GOOGLE_API_KEY`

### Image upload policy

Current product guardrails:

- accepted formats: PNG, JPG, WEBP, GIF
- per-file size limit: 8MB
- maximum dimensions: 4096 × 4096
- maximum total pixels: 12MP
- image uploads are throttled per child to reduce accidental rapid-fire submissions

These checks are enforced in both the child-facing upload flow and the server-side upload handling.

---

## How It Works

### 1. Child access flow

1. Open `/`
2. Click the child's card
3. Enter the child's 4-digit PIN
4. Enter that child's chat page
5. Send messages, open old chats, or create a new chat

### 2. Parent admin flow

1. Open `/admin/memory`
2. Enter the parent PIN
3. Select a child
4. Switch between:
   - `Agent Memory`
   - `Parent Profile`
5. Edit and save

---

## PIN and Access Control

Route protection is handled by `middleware.ts`.

### Public paths

These are not PIN-protected:

- `/`
- `/enter-pin`
- `/enter-admin-pin`
- `/api/verify-pin`
- `/api/verify-admin-pin`
- `/api/clear-pin`
- `/_next/*`
- `/favicon*`
- `/images/*`

### Child routes

For `/kid/:kidId`:

- middleware checks the kid-specific cookie
- if missing or invalid, user is redirected to `/enter-pin`

### Admin routes

For `/admin/*`:

- middleware checks the admin cookie
- if missing or invalid, user is redirected to `/enter-admin-pin`

### Cookie settings

Successful PIN verification sets cookies with:

- `httpOnly: true`
- `sameSite: 'lax'`
- `secure: process.env.NODE_ENV === 'production'`
- `path: '/'`

---

## Mock Mode vs Real Mode

### Mock mode

Use this for:

- UI development
- demo flows
- testing without OpenClaw

Behavior:

- pages render normally
- sending a message returns a mock reply
- no real agent call is made

### Real mode

Use this for:

- live child agents
- persistent local chat storage
- profile-aware prompting
- automatic memory extraction

Behavior:

- each child maps to a fixed `agentId`
- recent conversation is packed into a prompt
- child profile is injected
- `openclaw agent` is called
- messages are stored locally
- memory extraction may run asynchronously

The real agent call is:

```bash
openclaw agent --agent <agentId> --message <prompt> --json
```

---

## Child Mapping

Defined in:

```text
lib/kids.ts
```

Current built-in children:

### Grace

- `id`: `grace`
- `agentId`: `grace`
- title: `Stories and Language Learning Assistant`
- color: `#ec4899`
- emoji: `🌸`

### George

- `id`: `george`
- `agentId`: `george`
- title: `Science and Question Assistant`
- color: `#3b82f6`
- emoji: `🚀`

If you add more children, you will typically need to update:

- `lib/kids.ts`
- `lib/pin.ts`
- `middleware.ts`
- `data/profiles/<kid>.json`
- related UI content

---

## Customization

This section covers the most common project customizations: adding a child, changing colors, editing welcome text, and switching the linked agent.

### Add a new child

The main child registry lives in:

```text
lib/kids.ts
```

Each child entry looks like this:

```ts
{
  id: 'grace',
  name: 'Grace',
  title: 'Stories and Language Learning Assistant',
  agentId: 'grace',
  accentColor: '#ec4899',
  emoji: '🌸',
  welcome: 'Hi Grace! I can chat with you, tell stories, and talk with you in Chinese or French.',
}
```

To add a new child:

1. Add a new object to `lib/kids.ts`
2. Give it a unique `id`
3. Set the display `name`
4. Set the `title`, `emoji`, `accentColor`, and `welcome`
5. Set the correct `agentId`
6. Add a matching profile file in `data/profiles/<kidId>.json`
7. Add a PIN rule for that child in `lib/pin.ts`
8. Update any hard-coded child lists if needed

Important:

- the `id` becomes part of the route: `/kid/<id>`
- the `id` is also used for PIN cookies and chat storage folders
- the `agentId` must match a real OpenClaw agent available on the machine

### Change a child's color

The main chat and card color comes from `accentColor` in `lib/kids.ts`.

Example:

```ts
accentColor: '#ec4899'
```

This color is reused in multiple places:

- home page card badge
- child entry button
- chat header accents
- active chat highlight
- submit button
- PIN page accent color

If you want to change a child's color, edit only the `accentColor` value in `lib/kids.ts`.

### Change a child's welcome text

The default welcome text is also defined in `lib/kids.ts`:

```ts
welcome: 'Hi Grace! I can chat with you, tell stories, and talk with you in Chinese or French.'
```

This text is used when:

- a new chat is created
- the default welcome conversation is initialized
- the top of the chat page shows the current child intro

If you change the welcome text, only new chats will automatically use the new value. Existing saved chat files may still contain the old welcome message.

### Change the linked `agentId`

The child-to-agent mapping is defined in `lib/kids.ts`:

```ts
agentId: 'grace'
```

To switch a child to a different OpenClaw agent, change that field.

Example:

```ts
agentId: 'grace-v2'
```

Before doing this, verify that the new agent actually works on the host machine:

```bash
openclaw agent --agent grace-v2 --message "hello" --json
```

If the command fails, the web app will also fail in real mode when trying to send messages.

> Important: if the linked agent is configured to use `sandbox`, Docker must be running on the host machine. Otherwise the agent can fail before replying with errors like `Failed to inspect sandbox image` or `Cannot connect to the Docker daemon`.

### Add the child's profile file

Each child should have a matching profile file in:

```text
data/profiles/
```

Example:

```text
data/profiles/emma.json
```

A minimal starting profile could look like this:

```json
{
  "name": "Emma",
  "ageGroup": "early-elementary",
  "languages": ["French", "Chinese"],
  "likes": ["animals", "drawing"],
  "learningGoals": ["confidence in French", "maintain comfort with Chinese", "curiosity"],
  "tone": "warm and encouraging",
  "responseStyle": ["short answers", "gentle guidance"],
  "avoid": ["scary details"],
  "notes": ["likes soft bedtime stories"]
}
```

### Add a PIN for the new child

Child PIN rules are defined in:

```text
lib/pin.ts
```

For a new child, add:

- a normalized cookie name path if needed
- a case for the child's expected PIN
- an environment variable such as `KID_CHAT_PIN_EMMA`

Then set it in `.env.local`:

```bash
KID_CHAT_PIN_EMMA=3333
```

### Check for other hard-coded child lists

A few parts of the project still assume two built-in children.

Before considering the feature complete, review files such as:

- `app/api/clear-pin/route.ts`
- `lib/memory-admin.ts`
- `lib/profile-admin.ts`
- `lib/agent-memory.ts`
- admin UI components that currently present Grace / George directly

These may need to be generalized if you want truly dynamic multi-child support.

### Recommended checklist when adding a child

- add the child to `lib/kids.ts`
- create `data/profiles/<kidId>.json`
- add `KID_CHAT_PIN_<NAME>` to `.env.local`
- update `lib/pin.ts`
- confirm the linked `agentId` works via CLI
- test `/kid/<kidId>` access flow
- test new chat creation
- test admin editing behavior if the admin UI has been expanded to include the new child

### Example: add a new child named Emma

This example shows the typical changes needed to add a third child.

#### 1. Add Emma to `lib/kids.ts`

```ts
export const kids: KidProfile[] = [
  {
    id: 'grace',
    name: 'Grace',
    title: 'Stories and Language Learning Assistant',
    agentId: 'grace',
    accentColor: '#ec4899',
    emoji: '🌸',
    welcome: 'Hi Grace! I can chat with you, tell stories, and talk with you in Chinese or French.',
  },
  {
    id: 'george',
    name: 'George',
    title: 'Science and Question Assistant',
    agentId: 'george',
    accentColor: '#3b82f6',
    emoji: '🚀',
    welcome: 'Hi George! We can explore science questions together and talk in Chinese or French.',
  },
  {
    id: 'emma',
    name: 'Emma',
    title: 'Reading and Creativity Assistant',
    agentId: 'emma',
    accentColor: '#8b5cf6',
    emoji: '🦄',
    welcome: 'Hi Emma! I can read with you, make up stories, and help with creative activities.',
  },
];
```

#### 2. Add Emma's PIN environment variable

In `.env.local`:

```bash
KID_CHAT_PIN_EMMA=3333
```

#### 3. Update `lib/pin.ts`

Add a case for Emma's PIN.

Example pattern:

```ts
export function getExpectedPinForKid(kidId?: string | null) {
  const normalized = normalizeKidId(kidId);

  if (normalized === 'grace') {
    return process.env.KID_CHAT_PIN_GRACE?.trim() || '1111';
  }

  if (normalized === 'george') {
    return process.env.KID_CHAT_PIN_GEORGE?.trim() || '2222';
  }

  if (normalized === 'emma') {
    return process.env.KID_CHAT_PIN_EMMA?.trim() || '3333';
  }

  return null;
}
```

#### 4. Create `data/profiles/emma.json`

```json
{
  "name": "Emma",
  "ageGroup": "early-elementary",
  "languages": ["French", "Chinese"],
  "likes": ["drawing", "unicorns", "story time"],
  "learningGoals": ["reading confidence in French", "creative thinking", "maintain comfort with Chinese"],
  "tone": "warm and playful",
  "responseStyle": ["short answers", "encouraging guidance"],
  "avoid": ["scary details", "overly advanced explanations"],
  "notes": ["enjoys imaginative stories and art activities"]
}
```

#### 5. Verify Emma's agent works

Before using real mode, test the linked agent directly:

```bash
openclaw agent --agent emma --message "hello" --json
```

If Emma's agent uses `sandbox`, make sure Docker is running first. Otherwise the real-mode image understanding / agent call can fail before any model reply is produced.

#### 6. Review hard-coded child lists

This project still contains a few places that directly reference Grace and George.

If Emma should also appear everywhere, review and update these areas:

- `app/api/clear-pin/route.ts`
- `lib/memory-admin.ts`
- `lib/profile-admin.ts`
- `lib/agent-memory.ts`
- admin UI components that currently render only Grace / George options

#### 7. Test the full Emma flow

After updating the code:

1. restart the dev server
2. open `/`
3. confirm Emma appears on the home page
4. open `/kid/emma`
5. enter Emma's PIN
6. create a new chat
7. send a test message
8. confirm chat history is saved under `data/chat-store/emma/`
9. confirm profile loading works
10. confirm real mode works if `agentId: 'emma'` is enabled

---

## Data Storage

### Chat history

Stored locally in:

```text
data/chat-store/
```

Typical structure:

```text
data/chat-store/
  grace/
    index.json
    welcome.json
    chat-xxxx.json
  george/
    index.json
    welcome.json
    chat-xxxx.json
```

- `index.json` stores the chat list
- `welcome.json` stores the default chat
- `chat-*.json` stores message history

### Parent-controlled profiles

Stored in:

```text
data/profiles/
```

Files:

- `data/profiles/grace.json`
- `data/profiles/george.json`

These are the stable, parent-managed configuration layer.

### Agent memory

Stored outside this repo in child workspaces, typically using a pattern like:

```text
~/.openclaw/workspace-<kidId>/MEMORY.md
```

Or a custom path configured through env vars such as:

```text
KID_CHAT_WORKSPACE_GRACE=/custom/path
KID_CHAT_WORKSPACE_GEORGE=/custom/path
```

This is the agent-managed long-term memory layer.

### Memory throttle state

Stored in:

```text
data/memory-throttle/
```

---

## Profile vs Memory

These two layers are intentionally different.

### `profile.json`
Parent-controlled stable settings.

Use it for things like:

- age group
- languages
- interests
- learning goals
- preferred tone
- things to avoid

### `MEMORY.md`
Agent-grown long-term memory.

Use it for things the assistant learns over time, such as:

- recurring interests
- stable preferences
- durable conversational patterns

In short:

- `profile.json` = configured by parent
- `MEMORY.md` = accumulated by agent

---

## Profile JSON Shape

Supported fields in `data/profiles/*.json`:

```json
{
  "name": "Grace",
  "ageGroup": "early-elementary",
  "languages": ["French", "Chinese"],
  "likes": ["princess stories", "animals"],
  "learningGoals": ["confidence in French", "maintain comfort with Chinese", "curiosity"],
  "tone": "warm and encouraging",
  "responseStyle": ["short answers", "gentle guidance"],
  "avoid": ["scary details", "overly complex explanations"],
  "notes": ["loves pink themes", "enjoys bedtime stories"]
}
```

These fields are formatted and injected into prompts by `lib/profiles.ts`.

---

## Prompt Construction

In real mode, user text is not sent directly to the agent as-is.

The app constructs a fuller prompt containing:

- child identity
- child-friendly response instructions
- long-term profile
- up to 8 recent messages
- the latest child message

This improves:

- consistency
- child-appropriate tone
- cross-thread continuity

---

## Automatic Memory Extraction

After a chat reply in real mode, the app may asynchronously run long-term memory extraction.

Purpose:

- identify durable information worth keeping
- avoid saving one-off details
- avoid duplicate memory entries

Typical candidates:

- recurring interests
- stable learning preferences
- preferred explanation style
- durable tone preferences

Non-candidates:

- temporary moods
- one-off requests
- details useful only in a single chat

### Throttling

Memory extraction runs only when both conditions are met:

- at least **4 messages** since the last extraction
- at least **20 minutes** since the last extraction

Relevant files:

- `lib/agent-memory.ts`
- `lib/memory-throttle.ts`

---

## Theme / Dark Mode

Dark mode is supported on:

- home page
- child chat page
- child PIN page
- parent PIN page
- parent admin page

Theme state is stored in `localStorage` using:

```text
kid-chat-theme
```

The toggle applies or removes the `dark` class on `document.documentElement`.

Relevant files:

- `components/theme-toggle.tsx`
- `app/globals.css`

---

## API Examples

### Send a message

```bash
curl -X POST http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "kidId":"grace",
    "chatId":"welcome",
    "message":"Tell me a story about a bunny."
  }'
```

### Create a chat

```bash
curl -X POST http://localhost:3000/api/chats \
  -H 'Content-Type: application/json' \
  -d '{"kidId":"grace"}'
```

### Verify child PIN

```bash
curl -X POST http://localhost:3000/api/verify-pin \
  -H 'Content-Type: application/json' \
  -d '{
    "kidId":"grace",
    "pin":"1111",
    "next":"/kid/grace"
  }'
```

### Verify parent PIN

```bash
curl -X POST http://localhost:3000/api/verify-admin-pin \
  -H 'Content-Type: application/json' \
  -d '{
    "pin":"9999",
    "next":"/admin/memory"
  }'
```

### Clear all child PIN cookies

```bash
curl -X POST http://localhost:3000/api/clear-pin
```

### Clear one child's PIN cookie

```bash
curl -X POST http://localhost:3000/api/clear-pin \
  -H 'Content-Type: application/json' \
  -d '{"kidId":"grace"}'
```

---

## Project Structure

```text
kid-chat-mvp/
  app/
    admin/
      memory/page.tsx
    api/
      chat/route.ts
      chats/route.ts
      clear-pin/route.ts
      memory/route.ts
      profile/route.ts
      verify-admin-pin/route.ts
      verify-pin/route.ts
    enter-admin-pin/page.tsx
    enter-pin/page.tsx
    globals.css
    layout.tsx
    page.tsx
    kid/[kidId]/page.tsx

  components/
    admin-panel.tsx
    admin-pin-gate.tsx
    chat-shell.tsx
    memory-admin.tsx
    pin-gate.tsx
    theme-toggle.tsx

  data/
    chat-store/
    memory-throttle/
    profiles/

  lib/
    admin-pin.ts
    agent-memory.ts
    kids.ts
    memory-admin.ts
    memory-throttle.ts
    mock-data.ts
    openclaw.ts
    pin.ts
    profile-admin.ts
    profiles.ts
    types.ts
    utils.ts

  middleware.ts
  .env.local.example
  package.json
  README.md
```

Note: `components/memory-admin.tsx` is an older admin component retained in the repo, while the current admin route uses `components/admin-panel.tsx`.

---

## Current Limitations

This is still an MVP. Current limitations include:

- only two built-in children
- child mapping is hard-coded in several places
- child definitions are still not fully dynamic everywhere
- no voice input yet
- no moderation / safety filtering layer yet
- no multi-family account model
- no admin diff / version rollback
- image editing remains an early / limited workflow compared with the text chat path

---

## Suggested Next Steps

Useful next improvements:

- add child management in admin
- move child mapping to config instead of code
- add safety filtering
- add voice input
- add quick prompt buttons
- improve image-edit UX beyond the current groundwork-oriented flow
- add schema-driven profile editor improvements
- add memory diff / history
- add PIN/session expiry controls

---

## Deployment

This MVP can be deployed in a few simple ways depending on where it will be used.

Before going live, review:

```text
PRODUCTION-CHECKLIST.md
BACKUP-AND-RECOVERY.md
REVERSE-PROXY-EXAMPLES.md
```

For ongoing operations, you can also schedule:

```bash
npm run backup
```

### 1. Local machine only

Best for:

- personal testing
- development
- one-computer family usage

Steps:

1. Install dependencies
2. Create `.env.local`
3. Run:

```bash
npm run build
npm run start
```

4. Open:

```text
http://localhost:3000
```

Notes:

- easiest setup
- works well when OpenClaw is installed on the same machine
- best option for initial validation

### 2. LAN / home network deployment

Best for:

- using the app from phones or tablets on the same Wi-Fi
- family use inside the house

Typical approach:

```bash
npm run build
npm run start -- --hostname 0.0.0.0 --port 3000
```

Then access it from another device with:

```text
http://<your-local-ip>:3000
```

Example:

```text
http://192.168.x.x:3000
```

Recommendations:

- keep this behind your home network only
- use strong child and admin PINs
- if exposing to children on shared devices, test cookie behavior and session persistence
- if needed, put it behind a reverse proxy such as Caddy or Nginx

### 3. VPS or public server deployment

Best for:

- remote access outside the home
- centralized hosting
- multi-device access from anywhere

Recommended stack:

- Node.js
- `npm run build`
- `npm run start` or `npm run start:prod`
- reverse proxy via Nginx or Caddy
- HTTPS enabled

Basic flow:

1. Install Node.js
2. Copy project files to server
3. Run:

```bash
npm install
npm run build
```

4. Set production env vars
5. Start the app with a process manager such as:
   - `pm2`
   - `systemd`
   - Docker
6. Put Nginx or Caddy in front
7. Enable HTTPS

### 3.1 PM2 production example

This repo includes:

```text
ecosystem.config.cjs
```

Recommended commands:

```bash
npm install
npm run build
pm2 start ecosystem.config.cjs
pm2 save
```

Useful PM2 commands:

```bash
pm2 status
pm2 logs kid-chat-mvp
pm2 restart kid-chat-mvp
pm2 stop kid-chat-mvp
pm2 delete kid-chat-mvp
```

Notes:

- the PM2 app name defaults to `kid-chat-mvp`
- the admin restart API also uses `KID_CHAT_PM2_NAME`, so keep that value aligned with the PM2 process name
- the bundled PM2 config binds the app to `0.0.0.0:3000`
- put Nginx/Caddy in front if you want HTTPS or a custom domain

Important notes for VPS deployment:

- OpenClaw CLI must be available on the server if using real mode
- the child workspaces referenced by the code must exist on that machine
- current memory paths are hard-coded, so they should be updated before deployment if the server layout differs
- use secure PIN values and HTTPS in production

### 4. Reverse proxy recommendation

For production-style setups, it is better not to expose the raw Node server directly.

Use a reverse proxy to provide:

- HTTPS
- stable public port 443
- optional authentication or IP filtering
- cleaner restarts and process isolation

### 5. Deployment checklist

Before production use, verify:

- `.env.local` is set correctly
- `OPENCLAW_USE_MOCK=false` if using live agents
- `openclaw agent --agent grace --message "hello" --json` works on the host
- `KID_CHAT_ADMIN_PIN` is not left at the default
- child PINs are not left at demo defaults
- external memory paths exist and are writable
- reverse proxy and HTTPS are working
- admin route access is tested end-to-end

---

## Practical Starter Setup

For quick local testing:

```bash
cp .env.local.example .env.local
```

Then use:

```bash
KID_CHAT_PIN_GRACE=1111
KID_CHAT_PIN_GEORGE=2222
KID_CHAT_ADMIN_PIN=9999
OPENCLAW_USE_MOCK=true
```

Start the app:

```bash
npm install
npm run dev
```

This is enough to test:

- home page
- child PIN flow
- child chat UI
- dark mode
- parent PIN flow
- parent admin UI

To switch to real mode:

```bash
OPENCLAW_USE_MOCK=false
```

Then make sure this works on your machine:

```bash
openclaw agent --agent grace --message "hello" --json
```

---

## Summary

Kid Chat MVP is a family-oriented chat frontend with:

- separate child entry points
- separate PIN protection
- separate child agents
- parent-managed profile settings
- editable agent memory
- dark mode
- local chat persistence
- optional real OpenClaw integration
ofile settings
- editable agent memory
- dark mode
- local chat persistence
- optional real OpenClaw integration
