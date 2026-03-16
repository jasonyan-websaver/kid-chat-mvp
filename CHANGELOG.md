# Changelog

All notable changes to this project will be documented in this file.

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
