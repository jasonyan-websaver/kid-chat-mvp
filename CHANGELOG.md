# Changelog

All notable changes to this project will be documented in this file.

## v0.3.1 - 2026-04-09

Parent admin task-browser upgrade and validation pass.

### Added

- parent-admin task browser inside the existing `/admin/memory` experience
- two-stage task workspace layout with summary cards, task columns, and sticky task-detail panel
- parent-side task creation flow wired directly into `tasks/inbox`
- per-task admin actions for moving, archiving, deleting, and copying task JSON
- local Playwright-based browser smoke coverage for the parent admin task flow

### Improved

- task browsing now keeps selection stable after single-task move operations
- deleting a selected task now auto-selects the next visible task when possible
- task cards now stay compact by keeping full instructions only in the detail panel
- dark theme text contrast is explicitly styled for task cards and related history cards
- admin task management now favors selected-task actions instead of only kid-level bulk actions

### Fixed

- bulk archive actions now rewrite task JSON `status` to `archived` when moving files into the archived folder
- archived-task follow-up actions no longer fail because of mismatched `from` state values
- earlier suspected admin route `500` issue was verified as an auth/cookie test artifact rather than a real page-render failure

### Validation

- `npm run typecheck`
- `npm run build`
- local API smoke for create, status, move, archive, and delete flows
- local browser smoke for parent PIN login, task browsing, task creation, selected-task actions, and route stability

## v0.3.0 - 2026-04-07

French-writing reward-loop MVP.

### Added

- dedicated French-writing task flow for George / Grace chats
- lightweight task assignment API for short French writing challenges
- per-chat French-writing task persistence under `data/french-writing-tasks/`
- automatic basic completion checks for child submissions:
  - looks like French
  - stays on topic
  - length is roughly in range
- automatic reward-image generation when the child completes the task successfully
- child chat header task panel so a parent can trigger the current MVP flow without entering admin

### Improved

- real chat flow can now detect an active French-writing task and evaluate the child submission before falling back to normal assistant chat
- reward delivery now stays inside the existing chat experience, so assignment, submission, evaluation, and reward all happen in one thread

### Notes

This release intentionally avoids building a general-purpose task engine.
It ships a narrow but end-to-end learning loop focused on French writing practice and theme-matched visual rewards.

## v0.2.2 - 2026-03-28

Markdown rendering and TTS cleanup update.

### Fixed

- assistant chat replies now render markdown instead of showing raw markdown symbols as plain text
- browser TTS now strips markdown syntax before speaking so symbols like `**` are not read aloud
- child/user messages remain plain text and no longer risk accidental markdown interpretation
- chat list previews now normalize assistant markdown into plain text so sidebar snippets stay clean
- welcome text now preserves natural line breaks while remaining plain text

### Improved

- single-line breaks in assistant replies now render more naturally in chat bubbles
- chat bubble styling now better supports paragraphs, emphasis, lists, blockquotes, inline code, and code blocks
- markdown handling is now more consistent across live replies, stored history, TTS playback, and sidebar previews

### Notes

This is a small polish release focused on making child chat replies display and sound natural after markdown-enabled assistant output was introduced.
It does not expand product scope, but it noticeably improves everyday chat quality.

## v0.2.1 - 2026-03-21

Image-pipeline stabilization and release hardening update.

### Fixed

- stabilized the image-generation pipeline after the initial multimodal rollout
- improved smoke-test diagnostics so admin failures expose more useful debug context instead of opaque empty-output failures
- hardened smoke-test JSON extraction against wrapped OpenClaw output
- fixed local preview handling for smoke-test images so generated previews render reliably in admin
- fixed absolute-path handling when saving generated images into `public/chat-media/...`
- fixed preview URL truncation that could cause smoke-test image 404s
- corrected Gemini direct image generation configuration by aligning the model / endpoint usage
- normalized `google/...` style model aliases before Google API calls

### Improved

- media-agent smoke tests now prefer a compact local-file-path result contract instead of oversized payloads
- admin now shows preview images for both media-agent and Gemini direct smoke tests
- admin exposes `KID_CHAT_IMAGE_PROVIDER` and `KID_CHAT_IMAGE_MODEL` controls so the formal chat image backend can be switched without hand-editing `.env.local`
- release confidence improved through repeated rebuilds and end-to-end verification after image-pipeline fixes

### Notes

This release focuses on stabilizing the new image features introduced in v0.2.0 rather than expanding product scope.
It keeps the family MVP on a safer operational baseline before the next feature cycle.

## v0.2.0 - 2026-03-20

Multimodal and voice-focused update.

### Added

- multimodal chat attachment model with extensible `attachments[]` support
- uploaded image handling for child chat messages via multipart form submissions
- real-mode image understanding path through the local OpenClaw-compatible chat completions endpoint
- image-generation routing foundation with provider abstraction for media-agent, Gemini direct, and inference.sh flows
- parent admin image runtime checks and smoke-test endpoints
- per-child capability toggles for TTS, image understanding, image generation, and image edit readiness
- browser-side TTS playback controls and preferred voice settings in admin
- `typecheck` script for stable TypeScript validation
- runtime artifact ignore rules for generated media, memory throttle state, and TypeScript build info

### Improved

- admin panel now exposes more runtime detail for image backends and voice selection
- parent admin now shows child-facing capability previews so parents can see which buttons and modes each child will actually see
- parent admin now shows local image-cache usage and supports per-child cache cleanup
- parent admin now keeps recent image smoke-test results visible after the test finishes
- child upload flow now shows clearer guardrails and friendlier error messages for invalid image uploads
- chat UI now supports richer attachment rendering for uploaded and generated images
- README now documents image-provider environment variables and image-upload guardrails for multimodal configuration
- release packaging is better aligned with unpublished v0.2.0 functionality already present in the worktree

### Notes

This release expands the internal family MVP toward multimodal interaction while keeping the scope intentionally narrow.
It remains a family-oriented single-installation app rather than a public multi-tenant SaaS product.

## v0.1.0 - 2026-03-16

First usable MVP release.

### Added

- child-facing multi-entry home page
- kid-specific PIN access flow
- separate chat history per child
- create new chats and switch between chat threads
- waiting / thinking state while replies are pending
- auto-scroll behavior for chat view
- parent admin PIN flow
- parent admin editing for:
  - agent memory (`MEMORY.md`)
  - profile JSON
  - title / welcome text
  - PIN and runtime env values
- profile editing in two modes:
  - raw JSON
  - optional structured form mode
- normalized profile schema validation
- optional advanced raw JSON mode for preserving extra profile fields
- runtime self-check panel in admin
- per-agent connectivity testing from admin
- parent-only read-only chat history viewer
- chat history search, highlighting, and time filtering
- PM2 production config
- production checklist
- reverse proxy examples (Nginx / Caddy)
- backup and recovery documentation
- backup / restore scripts
- scheduled backup guidance with retention support

### Improved

- better API error clarity for real-mode failures
- friendlier UI error messages in chat
- history previews now show real last-message summaries
- admin UI now hides save actions on read-only history views
- production-oriented docs and operational workflow

### Notes

This release is intended as the first stable internal MVP for family use.
It is not yet a multi-tenant or public SaaS-grade system.
