# Release Notes — v0.2.0

## Summary

Kid Chat MVP v0.2.0 is a multimodal and voice-focused internal release.

This update moves the app beyond text-only chat by adding the foundation for uploaded image understanding, image-generation workflows, richer attachment handling, and browser-based TTS playback controls. It also improves parent-side runtime visibility so image backends and related smoke tests can be checked from the admin UI.

## Highlights

### Multimodal chat foundation

- chat messages now support extensible `attachments[]`
- uploaded images can be sent through the child chat flow
- real-mode image understanding now routes through the local OpenClaw-compatible chat completions endpoint
- image-generation architecture now supports multiple backend strategies:
  - media-agent
  - Gemini direct
  - inference.sh

### Parent admin improvements

- image runtime checks added to admin
- image smoke-test endpoints added for validation and troubleshooting
- recent smoke-test results are now persisted and shown in admin
- per-child toggles added for:
  - TTS
  - image understanding
  - image generation
  - image edit readiness
- child-facing capability preview added so parents can see what the child UI will actually expose
- local image-cache usage is now visible in admin
- per-child local image-cache cleanup added in admin
- preferred browser voice selection exposed in admin

### Voice / TTS improvements

- browser-side speech playback support added
- per-child preferred voice and playback rate settings added

### Safety / UX guardrails

- uploaded images are now validated for file type, size, dimensions, and total pixel count
- image uploads are throttled per child to reduce accidental rapid-fire submissions
- child chat UI now shows clearer upload constraints and friendlier error messages when an image is rejected

### Release / maintenance improvements

- version metadata updated to `v0.2.0`
- changelog updated for the new release
- `typecheck` script added
- common generated/runtime artifacts are now ignored:
  - `public/chat-media/`
  - `data/memory-throttle/*.json`
  - `tsconfig.tsbuildinfo`

## Scope note

This remains an internal family-oriented MVP release.

The goal of v0.2.0 is to solidify multimodal and voice capabilities without broadening the product into a public or multi-tenant platform.

## Recommended follow-up after release

- finish stabilizing lint workflow and clear any resulting issues
- review tracked sample/config data for publication safety
- polish multimodal UX details and lightweight safety guardrails
- decide whether image editing should remain groundwork-only or become a complete user-facing flow in the next release
