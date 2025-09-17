'use strict';
import { getGuardrails } from './guardrails.js';

const inUse = new Map(); // domain -> count
const waiters = new Map(); // domain -> [resolve]

function limitFor(domain) {
  const g = getGuardrails();
  const overrides = g.domainConcurrencyOverrides || {};
  let matched = null;
  for (const key of Object.keys(overrides)) {
    if (domain === key || domain.endsWith(`.${key}`)) {
      if (!matched || key.length > matched.key.length) matched = { key, val: overrides[key] };
    }
  }
  const lim = matched ? overrides[matched.key] : g.perDomainConcurrency;
  if (!lim || lim <= 0) return Infinity;
  return lim;
}

function acquireOne(domain) {
  const lim = limitFor(domain);
  if (lim === Infinity) return Promise.resolve(() => {});
  const current = inUse.get(domain) || 0;
  if (current < lim) {
    inUse.set(domain, current + 1);
    return Promise.resolve(() => releaseOne(domain));
  }
  return new Promise(resolve => {
    const q = waiters.get(domain) || [];
    q.push(() => { inUse.set(domain, (inUse.get(domain) || 0) + 1); resolve(() => releaseOne(domain)); });
    waiters.set(domain, q);
  });
}

function releaseOne(domain) {
  const current = inUse.get(domain) || 0;
  if (current <= 1) inUse.delete(domain); else inUse.set(domain, current - 1);
  const q = waiters.get(domain) || [];
  const next = q.shift();
  if (next) next();
  if (q.length === 0) waiters.delete(domain); else waiters.set(domain, q);
}

export function extractHostnames(args) {
  const set = new Set();
  const add = (u) => { try { set.add(new URL(u).hostname); } catch {} };
  if (args?.url) add(args.url);
  if (Array.isArray(args?.urls)) args.urls.forEach(add);
  return [...set];
}

export async function withDomains(hosts, fn) {
  const unique = [...new Set(hosts)].sort();
  const releases = [];
  try {
    for (const h of unique) releases.push(await acquireOne(h));
    return await fn();
  } finally {
    while (releases.length) { const r = releases.pop(); try { r(); } catch {} }
  }
}
