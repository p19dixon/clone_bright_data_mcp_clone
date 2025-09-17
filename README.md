# Bright Data Web MCP Clone + Bridge + UI

This workspace contains a clean-room clone of Bright Data's Web MCP server, a small HTTP bridge that mediates tool calls, a standalone rapid-scraper service, and a minimal web UI to test tools and chat with an LLM agent. Guardrails are configurable at runtime.

## Structure
- `apps/bright-mcp-clone/` – MCP server clone (Rapid tools backed by the local scraper + optional Pro tools)
- `apps/scraper/` – self-hosted HTTP scraper that powers the rapid tools (HTML, markdown, search)
- `apps/mcp-bridge/` – HTTP bridge that spawns the MCP server and exposes:
  - `GET /api/tools` – list tools
  - `POST /api/call` – invoke a tool `{ name, args }`
  - `GET/POST /api/guardrails` – view/update guardrails
  - `POST /api/chat` – LLM agent that plans and executes multiple tool steps
  - `GET /api/chat/stream?prompt=...` – Server‑Sent Events stream of step-by-step execution
  - `GET /api/sessions` – list recent persisted chat sessions
- `apps/web/` – simple UI served by the bridge
- `packages/shared/` – shared env/logging/http utilities
- `env.example` – environment template

## Features
- Rapid tool parity via the local scraper service: `search_engine`, `scrape_as_markdown`, `scrape_as_html`, `search_engine_batch`, `scrape_batch`, `extract`, `session_stats`.
- Pro mode (optional, still backed by Bright Data APIs today): `scraping_browser_*` and generated `web_data_*` dataset tools via `config/datasets.json`.
- Guardrails: enable/disable, domain allow/deny, robots.txt enforcement (bridge-level, with caching), batch caps, rate limit (env), plus server-side checks.
  - Agent controls: per-domain concurrency, max agent steps, step timeout, max tool calls per chat.
  - Settings and sessions persist under `data/`.
- Web UI: guardrail toggles, direct tool invocations, chat console, streaming view, and a sessions browser with JSON download.
- LLM agent: OpenAI-compatible, set `MODEL` (e.g., `gpt-5-codex` when available) and `OPENAI_API_KEY`.

## Setup
1. Copy `env.example` to `.env` or export the variables in your shell. Only the scraper/bridge variables are required for rapid tools; Bright Data credentials are optional unless you need browser/dataset parity.
2. Install dependencies (workspace root):
   ```bash
   npm install
   ```
3. Start the scraper service (new terminal):
   ```bash
   npm run start:scraper
   ```
4. Start the bridge (which spawns the MCP server) in another terminal:
   ```bash
   npm run start:bridge
   ```
5. Open the UI at `http://localhost:8765`
   - Use “Stream” to watch step-by-step agent events.

## Using with MCP clients (e.g., Claude Desktop)
Local/self-hosted example:
```json
{
  "mcpServers": {
    "Bright Data (Clone)": {
      "command": "node",
      "args": ["apps/bright-mcp-clone/server.js"],
      "env": {
        "PRO_MODE": "true",
        "SCRAPER_BASE_URL": "http://127.0.0.1:8801"
      }
    }
  }
}
```
Add `API_TOKEN` plus zone variables if you need the Pro/browser/dataset tools to speak to Bright Data.

## Dataset Tools
- The file `apps/bright-mcp-clone/config/datasets.json` defines `web_data_*` tools. Add/modify entries or create a sync script to pull IDs from Bright Data.
- To sync from the reference repo (already cloned under `reference/brightdata-mcp`):
  ```bash
  npm run sync:datasets
  ```
  (Requires `API_TOKEN` today.)

## Notes
- Rapid tools now rely on the bundled scraper service—no Bright Data credentials required.
- Browser and dataset tools still call Bright Data directly until later milestones replace them.
- The chat endpoint supports multi-step execution and a streaming variant.

## Troubleshooting
- If rapid tools fail: confirm the scraper service is running and `SCRAPER_BASE_URL` matches your setup.
- If Pro tools are missing: ensure `PRO_MODE=true` and supply `API_TOKEN` plus zone configuration.
- For `spawn ENOENT`: ensure Node.js is installed and paths are correct.
- To avoid rate-limit errors, adjust `RATE_LIMIT` or disable it for development.
