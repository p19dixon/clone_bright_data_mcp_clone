import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Guardrails } from '../../bright-mcp-clone/guardrails.js';

test('guardrails allows any domain by default', () => {
  const g = new Guardrails();
  assert.equal(g.isDomainAllowed('https://example.com'), true);
});

test('denylist blocks matching domains', () => {
  const g = new Guardrails({ denyDomains: ['blocked.com'] });
  assert.equal(g.isDomainAllowed('https://api.blocked.com/x'), false);
});

test('allowlist restricts to allowed when set', () => {
  const g = new Guardrails({ allowDomains: ['allowed.com'] });
  assert.equal(g.isDomainAllowed('https://sub.allowed.com/x'), true);
  assert.equal(g.isDomainAllowed('https://other.com/x'), false);
});

test('rate limit tracks calls in window', () => {
  const g = new Guardrails({ rateLimit: { limit: 2, windowMs: 1000 } });
  g.checkRate();
  g.checkRate();
  assert.throws(() => g.checkRate());
});
