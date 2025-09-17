#!/usr/bin/env node
'use strict';
import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import axios from 'axios';
import { browserTools } from './browser_tools.js';
import { Guardrails } from './guardrails.js';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const packageJson = { name: '@clone/brightdata-mcp', version: '0.1.0' };
const apiToken = process.env.API_TOKEN;
const unlockerZone = process.env.WEB_UNLOCKER_ZONE || 'mcp_unlocker';
const browserZone = process.env.BROWSER_ZONE || 'mcp_browser';
const proMode = process.env.PRO_MODE === 'true';

// Rapid tools always available; pro tools require PRO_MODE
const proModeTools = new Set([
  'search_engine', 'scrape_as_markdown', 'scrape_as_html', 'search_engine_batch', 'scrape_batch',
]);

const parseRateLimit = (str) => {
  if (!str) return null;
  const m = str.match(/^(\d+)\/(\d+)([mhs])$/);
  if (!m) throw new Error('Invalid RATE_LIMIT format. Use: 100/1h or 50/30m');
  const limit = parseInt(m[1], 10);
  const time = parseInt(m[2], 10);
  const mult = m[3] === 'h' ? 3600 : m[3] === 'm' ? 60 : 1;
  return { limit, window: time * mult * 1000, display: str };
};

const rateLimitConfig = parseRateLimit(process.env.RATE_LIMIT);
if (!apiToken) throw new Error('Cannot run MCP server without API_TOKEN env');

const apiHeaders = () => ({
  'user-agent': `${packageJson.name}/${packageJson.version}`,
  authorization: `Bearer ${apiToken}`,
});

const guardrails = new Guardrails({
  rateLimit: rateLimitConfig ? { limit: rateLimitConfig.limit, windowMs: rateLimitConfig.window } : null,
});

const debugStats = { tool_calls: {}, session_calls: 0, call_timestamps: [] };

const checkRateLimit = () => {
  if (!rateLimitConfig) return true;
  const now = Date.now();
  const windowStart = now - rateLimitConfig.window;
  debugStats.call_timestamps = debugStats.call_timestamps.filter(ts => ts > windowStart);
  if (debugStats.call_timestamps.length >= rateLimitConfig.limit) {
    throw new Error(`Rate limit exceeded: ${rateLimitConfig.display}`);
  }
  debugStats.call_timestamps.push(now);
  return true;
};

async function ensureRequiredZones() {
  try {
    console.error('Checking for required zones...');
    const res = await axios({ url: 'https://api.brightdata.com/zone/get_active_zones', method: 'GET', headers: apiHeaders() });
    const zones = res.data || [];
    const hasUnlocker = zones.some(z => z.name === unlockerZone);
    const hasBrowser = zones.some(z => z.name === browserZone);
    if (!hasUnlocker) {
      console.error(`Creating unlocker zone '${unlockerZone}'...`);
      await axios({ url: 'https://api.brightdata.com/zone', method: 'POST', headers: { ...apiHeaders(), 'Content-Type': 'application/json' }, data: { zone: { name: unlockerZone, type: 'unblocker' }, plan: { type: 'unblocker' } } });
    }
    if (!hasBrowser) {
      console.error(`Creating browser zone '${browserZone}'...`);
      await axios({ url: 'https://api.brightdata.com/zone', method: 'POST', headers: { ...apiHeaders(), 'Content-Type': 'application/json' }, data: { zone: { name: browserZone, type: 'browser_api' }, plan: { type: 'browser_api' } } });
    }
  } catch (e) {
    console.error('Zone check/create error:', e.response?.data || e.message);
  }
}

await ensureRequiredZones();

const server = new FastMCP({ name: 'Bright Data (Clone)', version: packageJson.version });

const addTool = (tool) => {
  // In this clone, Rapid tools are always on; Pro tools and datasets/browser added if PRO_MODE=true
  if (!proMode && !proModeTools.has(tool.name)) return;
  server.addTool(tool);
};

// Utility: wrapper adding logging, rate limiting, and guardrails
function toolFn(name, fn) {
  return async (data, ctx) => {
    checkRateLimit();
    guardrails.checkRate();
    debugStats.tool_calls[name] = (debugStats.tool_calls[name] || 0) + 1;
    debugStats.session_calls++;
    const ts = Date.now();
    console.error(`[${name}] executing ${JSON.stringify(data)}`);
    try {
      // URL guardrails (where applicable)
      if (data?.url && !guardrails.isDomainAllowed(data.url)) throw new Error(`Domain blocked by guardrails: ${data.url}`);
      if (Array.isArray(data?.urls)) {
        if (data.urls.length > (guardrails.get().maxBatch || 10)) throw new Error(`Batch too large (max ${guardrails.get().maxBatch})`);
        for (const u of data.urls) if (!guardrails.isDomainAllowed(u)) throw new Error(`Domain blocked by guardrails: ${u}`);
      }
      return await fn(data, ctx);
    } catch (e) {
      if (e.response) {
        const headers = e.response.headers;
        const isUsageLimit = headers?.['x-brd-err-code'] === 'client_10100';
        if (isUsageLimit && unlockerZone === 'mcp_unlocker') {
          throw new Error('Monthly free-tier limit reached for default zone. Create your own unlocker zone and configure WEB_UNLOCKER_ZONE, then retry.');
        }
        const body = e.response.data;
        const status = e.response.status;
        throw new Error(`HTTP ${status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
      }
      throw e;
    } finally {
      const dur = Date.now() - ts;
      console.error(`[${name}] finished in ${dur}ms`);
    }
  };
}

const searchUrl = (engine, query, cursor) => {
  const q = encodeURIComponent(query);
  const page = cursor ? parseInt(cursor, 10) : 0;
  const start = page * 10;
  if (engine === 'yandex') return `https://yandex.com/search/?text=${q}&p=${page}`;
  if (engine === 'bing') return `https://www.bing.com/search?q=${q}&first=${start + 1}`;
  return `https://www.google.com/search?q=${q}&start=${start}`;
};

// Rapid tools (and also allowed in Pro)
addTool({
  name: 'search_engine',
  description: 'Search Google, Bing, or Yandex. Returns SERP in markdown.',
  parameters: z.object({ query: z.string(), engine: z.enum(['google','bing','yandex']).optional().default('google'), cursor: z.string().optional() }),
  execute: toolFn('search_engine', async ({ query, engine, cursor }) => {
    const response = await axios({ url: 'https://api.brightdata.com/request', method: 'POST', data: { url: searchUrl(engine || 'google', query, cursor), zone: unlockerZone, format: 'raw', data_format: 'markdown' }, headers: apiHeaders(), responseType: 'text' });
    return response.data;
  })
});

addTool({
  name: 'scrape_as_markdown',
  description: 'Scrape a single URL and return clean markdown.',
  parameters: z.object({ url: z.string().url() }),
  execute: toolFn('scrape_as_markdown', async ({ url }) => {
    const response = await axios({ url: 'https://api.brightdata.com/request', method: 'POST', data: { url, zone: unlockerZone, format: 'raw', data_format: 'markdown' }, headers: apiHeaders(), responseType: 'text' });
    return response.data;
  })
});

addTool({
  name: 'scrape_as_html',
  description: 'Scrape a single URL and return HTML.',
  parameters: z.object({ url: z.string().url() }),
  execute: toolFn('scrape_as_html', async ({ url }) => {
    const response = await axios({ url: 'https://api.brightdata.com/request', method: 'POST', data: { url, zone: unlockerZone, format: 'raw' }, headers: apiHeaders(), responseType: 'text' });
    return response.data;
  })
});

addTool({
  name: 'search_engine_batch',
  description: 'Run multiple search queries simultaneously.',
  parameters: z.object({ queries: z.array(z.object({ query: z.string(), engine: z.enum(['google', 'bing', 'yandex']).optional().default('google'), cursor: z.string().optional() })).min(1).max(10) }),
  execute: toolFn('search_engine_batch', async ({ queries }) => {
    const results = await Promise.all(queries.map(({ query, engine, cursor }) => {
      const isGoogle = (engine || 'google') === 'google';
      const url = isGoogle ? `${searchUrl(engine || 'google', query, cursor)}&brd_json=1` : searchUrl(engine || 'google', query, cursor);
      return axios({ url: 'https://api.brightdata.com/request', method: 'POST', data: { url, zone: unlockerZone, format: 'raw', data_format: isGoogle ? undefined : 'markdown' }, headers: apiHeaders(), responseType: 'text' }).then(res => {
        if (isGoogle) {
          const data = JSON.parse(res.data);
          return { query, engine: engine || 'google', result: { organic: data.organic || [], images: data.images ? data.images.map(i => i.link) : [], current_page: data.pagination?.current_page || {}, related: data.related || [], ai_overview: data.ai_overview || null } };
        }
        return { query, engine: engine || 'google', result: res.data };
      });
    }));
    return JSON.stringify(results, null, 2);
  })
});

addTool({
  name: 'scrape_batch',
  description: 'Scrape multiple URLs and return markdown for each.',
  parameters: z.object({ urls: z.array(z.string().url()).min(1).max(10) }),
  execute: toolFn('scrape_batch', async ({ urls }) => {
    const results = await Promise.all(urls.map(url => axios({ url: 'https://api.brightdata.com/request', method: 'POST', data: { url, zone: unlockerZone, format: 'raw', data_format: 'markdown' }, headers: apiHeaders(), responseType: 'text' }).then(r => ({ url, content: r.data }))));
    return JSON.stringify(results, null, 2);
  })
});

// Sampling-based structured extraction
addTool({
  name: 'extract',
  description: 'Scrape a URL as markdown, then extract structured JSON via sampling.',
  parameters: z.object({ url: z.string().url(), extraction_prompt: z.string().optional() }),
  execute: toolFn('extract', async ({ url, extraction_prompt }, ctx) => {
    const scrape = await axios({ url: 'https://api.brightdata.com/request', method: 'POST', data: { url, zone: unlockerZone, format: 'raw', data_format: 'markdown' }, headers: apiHeaders(), responseType: 'text' });
    const markdown = scrape.data;
    const systemPrompt = 'You are a data extraction specialist. Return ONLY valid JSON.';
    const userPrompt = extraction_prompt || 'Extract relevant structured data from the markdown and return ONLY JSON:';
    const session = server.sessions[0];
    if (!session) throw new Error('No active session available for sampling');
    const sampling = await session.requestSampling({
      messages: [{ role: 'user', content: { type: 'text', text: `${userPrompt}\n\nMarkdown content:\n${markdown}` } }],
      systemPrompt,
      includeContext: 'thisServer'
    });
    return sampling.content.text;
  })
});

// Session stats (utility)
addTool({
  name: 'session_stats',
  description: 'Report tool usage during this session',
  parameters: z.object({}),
  execute: toolFn('session_stats', async () => {
    const used = Object.entries(debugStats.tool_calls);
    const lines = ['Tool calls this session:'];
    for (const [name, calls] of used) lines.push(`- ${name}: ${calls}`);
    return lines.join('\n');
  })
});

// Dataset-backed web_data_* tools (PRO)
function loadDatasetsConfig() {
  try {
    const p = path.join(path.dirname(new URL(import.meta.url).pathname), 'config', 'datasets.json');
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw).datasets || [];
  } catch {
    return [];
  }
}

function addDatasetTools() {
  const datasets = loadDatasetsConfig();
  for (const ds of datasets) {
    const { id, dataset_id, description = '', inputs = [], defaults = {} } = ds;
    const parameters = {};
    for (const input of inputs) {
      let schema = z.string();
      if (defaults[input] !== undefined) schema = schema.default(String(defaults[input]));
      parameters[input] = schema;
    }
    addTool({
      name: `web_data_${id}`,
      description,
      parameters: z.object(parameters),
      execute: toolFn(`web_data_${id}`, async (data, ctx) => {
        const trig = await axios({ url: 'https://api.brightdata.com/datasets/v3/trigger', params: { dataset_id, include_errors: true }, method: 'POST', data: [data], headers: apiHeaders() });
        const snapshot_id = trig.data?.snapshot_id;
        if (!snapshot_id) throw new Error('No snapshot ID returned');
        const maxAttempts = 600; // ~10m
        for (let i = 0; i < maxAttempts; i++) {
          if (ctx?.reportProgress) await ctx.reportProgress({ progress: i, total: maxAttempts, message: `Polling snapshot ${snapshot_id}` });
          const snap = await axios({ url: `https://api.brightdata.com/datasets/v3/snapshot/${snapshot_id}`, params: { format: 'json' }, method: 'GET', headers: apiHeaders() });
          if (!['running', 'building'].includes(snap.data?.status)) {
            return JSON.stringify(snap.data);
          }
          await new Promise(r => setTimeout(r, 1000));
        }
        throw new Error('Timeout waiting for dataset snapshot');
      })
    });
  }
}

if (proMode) addDatasetTools();
if (proMode) for (const t of browserTools) addTool(t);

console.error('Starting Bright Data MCP clone...');
server.start({ transportType: 'stdio' });

