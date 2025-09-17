'use strict';
import { loadGuardrailsFromDisk, saveGuardrailsToDisk } from './storage.js';

// Bridge-level guardrails mirror server-side guardrails and add robots/concurrency.

const defaultState = {
  enabled: true,
  allowDomains: [],
  denyDomains: [],
  respectRobotsTxt: false,
  maxBatch: 10,
  // Agent + concurrency controls
  maxAgentSteps: 5,
  stepTimeoutMs: 120000,
  perDomainConcurrency: 2,
  maxToolCallsPerChat: 50,
  // Advanced overrides
  domainConcurrencyOverrides: {}, // { "example.com": 1 }
  perToolCallCaps: {}, // { "search_engine": 3 }
};

const loaded = loadGuardrailsFromDisk();
export const guardrailsState = { ...(loaded || defaultState) };

export function setGuardrails(patch) {
  Object.assign(guardrailsState, patch || {});
  saveGuardrailsToDisk(guardrailsState);
}

export function getGuardrails() { return { ...guardrailsState }; }

export function domainAllowed(urlStr) {
  try {
    const { hostname } = new URL(urlStr);
    if (guardrailsState.denyDomains.some(d => hostname.endsWith(d))) return false;
    if (guardrailsState.allowDomains.length === 0) return true;
    return guardrailsState.allowDomains.some(d => hostname.endsWith(d));
  } catch {
    return true;
  }
}
