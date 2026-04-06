# Claude Code Rules — Shanju Media

## Git
- Do NOT ask for commit or push. I will manually tell you if needed.
- When I do ask to commit, stage only relevant files — never commit `.env` or `config.js`.

## Code
- This is a plain HTML/JS/Supabase project. Do not introduce build tools, frameworks, or npm packages.
- Keep changes simple and easy to read — I am not a developer.
- Do not refactor or clean up code that wasn't part of the request.

## Database
- Any time a change requires a new table, column, index, policy, or trigger — provide the SQL to run in Supabase. Do not assume it already exists.

## Communication
- Keep explanations short and plain. Avoid technical jargon.
- If something needs a manual step (e.g. Supabase dashboard, GitHub settings), call it out clearly.
