// /api/chat.js — Nathan's connection to Claude (Anthropic).
// Reads ANTHROPIC_API_KEY from Vercel Environment Variables.
// Optional: CLAUDE_MODEL to override the default model.
// Optional: PIPEBOARD_TOKEN to give Nathan LIVE Meta Ads data via Pipeboard's MCP server.
// Optional: GITHUB_TOKEN + GITHUB_REPO to inject the Obsidian brain vault into every conversation.

const VAULT_FOLDERS = ['Avatars', 'Frameworks', 'Scripts', 'Performance', 'Decisions', 'Playbooks'];

async function readVaultContext() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo) return null;

  let context = '# Vets2Pets Brain — Knowledge Vault\n\n';
  let hasContent = false;

  for (const folder of VAULT_FOLDERS) {
    try {
      const listRes = await fetch(`https://api.github.com/repos/${repo}/contents/${folder}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      });
      if (!listRes.ok) continue;
      const files = await listRes.json();
      if (!Array.isArray(files)) continue;

      const mdFiles = files.filter(f => f.name.endsWith('.md') && !f.name.startsWith('_'));
      if (!mdFiles.length) continue;

      context += `## ${folder}\n\n`;

      for (const file of mdFiles) {
        try {
          const fileRes = await fetch(file.url, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/vnd.github.v3+json',
            },
          });
          if (!fileRes.ok) continue;
          const fileData = await fileRes.json();
          if (!fileData.content) continue;
          const content = Buffer.from(fileData.content, 'base64').toString('utf8');
          context += `### ${file.name.replace('.md', '')}\n${content}\n\n---\n\n`;
          hasContent = true;
        } catch (e) { /* skip unreadable files */ }
      }
    } catch (e) { /* skip missing folders */ }
  }

  return hasContent ? context : null;
}

async function writeToBrain(path, content, message) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo) return false;

  try {
    // Get existing SHA if file exists
    let sha;
    const checkRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });
    if (checkRes.ok) {
      const existing = await checkRes.json();
      sha = existing.sha;
    }

    const payload = {
      message: message || `Nathan update: ${path}`,
      content: Buffer.from(content, 'utf8').toString('base64'),
    };
    if (sha) payload.sha = sha;

    const writeRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    return writeRes.ok;
  } catch (e) {
    return false;
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    res.status(500).json({ error: "ANTHROPIC_API_KEY is not set in Vercel Environment Variables." });
    return;
  }
  try {
    let body = req.body;
    if (!body) {
      body = await new Promise((resolve) => {
        let d = "";
        req.on("data", (c) => (d += c));
        req.on("end", () => { try { resolve(JSON.parse(d || "{}")); } catch (e) { resolve({}); } });
      });
    }
    if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }

    const messages = Array.isArray(body.messages) ? body.messages : [];
    const model = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";

    if (!messages.length) {
      res.status(400).json({ error: "No messages provided." });
      return;
    }

    // ── Build system prompt ────────────────────────────────────────────────

    // Base identity
    let system = typeof body.system === "string" ? body.system :
      `You are Nathan — Vets2Pets' senior creative strategist, direct response copywriter, and paid media advisor. You are direct, specific, and grounded in real data. You never invent product claims. You always think in terms of avatar, angle, awareness level, and hook. You know the unit economics: AOV R750, breakeven CPA R292.88, breakeven ROAS 2.56x, target CPA R150-R170. South African market, prices in ZAR.`;

    // Inject brain vault context
    const vaultContext = await readVaultContext();
    if (vaultContext) {
      system += `\n\n${vaultContext}\n\nThe above is your permanent knowledge base — your brain. Use it to inform every answer. When the user asks you to remember or save something, confirm what you're saving and to which file. When asked about avatars, frameworks, playbooks, or past decisions, reference the brain directly.`;
    }

    // Handle save requests — if the user asks Nathan to save/remember something,
    // extract and write it to the brain
    const lastMessage = messages[messages.length - 1];
    const saveKeywords = ['save', 'remember', 'update', 'add to', 'log this', 'write this down', 'note this'];
    const isSaveRequest = lastMessage && typeof lastMessage.content === 'string' &&
      saveKeywords.some(k => lastMessage.content.toLowerCase().includes(k));

    if (isSaveRequest) {
      system += `\n\nThe user appears to want you to save something. After responding, include a JSON block at the very end of your response in this exact format so the system can write it to the brain:\n\n<brain_write>\n{"path": "Decisions/Creative-Decisions-Log.md", "content": "the full updated file content", "message": "short commit message"}\n</brain_write>\n\nOnly include this if you are actually saving something. Use the correct folder: Decisions/ for decisions and learnings, Scripts/ for new scripts, Avatars/ for avatar updates, Playbooks/ for playbook updates, Performance/ for performance notes.`;
    }

    // ── Wire Pipeboard ─────────────────────────────────────────────────────
    const headers = {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01"
    };
    const payload = { model, max_tokens: 2000, system, messages };

    const pb = process.env.PIPEBOARD_TOKEN;
    if (pb) {
      payload.system = system + "\n\nLIVE DATA: You have live access to this account's Meta (Facebook/Instagram) Ads data via connected Pipeboard tools. When the user asks about real performance (spend, ROAS, CPA, CTR, or specific campaigns/ad sets/ads), call those tools to fetch the actual numbers before answering, then reconcile against Vets2Pets unit economics (target CPA R150-170, breakeven ROAS 2.56x, AOV R750). If a tool call fails, say so plainly instead of inventing numbers.";
      headers["anthropic-beta"] = "mcp-client-2025-11-20";
      payload.mcp_servers = [
        { type: "url", url: "https://meta-ads.mcp.pipeboard.co/", name: "pipeboard-meta-ads", authorization_token: pb }
      ];
      payload.tools = [
        { type: "mcp_toolset", mcp_server_name: "pipeboard-meta-ads" }
      ];
    }

    // ── Call Claude ────────────────────────────────────────────────────────
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });
    const data = await r.json();
    if (!r.ok) {
      res.status(r.status).json({ error: (data && data.error && data.error.message) ? data.error.message : "Claude API error" });
      return;
    }

    // Collect all text blocks
    let text = "";
    if (Array.isArray(data.content)) {
      text = data.content
        .filter(b => b && b.type === "text" && typeof b.text === "string")
        .map(b => b.text)
        .join("\n")
        .trim();
    }
    if (!text) text = "(no response)";

    // ── Handle brain writes ────────────────────────────────────────────────
    let brainWritten = false;
    const brainMatch = text.match(/<brain_write>([\s\S]*?)<\/brain_write>/);
    if (brainMatch) {
      try {
        const writeData = JSON.parse(brainMatch[1].trim());
        if (writeData.path && writeData.content) {
          brainWritten = await writeToBrain(writeData.path, writeData.content, writeData.message);
        }
      } catch (e) { /* invalid JSON in brain_write block */ }
      // Remove the brain_write block from the visible response
      text = text.replace(/<brain_write>[\s\S]*?<\/brain_write>/, '').trim();
    }

    res.status(200).json({
      text,
      model,
      liveData: !!pb,
      brainConnected: !!vaultContext,
      brainWritten,
    });

  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
