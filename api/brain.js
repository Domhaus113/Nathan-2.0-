// /api/brain.js — Nathan's connection to the Obsidian vault via GitHub.
// Reads GITHUB_TOKEN and GITHUB_REPO from Vercel Environment Variables.
// GET  /api/brain?action=list&folder=Avatars        — list files in a folder
// GET  /api/brain?action=read&path=Avatars/DPP.md   — read a single file
// GET  /api/brain?action=search&q=omega-3           — search across all vault files
// GET  /api/brain?action=all                        — read entire vault (for context injection)
// POST /api/brain { path, content, message }        — write/update a file

const VAULT_FOLDERS = ['Avatars', 'Frameworks', 'Scripts', 'Performance', 'Decisions', 'Playbooks'];

async function githubRequest(path, options = {}) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo) throw new Error('GITHUB_TOKEN or GITHUB_REPO not set in Vercel.');
  const url = `https://api.github.com/repos/${repo}/contents/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `GitHub API error: ${res.status}`);
  return data;
}

async function readFile(path) {
  const data = await githubRequest(path);
  if (!data.content) throw new Error(`No content found at ${path}`);
  return {
    path,
    content: Buffer.from(data.content, 'base64').toString('utf8'),
    sha: data.sha,
  };
}

async function listFolder(folder) {
  try {
    const files = await githubRequest(folder);
    return Array.isArray(files)
      ? files.filter(f => f.name.endsWith('.md') && !f.name.startsWith('_'))
          .map(f => ({ name: f.name, path: f.path, size: f.size }))
      : [];
  } catch (e) {
    return [];
  }
}

async function writeFile(path, content, message, sha) {
  const payload = {
    message: message || `Nathan update: ${path}`,
    content: Buffer.from(content, 'utf8').toString('base64'),
  };
  if (sha) payload.sha = sha;
  return await githubRequest(path, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

async function searchVault(query) {
  const q = query.toLowerCase();
  const results = [];
  for (const folder of VAULT_FOLDERS) {
    const files = await listFolder(folder);
    for (const file of files) {
      try {
        const { content } = await readFile(file.path);
        if (content.toLowerCase().includes(q)) {
          // Extract a snippet around the match
          const idx = content.toLowerCase().indexOf(q);
          const start = Math.max(0, idx - 100);
          const end = Math.min(content.length, idx + 200);
          results.push({
            path: file.path,
            snippet: content.slice(start, end).replace(/\n/g, ' '),
          });
        }
      } catch (e) { /* skip unreadable files */ }
    }
  }
  return results;
}

async function readAllVault() {
  const vault = {};
  for (const folder of VAULT_FOLDERS) {
    const files = await listFolder(folder);
    vault[folder] = [];
    for (const file of files) {
      try {
        const { content } = await readFile(file.path);
        vault[folder].push({ name: file.name, path: file.path, content });
      } catch (e) { /* skip */ }
    }
  }
  return vault;
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    // ── READ operations (GET) ──────────────────────────────────────────────
    if (req.method === 'GET') {
      const { action, folder, path, q } = req.query;

      // List files in a folder
      if (action === 'list') {
        if (!folder) { res.status(400).json({ error: 'folder param required' }); return; }
        const files = await listFolder(folder);
        res.status(200).json({ folder, files });
        return;
      }

      // Read a single file
      if (action === 'read') {
        if (!path) { res.status(400).json({ error: 'path param required' }); return; }
        const file = await readFile(path);
        res.status(200).json(file);
        return;
      }

      // Search across vault
      if (action === 'search') {
        if (!q) { res.status(400).json({ error: 'q param required' }); return; }
        const results = await searchVault(q);
        res.status(200).json({ query: q, results });
        return;
      }

      // Read entire vault (for context injection into Claude)
      if (action === 'all') {
        const vault = await readAllVault();
        // Build a flat markdown string Nathan can read as context
        let context = '# Vets2Pets Brain — Full Vault\n\n';
        for (const [folder, files] of Object.entries(vault)) {
          if (!files.length) continue;
          context += `## ${folder}\n\n`;
          for (const f of files) {
            context += `### ${f.name.replace('.md', '')}\n${f.content}\n\n---\n\n`;
          }
        }
        res.status(200).json({ vault, context });
        return;
      }

      res.status(400).json({ error: 'Invalid action. Use: list, read, search, all' });
      return;
    }

    // ── WRITE operations (POST) ────────────────────────────────────────────
    if (req.method === 'POST') {
      let body = req.body;
      if (!body) {
        body = await new Promise((resolve) => {
          let d = '';
          req.on('data', c => d += c);
          req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch (e) { resolve({}); } });
        });
      }
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }

      const { path, content, message } = body;
      if (!path || !content) { res.status(400).json({ error: 'path and content required' }); return; }

      // Get existing SHA if file exists (required for updates)
      let sha;
      try {
        const existing = await githubRequest(path);
        sha = existing.sha;
      } catch (e) { /* new file, no SHA needed */ }

      await writeFile(path, content, message, sha);
      res.status(200).json({ success: true, path, message: message || `Updated ${path}` });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });

  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
};
