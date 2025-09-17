Bright Data Web MCP Clone (Clean Room)

Overview
- Functionally mirrors Bright Data's Web MCP: rapid tools, browser tools, and dataset-backed web_data_* tools.
- Adds guardrails: domain allow/deny, robots policy flag, rate limit, batch caps.
- Exposes identical tool names to ease drop-in usage.

Run
- Env vars: see ../env.example
- Local: `npm --workspace @clone/brightdata-mcp start`
- As CLI: `npx bright-mcp-clone`

Notes
- This clone makes direct HTTP calls to Bright Data APIs. Provide `API_TOKEN` and optionally zones.
- Dataset tools are generated at startup from `config/datasets.json`. You can update/sync this list using `apps/mcp-bridge/scripts/sync-datasets.js` (optional).

