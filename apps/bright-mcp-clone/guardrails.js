'use strict';

// In-memory guardrails with runtime toggles. The bridge exposes REST to modify these.

export const defaultGuardrails = {
  enabled: true,
  allowDomains: [], // empty = allow all
  denyDomains: [],
  respectRobotsTxt: false, // bridge can enforce robots; server only blocks denylist
  maxBatch: 10,
  rateLimit: null // e.g., { limit: 100, windowMs: 3600_000 }
};

export class Guardrails {
  constructor(initial = {}) {
    this.state = { ...defaultGuardrails, ...initial };
    this.calls = [];
  }

  set(patch) {
    this.state = { ...this.state, ...patch };
  }

  get() { return { ...this.state }; }

  checkRate() {
    const cfg = this.state.rateLimit;
    if (!cfg) return true;
    const now = Date.now();
    const windowStart = now - cfg.windowMs;
    this.calls = this.calls.filter(ts => ts > windowStart);
    if (this.calls.length >= cfg.limit)
      throw new Error(`Rate limit exceeded: ${cfg.limit}/${cfg.windowMs/1000}s`);
    this.calls.push(now);
    return true;
  }

  isDomainAllowed(urlStr) {
    try {
      const { hostname } = new URL(urlStr);
      if (this.state.denyDomains.some(d => hostname.endsWith(d))) return false;
      if (this.state.allowDomains.length === 0) return true;
      return this.state.allowDomains.some(d => hostname.endsWith(d));
    } catch {
      return true; // non-URL inputs aren't restricted
    }
  }
}

