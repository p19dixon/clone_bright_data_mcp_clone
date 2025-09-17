'use strict';
import https from 'node:https';
import http from 'node:http';

const cache = new Map(); // domain -> { fetchedAt, rules }
const TTL_MS = 10 * 60 * 1000; // 10 minutes

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http;
    const req = lib.get(url, res => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // follow one redirect max
        fetchText(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode && res.statusCode >= 400) {
        resolve('');
        return;
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', () => resolve(''));
    req.setTimeout(5000, () => { req.destroy(); resolve(''); });
  });
}

function parseRobots(txt) {
  // Very simple parser for User-agent: * blocks with Allow/Disallow
  const lines = txt.split(/\r?\n/).map(l => l.trim());
  const groups = [];
  let current = { agents: [], allow: [], disallow: [] };
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    const [rawKey, ...rest] = line.split(':');
    const key = rawKey.toLowerCase();
    const val = rest.join(':').trim();
    if (key === 'user-agent') {
      if (current.agents.length || current.allow.length || current.disallow.length) groups.push(current), current = { agents: [], allow: [], disallow: [] };
      current.agents.push(val.toLowerCase());
    } else if (key === 'allow') current.allow.push(val);
    else if (key === 'disallow') current.disallow.push(val);
  }
  if (current.agents.length || current.allow.length || current.disallow.length) groups.push(current);
  const star = groups.find(g => g.agents.includes('*')) || { allow: [], disallow: [] };
  return { allow: star.allow, disallow: star.disallow };
}

function pathAllowed(pathname, rules) {
  // simple prefix logic; if an Allow matches longer than any Disallow, allow
  const matchLen = (patterns, p) => patterns.reduce((max, pat) => p.startsWith(pat) ? Math.max(max, pat.length) : max, -1);
  const a = matchLen(rules.allow, pathname);
  const d = matchLen(rules.disallow, pathname);
  if (d === -1) return true;
  if (a === -1) return false;
  return a >= d;
}

export async function checkRobots(urlStr) {
  try {
    const u = new URL(urlStr);
    const domain = u.hostname;
    const now = Date.now();
    let entry = cache.get(domain);
    if (!entry || now - entry.fetchedAt > TTL_MS) {
      const robotsUrl = `${u.protocol}//${domain}/robots.txt`;
      const txt = await fetchText(robotsUrl);
      const rules = parseRobots(txt || '');
      entry = { fetchedAt: now, rules };
      cache.set(domain, entry);
    }
    return pathAllowed(u.pathname, entry.rules);
  } catch {
    return true;
  }
}

export async function checkRobotsForArgs(args) {
  const urls = [];
  if (args?.url) urls.push(args.url);
  if (Array.isArray(args?.urls)) urls.push(...args.urls);
  for (const u of urls) {
    const ok = await checkRobots(u);
    if (!ok) throw new Error(`Robots.txt disallows: ${u}`);
  }
}

