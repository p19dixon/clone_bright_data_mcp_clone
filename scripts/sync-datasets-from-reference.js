#!/usr/bin/env node
/*
  Sync datasets from reference/brightdata-mcp/server.js into
  apps/bright-mcp-clone/config/datasets.json
*/
import fs from 'node:fs';
import path from 'node:path';

const refPath = path.join(process.cwd(), 'reference/brightdata-mcp/server.js');
const outPath = path.join(process.cwd(), 'apps/bright-mcp-clone/config/datasets.json');

const src = fs.readFileSync(refPath, 'utf8');
const startIdx = src.indexOf('const datasets = [');
const endMarker = 'for (let tool of browser_tools)';
const endIdx = src.indexOf(endMarker, startIdx);
if (startIdx === -1 || endIdx === -1) {
  console.error('Could not locate datasets array in reference file');
  process.exit(1);
}
const block = src.slice(startIdx, endIdx);

// Split individual object blocks roughly by '}, {' boundaries
const objs = block.split(/\},\s*\{/g).map((chunk, i, arr) => {
  let c = chunk;
  if (i === 0) c = c.substring(c.indexOf('{') + 1);
  if (i === arr.length - 1) c = c.substring(0, c.lastIndexOf('}'));
  return '{' + c + '}';
});

const pick = (re, text) => {
  const m = re.exec(text);
  return m ? m[1] : null;
};

const parseInputs = (text) => {
  const m = /inputs:\s*\[([\s\S]*?)\]/.exec(text);
  if (!m) return [];
  return m[1]
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => s.replace(/^'|"/, '').replace(/'|"$/, ''));
};

const parseDefaults = (text) => {
  const m = /defaults:\s*\{([\s\S]*?)\}/.exec(text);
  if (!m) return {};
  const obj = {};
  m[1].split(',').map(s => s.trim()).filter(Boolean).forEach(pair => {
    const kv = /([a-zA-Z0-9_]+)\s*:\s*'([^']*)'/.exec(pair) || /([a-zA-Z0-9_]+)\s*:\s*"([^"]*)"/.exec(pair);
    if (kv) obj[kv[1]] = kv[2];
  });
  return obj;
};

const parseDescription = (text) => {
  const m = /description:\s*\[([\s\S]*?)\]\.join\('\\n'\)/.exec(text);
  if (!m) return '';
  const items = m[1]
    .split(/\n/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(line => {
      const q = /'([\s\S]*?)'/.exec(line) || /"([\s\S]*?)"/.exec(line);
      return q ? q[1] : '';
    })
    .filter(Boolean);
  return items.join('\n');
};

const datasets = [];
for (const raw of objs) {
  const id = pick(/id:\s*'([^']+)'/, raw) || pick(/id:\s*"([^"]+)"/, raw);
  const dataset_id = pick(/dataset_id:\s*'([^']+)'/, raw) || pick(/dataset_id:\s*"([^"]+)"/, raw);
  if (!id || !dataset_id) continue;
  const inputs = parseInputs(raw);
  const defaults = parseDefaults(raw);
  const description = parseDescription(raw) || `Dataset: ${id}`;
  datasets.push({ id, dataset_id, inputs, defaults: Object.keys(defaults).length ? defaults : undefined, description });
}

const out = { note: 'Auto-synced from reference/brightdata-mcp/server.js', datasets };
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`Wrote ${datasets.length} dataset mappings to ${outPath}`);

