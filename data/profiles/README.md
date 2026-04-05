These JSON files are the parent-controlled product configuration layer.

They are different from each agent's own persona and memory files in the child workspace.
They should not be treated as the primary source of child persona for the main chat prompt.

Language policy for this project:

- user-facing app interface may use Chinese or French
- development documentation should use English or Chinese
- do not write development documentation in French

Also:

- `profiles/*.json` = parent-controlled product settings and admin-managed configuration
- child persona should primarily live in workspace files such as `USER.md`, `SOUL.md`, `AGENTS.md`, and `MEMORY.md`
- `~/.openclaw/workspace-<kidId>/MEMORY.md` = child agent memory
- if you use custom workspace env vars, the memory file path follows those configured workspace locations

Recommended rule:

- keep stable child identity, teaching style, and long-term preferences in the child workspace
- keep feature flags, modes, admin settings, and parent controls in `profiles/*.json`
- avoid depending on full profile JSON injection in the main chat prompt
