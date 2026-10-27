# CLAUDE.md

Read docs/REQUIREMENTS.md. Vanilla HTML/CSS/JS, no framework, no build step. Business rules in logic.js as pure functions with tests. Never render user text with innerHTML.

- Run tests with `npm test` (Node's built-in `node --test`, no dependencies).
- `backend/Code.gs` cannot import `web/logic.js` (Apps Script has no ES modules), so BR-01 validation is mirrored there. Change both together; `tests/backend.test.js` checks the server copy.
- Event text lives in `web/config.js` only. The server-side copies (branches, deadline, privacy switches, contact) live in Script Properties and must be kept in step.
