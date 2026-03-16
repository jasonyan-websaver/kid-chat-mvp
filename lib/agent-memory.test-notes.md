AI memory extraction notes:

- Uses `openclaw agent --agent <kidId> --message <prompt> --json`
- Expects strict JSON payload from the model
- Falls back to no-op if parsing fails
- Only appends non-duplicate bullet lines to each kid agent MEMORY.md
