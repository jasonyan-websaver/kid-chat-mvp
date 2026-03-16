These JSON files are the parent-configured long-term profile layer.

They are different from each agent's own MEMORY.md.

Language policy for this project:

- user-facing app interface may use Chinese or French
- development documentation should use English or Chinese
- do not write development documentation in French

Also:

- profiles/*.json = parent-controlled stable settings
- `~/.openclaw/workspace-<kidId>/MEMORY.md` = child agent memory
- if you use custom workspace env vars, the memory file path follows those configured workspace locations
