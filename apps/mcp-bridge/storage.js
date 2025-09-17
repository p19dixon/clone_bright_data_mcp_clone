'use strict';
import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.join(process.cwd(), 'data');
const guardrailsFile = path.join(dataDir, 'guardrails.json');
const sessionsFile = path.join(dataDir, 'sessions.json');

function ensureDir() {
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch {}
}

export function loadGuardrailsFromDisk() {
  try {
    ensureDir();
    if (fs.existsSync(guardrailsFile)) {
      const raw = fs.readFileSync(guardrailsFile, 'utf8');
      return JSON.parse(raw);
    }
  } catch {}
  return null;
}

export function saveGuardrailsToDisk(state) {
  try {
    ensureDir();
    fs.writeFileSync(guardrailsFile, JSON.stringify(state, null, 2));
  } catch {}
}

export function appendSession(session) {
  try {
    ensureDir();
    let list = [];
    if (fs.existsSync(sessionsFile)) {
      try { list = JSON.parse(fs.readFileSync(sessionsFile, 'utf8')) || []; }
      catch { list = []; }
    }
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const item = { id, ...session };
    list.push(item);
    // cap file to last 500 sessions
    if (list.length > 500) list = list.slice(-500);
    fs.writeFileSync(sessionsFile, JSON.stringify(list, null, 2));
    return item;
  } catch { return null; }
}

export function listSessions() {
  try {
    if (!fs.existsSync(sessionsFile)) return [];
    return JSON.parse(fs.readFileSync(sessionsFile, 'utf8')) || [];
  } catch { return []; }
}

