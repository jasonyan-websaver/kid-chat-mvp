# Release Notes — v0.3.1

## Summary

Kid Chat MVP v0.3.1 upgrades the parent admin experience from a narrow French-writing trigger flow into a practical task-management workspace.

This release keeps the existing MVP scope, but makes parent-side task operations much more usable. Parents can now browse task state directly inside admin, create tasks without leaving the page, inspect full task details, and perform per-task state changes safely.

It also fixes an important archive-state mismatch so archived tasks behave consistently across the UI and follow-up APIs.

## Highlights

### Parent admin task browser

- task browsing now lives directly inside the existing `/admin/memory` admin experience
- the task view uses a two-stage layout:
  - summary cards at the top for active task, recent completion, and quick actions
  - a main workspace with task columns and a task-detail panel
- the detail panel keeps the selected task visible while the parent works through state changes

### Per-task management actions

Parents can now act on the currently selected task instead of only using kid-level bulk actions.

Supported actions include:

- move task to pending
- move task to claimed
- move task to completed
- archive selected task
- delete selected task
- copy raw task JSON

### Parent-side task creation

- parents can create a new inbox task directly from the admin page
- task creation uses the same shared inbox-building logic as scripts and backend flows
- this reduces drift between manual scripts and browser-based admin operations

### More stable task browsing UX

- task cards stay compact by hiding long instructions from the list view
- full instructions remain available in the detail panel
- selection stays stable after most single-task operations
- deleting a selected task automatically advances selection when possible
- dark theme contrast is improved for task and history cards

## Fixes

### Archive status normalization

A high-priority issue was fixed in the bulk archive flow.

Before this change:

- bulk archive actions moved task JSON files into the archived folder
- but the JSON content could still retain its old `status`
- this caused mismatches between folder state and task payload state
- follow-up actions and detail views could then misread the real task state

After this change:

- bulk archive writes archived task files with `status: "archived"`
- archived tasks now behave consistently in the detail panel and follow-up task actions

### Route-level 500 investigation

A suspected admin route `500` issue was investigated and verified not to be a real page-render failure.

The earlier report came from test/auth handling rather than a broken UI route. A full browser smoke pass completed successfully without reproducing any route-level error.

## Validation

This release was validated with both API-level and browser-level checks.

### Build and type safety

- `npm run typecheck`
- `npm run build`

### Local API smoke

- verify parent PIN
- create task
- read grouped task status
- move task across states
- archive task
- delete task

### Browser smoke

A local Playwright-driven browser pass verified:

- parent PIN login
- navigation into `/admin/memory`
- opening the task browser tab
- creating a task in the UI
- selecting the task and opening the detail panel
- moving the task through claimed, completed, and archived
- deleting the task
- no route-level `500` during the browser flow

## Scope note

v0.3.1 improves operability, safety, and release confidence.

It does not yet add:

- generalized task templates
- immediate task dispatch into a child chat thread from admin
- fixed-height scrolling task columns

Those remain good follow-up candidates after this admin usability pass.
