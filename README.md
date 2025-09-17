# Bright Data Web MCP Clone + Bridge + UI

This workspace contains a clean-room clone of Bright Data's Web MCP server, a small HTTP bridge that spawns the MCP clone and mediates tool calls, and a minimal web UI to test tools and chat with an LLM agent. Guardrails are configurable at runtime.

## Structure
- `apps/bright-mcp-clone/` – MCP server clone (Rapid tools + optional Pro tools)
- `apps/mcp-bridge/` – HTTP bridge that spawns the MCP server and exposes:
  - `GET /api/tools` – list tools
  - `POST /api/call` – invoke a tool `{ name, args }`
  - `GET/POST /api/guardrails` – view/update guardrails
  - `POST /api/chat` – LLM agent that plans and executes multiple tool steps
  - `GET /api/chat/stream?prompt=...` – Server‑Sent Events stream of step-by-step execution
  - `GET /api/sessions` – list recent persisted chat sessions
- `apps/web/` – simple UI served by the bridge
- `env.example` – environment template

## Features
- Tool parity (Rapid): `search_engine`, `scrape_as_markdown`, `scrape_as_html`, `search_engine_batch`, `scrape_batch`, `extract`, `session_stats`.
- Pro mode (optional): `scraping_browser_*` and generated `web_data_*` dataset tools via `config/datasets.json`.
- Guardrails: enable/disable, domain allow/deny, robots.txt enforcement (bridge-level, with caching), batch caps, rate limit (env), plus server-side checks.
 - Agent controls: per-domain concurrency, max agent steps, step timeout, max tool calls per chat.
 - Settings and sessions persist under `data/`.
- Web UI: guardrail toggles, direct tool invocations, chat console, streaming view, and a sessions browser with JSON download.
- LLM agent: OpenAI-compatible, set `MODEL` (e.g., `gpt-5-codex` when available) and `OPENAI_API_KEY`.

## Setup
1. Copy `env.example` to `.env` or export the variables in your shell:
```
API_TOKEN=...        # Bright Data API token
WEB_UNLOCKER_ZONE=mcp_unlocker
BROWSER_ZONE=mcp_browser
PRO_MODE=false       # set true to enable browser + dataset tools
RATE_LIMIT=100/1h
OPENAI_API_KEY=sk-...
MODEL=gpt-4o-mini    # or gpt-5-codex when available
PORT=8765
```
2. Install deps (workspace root):
```
npm install
```
3. Start the bridge (which auto-spawns the MCP clone) and UI:
```
node apps/mcp-bridge/server.js
```
4. Open UI: `http://localhost:8765`
   - Use “Stream” to watch step-by-step agent events.

## Using with MCP clients (e.g., Claude Desktop)
Local/self-hosted example:
```
{
  "mcpServers": {
    "Bright Data (Clone)": {
      "command": "node",
      "args": ["apps/bright-mcp-clone/server.js"],
      "env": { "API_TOKEN": "<token>", "PRO_MODE": "true" }
    }
  }
}
```

## Dataset Tools
- The file `apps/bright-mcp-clone/config/datasets.json` defines `web_data_*` tools. Add/modify entries or create a sync script to pull IDs from Bright Data.
 - To sync from the reference repo (already cloned under `reference/brightdata-mcp`):
```
npm run sync:datasets
```

## Notes
- This is a clean-room implementation that mirrors tool names and behavior for compatibility. Actual API usage requires valid Bright Data credentials and zones.
- The chat endpoint now supports multi-step execution and a streaming variant.

## Troubleshooting
- If tools are missing: ensure `PRO_MODE=true` for browser/dataset tools.
- If you hit free-tier limits on the default unlocker zone, create your own zone and set `WEB_UNLOCKER_ZONE`.
- For `spawn ENOENT`: ensure Node.js is installed and paths are correct.
