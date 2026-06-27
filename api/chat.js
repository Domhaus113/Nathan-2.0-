// /api/chat.js — Nathan's connection to Claude (Anthropic).
// Reads ANTHROPIC_API_KEY from Vercel Environment Variables.
// Optional: CLAUDE_MODEL to override the default model.
// Optional: PIPEBOARD_TOKEN to give Nathan LIVE Meta Ads data via Pipeboard's MCP server.
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
    let system = typeof body.system === "string" ? body.system : "You are Nathan, a senior creative strategist for Vets2Pets.";
    const model = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";
    if (!messages.length) {
      res.status(400).json({ error: "No messages provided." });
      return;
    }

    const headers = {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01"
    };
    const payload = { model: model, max_tokens: 1500, system: system, messages: messages };

    // Optional: wire in LIVE Meta Ads data through Pipeboard's MCP server.
    const pb = process.env.PIPEBOARD_TOKEN;
    if (pb) {
      payload.system = system + "\n\nLIVE DATA: You have live access to this account's Meta (Facebook/Instagram) Ads data via connected Pipeboard tools. When the user asks about real performance (spend, ROAS, CPA, CTR, or specific campaigns/ad sets/ads), call those tools to fetch the actual numbers before answering, then reconcile against Vets2Pets unit economics (target CPA R150-170, breakeven ROAS ~2.56x, AOV R750). If a tool call fails, say so plainly instead of inventing numbers.";
      headers["anthropic-beta"] = "mcp-client-2025-11-20";
      payload.mcp_servers = [
        { type: "url", url: "https://meta-ads.mcp.pipeboard.co/", name: "pipeboard-meta-ads", authorization_token: pb }
      ];
      payload.tools = [
        { type: "mcp_toolset", mcp_server_name: "pipeboard-meta-ads" }
      ];
    }

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload)
    });
    const data = await r.json();
    if (!r.ok) {
      res.status(r.status).json({ error: (data && data.error && data.error.message) ? data.error.message : "Claude API error" });
      return;
    }
    // Collect all text blocks (MCP tool use can produce several content blocks).
    let text = "";
    if (Array.isArray(data.content)) {
      text = data.content.filter((b) => b && b.type === "text" && typeof b.text === "string").map((b) => b.text).join("\n").trim();
    }
    if (!text) text = "(no response)";
    res.status(200).json({ text: text, model: model, liveData: !!pb });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
