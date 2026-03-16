# Kid Chat MVP v0.1.0 Release Notes

Release date: 2026-03-16

## Overview

Kid Chat MVP v0.1.0 is the first usable internal MVP release.

This version establishes the core product loop for a family-oriented child chat experience:

- each child has a separate entry point
- each child has a separate PIN
- each child has separate chat history
- each child can be backed by a separate OpenClaw agent
- parents have a protected admin interface for profiles, memory, and operational checks

This release is intended for controlled family/internal use, not public multi-tenant deployment.

---

## What is included in v0.1.0

### Child experience

- child-specific home cards
- PIN-protected child entry
- separate chat threads per child
- create new chats
- switch between chat history threads
- waiting / thinking state while a reply is pending
- improved auto-scroll behavior
- kid-specific title, emoji, color, and welcome copy
- dark mode / light mode

### Parent admin

- parent PIN-protected admin access
- edit child profile JSON
- edit child agent memory (`MEMORY.md`)
- edit title / welcome text
- edit child and parent PIN settings
- optional structured profile form mode
- raw JSON profile editing remains available
- optional advanced raw JSON mode for preserving extra profile fields

### Parent oversight tools

- runtime self-check panel
- visibility into env / profile / workspace / memory status
- per-child agent connectivity testing
- read-only child chat history viewer
- chat history search by title / preview / message text
- search-result highlighting
- time filtering for history view:
  - all
  - last 7 days
  - today

### Reliability and operations

- clearer API and UI error handling
- PM2 production config
- production checklist
- reverse proxy examples for Nginx / Caddy
- backup and recovery guide
- backup / restore scripts
- scheduled backup guidance with retention support

---

## Product direction established in this release

v0.1.0 defines the product shape:

- child-facing chat surface
- parent-facing control surface
- local persistence for conversation continuity
- OpenClaw-backed agent orchestration
- production-minded operational documentation

This version is the baseline for future iterations such as:

- safer moderation layers
- stronger child management configuration
- richer parent oversight
- structured admin workflows
- production hardening beyond MVP scope

---

## Current limitations

This is still an MVP release.

Known limitations include:

- family-scale deployment assumptions
- no full moderation / safety layer yet
- no attachments / image workflows
- no multi-family account model
- no rollback/version history for admin content
- child definitions are still not fully dynamic everywhere

---

## Recommended use

Recommended for:

- family/internal testing
- controlled home or LAN deployment
- private PM2-backed deployment behind a reverse proxy

Not yet recommended as:

- a public consumer-grade SaaS product
- a multi-tenant hosted service
- an internet-wide deployment without extra network protections

---

## Suggested next version targets

Reasonable v0.1.1 / v0.2.0 candidates:

- stronger moderation / safety controls
- more structured admin editing workflows
- richer chat oversight metadata
- dynamic child management
- release packaging and deployment refinement
