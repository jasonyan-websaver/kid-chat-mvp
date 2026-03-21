# Changelog

All notable changes to this project will be documented in this file.

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
