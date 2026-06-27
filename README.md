# Nathan — Vets2Pets Creative Strategy AI

Standalone web app. Stage 1 deploys the existing app as a live static site.
Stage 2 adds real AI (Claude), Pipeboard, and the Obsidian-backed brain via /api routes.

## Project structure
- `index.html` — the full Nathan app (current build)
- `api/` — Vercel serverless functions (starts with `health.js`)
- `vercel.json` — Vercel config
- `package.json` — project metadata

## Deploy (Stage 1 — get it live)
1. Create a GitHub repo and upload all these files.
2. In Vercel, "Add New Project" → import the GitHub repo → Deploy.
3. Your live link: https://<project>.vercel.app
4. Confirm the backend scaffold: open https://<project>.vercel.app/api/health

## Stage 2 — real backend (later)
- Add /api routes: /api/chat (Claude), /api/pipeboard, /api/save, /api/synthesis
- Store secrets as Vercel Environment Variables (never in code):
  ANTHROPIC_API_KEY, PIPEBOARD_API_KEY, GITHUB_TOKEN (for the vault repo)
- Wire the Obsidian vault as a Git repo the API can read/write.
