Bright Data Web MCP Clone (Clean Room)

Overview
- Rapid tools now proxy through the bundled scraper service (markdown, HTML, search) for standalone use.
- Optional browser and dataset tools still call Bright Data APIs when `PRO_MODE=true` and credentials are supplied.
- Guardrails: domain allow/deny, robots policy flag, rate limit, batch caps.
- Exposes identical tool names to ease drop-in usage.

Run
- Env vars: see ../env.example
- Start scraper first: `npm run start:scraper`
- Launch MCP clone via bridge: `npm run start:bridge` (spawns server automatically)
- Direct CLI (advanced): `node apps/bright-mcp-clone/server.js`

Notes
- Browser + dataset tools require valid Bright Data credentials (`API_TOKEN`, zones).
- Dataset tools load from `config/datasets.json`. Update or sync via `npm run sync:datasets`.

