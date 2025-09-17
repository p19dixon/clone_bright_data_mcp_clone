import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('datasets.json parses and has entries', () => {
  const p = path.join(process.cwd(), 'apps/bright-mcp-clone/config/datasets.json');
  const raw = fs.readFileSync(p, 'utf8');
  const json = JSON.parse(raw);
  assert.ok(Array.isArray(json.datasets));
  assert.ok(json.datasets.length >= 10);
  for (const ds of json.datasets) {
    assert.ok(ds.id && ds.dataset_id, 'id and dataset_id required');
  }
});

