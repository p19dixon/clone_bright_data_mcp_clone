'use strict';
import http from 'node:http';
import url from 'node:url';
import { McpClient } from './mcpClient.js';
import { getGuardrails, setGuardrails, domainAllowed } from './guardrails.js';
import { withDomains, extractHostnames } from './concurrency.js';
import { checkRobotsForArgs } from './robots.js';
import fs from 'node:fs';
import path from 'node:path';
import axios from 'axios';
import { appendSession, listSessions } from './storage.js';

const PORT = process.env.PORT || 8765;

// Spawn our MCP clone
const mcpEnv = { API_TOKEN: process.env.API_TOKEN, WEB_UNLOCKER_ZONE: process.env.WEB_UNLOCKER_ZONE, BROWSER_ZONE: process.env.BROWSER_ZONE, PRO_MODE: process.env.PRO_MODE, RATE_LIMIT: process.env.RATE_LIMIT, SCRAPER_BASE_URL: process.env.SCRAPER_BASE_URL, SCRAPER_TIMEOUT_MS: process.env.SCRAPER_TIMEOUT_MS };
const mcp = new McpClient({
  command: 'node',
  args: [path.join(process.cwd(), 'apps/bright-mcp-clone/server.js')],
  env: mcpEnv
});
(async () => { try { await mcp.start(); } catch (e) { console.error('MCP start error', e); } })();

function send(res, code, body, headers = {}) {
  const b = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', ...headers });
  res.end(b);
}

function parseBody(req) {
  return new Promise(resolve => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => { try { resolve(JSON.parse(data||'{}')); } catch { resolve({}); } });
  });
}

async function handleApi(req, res, parsed) {
  if (req.method === 'OPTIONS') { send(res, 200, '{}', { 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' }); return; }
  if (parsed.pathname === '/api/tools' && req.method === 'GET') {
    const tools = await mcp.listTools();
    send(res, 200, { tools, guardrails: getGuardrails() });
    return;
  }
  if (parsed.pathname === '/api/call' && req.method === 'POST') {
    const body = await parseBody(req);
    const { name, args } = body;
    // Basic guardrails on URL inputs
    if (args?.url && !domainAllowed(args.url)) { send(res, 400, { error: 'Domain blocked by guardrails' }); return; }
    if (Array.isArray(args?.urls)) {
      for (const u of args.urls) if (!domainAllowed(u)) { send(res, 400, { error: `Domain blocked: ${u}` }); return; }
    }
    try {
      if (getGuardrails().respectRobotsTxt) await checkRobotsForArgs(args);
    } catch (e) { send(res, 400, { error: String(e.message||e) }); return; }
    try {
      const hosts = extractHostnames(args);
      const result = await withDomains(hosts, () => mcp.callTool(name, args));
      send(res, 200, result);
    }
    catch (e) { send(res, 500, { error: String(e.message||e) }); }
    return;
  }
  if (parsed.pathname === '/api/guardrails' && req.method === 'GET') {
    send(res, 200, getGuardrails());
    return;
  }
  if (parsed.pathname === '/api/guardrails' && req.method === 'POST') {
    const body = await parseBody(req);
    setGuardrails(body);
    send(res, 200, getGuardrails());
    return;
  }
  if (parsed.pathname === '/api/sessions' && req.method === 'GET') {
    send(res, 200, { sessions: listSessions() });
    return;
  }
  if (parsed.pathname === '/api/chat' && req.method === 'POST') {
    const body = await parseBody(req);
    const userMessages = body.messages || [];
    const tools = await mcp.listTools();
    const openaiUrl = process.env.OPENAI_URL || 'https://api.openai.com/v1/chat/completions';
    const headers = { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY||''}`, 'Content-Type': 'application/json' };
    const functions = tools.map(t => ({
      type: 'function',
      function: { name: t.name, description: t.description||'', parameters: t.inputSchema?.schema || { type: 'object', properties: {} } }
    }));

    const conversation = [...userMessages];
    const steps = [];
    const g = getGuardrails();
    const MAX_STEPS = g.maxAgentSteps || parseInt(process.env.AGENT_MAX_STEPS||'5', 10);
    const STEP_TIMEOUT = g.stepTimeoutMs || 120000;
    let toolCallsUsed = 0;
    const perToolCounts = {};

    const withTimeout = (p, ms) => Promise.race([
      p,
      new Promise((_, rej) => setTimeout(() => rej(new Error('Step timeout exceeded')), ms))
    ]);
    for (let i = 0; i < MAX_STEPS; i++) {
      const resp = await axios.post(openaiUrl, { model: process.env.MODEL || 'gpt-4o-mini', messages: conversation, tools: functions, tool_choice: 'auto' }, { headers });
      const msg = resp.data?.choices?.[0]?.message;
      if (!msg) {
        const result = { step: 'final', content: 'No response', steps };
        appendSession({ type: 'chat', messages: userMessages, steps, result, guardrails: getGuardrails(), endedAt: new Date().toISOString() });
        send(res, 200, result);
        return;
      }
      if (!msg.tool_calls || !msg.tool_calls.length) {
        const result = { step: 'final', content: msg.content || '', steps };
        appendSession({ type: 'chat', messages: userMessages, steps, result, guardrails: getGuardrails(), endedAt: new Date().toISOString() });
        send(res, 200, result);
        return;
      }
      // Record the assistant tool call message
      conversation.push(msg);
      const tc = msg.tool_calls[0];
      const name = tc.function?.name || tc.name;
      const args = (() => { try { return JSON.parse(tc.function?.arguments || '{}'); } catch { return {}; } })();

      // Guardrails: domain + robots
      if (args?.url && !domainAllowed(args.url)) { send(res, 400, { error: 'Domain blocked by guardrails' }); return; }
      if (Array.isArray(args?.urls)) {
        for (const u of args.urls) if (!domainAllowed(u)) { send(res, 400, { error: `Domain blocked: ${u}` }); return; }
      }
      try { if (getGuardrails().respectRobotsTxt) await checkRobotsForArgs(args); }
      catch (e) { send(res, 400, { error: String(e.message||e) }); return; }

      // Check per-chat tool budget
      toolCallsUsed++;
      if (g.maxToolCallsPerChat && toolCallsUsed > g.maxToolCallsPerChat) {
        send(res, 200, { step: 'limit', reason: 'maxToolCallsPerChat', steps });
        return;
      }

      // Check per-tool caps
      perToolCounts[name] = (perToolCounts[name] || 0) + 1;
      const cap = g.perToolCallCaps?.[name];
      if (cap && perToolCounts[name] > cap) {
        const result = { step: 'limit', reason: `perToolCallCaps:${name}`, steps };
        appendSession({ type: 'chat', messages: userMessages, steps, result, guardrails: getGuardrails(), endedAt: new Date().toISOString() });
        send(res, 200, result);
        return;
      }
      // Perform tool call under concurrency + timeout
      try {
        const hosts = extractHostnames(args);
        const result = await withDomains(hosts, () => withTimeout(mcp.callTool(name, args), STEP_TIMEOUT));
        const toolContent = typeof result === 'string' ? result : JSON.stringify(result);
        steps.push({ name, args, preview: toolContent.slice(0, 500) });
        // Provide tool result back to model
        conversation.push({ role: 'tool', tool_call_id: tc.id || 'tool-1', content: toolContent });
      } catch (e) {
        const result = { error: String(e.message||e), steps };
        appendSession({ type: 'chat', messages: userMessages, steps, result, guardrails: getGuardrails(), endedAt: new Date().toISOString() });
        send(res, 500, result);
        return;
      }
    }
    const result = { step: 'limit', steps };
    appendSession({ type: 'chat', messages: userMessages, steps, result, guardrails: getGuardrails(), endedAt: new Date().toISOString() });
    send(res, 200, result);
    return;
  }

  // Simple streaming (SSE-like) over GET using EventSource-compatible endpoint
  if (parsed.pathname === '/api/chat/stream' && req.method === 'GET') {
    const prompt = parsed.query?.prompt || '';
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'Access-Control-Allow-Origin': '*' });
    const sendEvt = (ev, data) => { res.write(`event: ${ev}\n`); res.write(`data: ${JSON.stringify(data)}\n\n`); };
    const tools = await mcp.listTools();
    const openaiUrl = process.env.OPENAI_URL || 'https://api.openai.com/v1/chat/completions';
    const headers = { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY||''}`, 'Content-Type': 'application/json' };
    const functions = tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description||'', parameters: t.inputSchema?.schema || { type: 'object', properties: {} } } }));
    const g = getGuardrails();
    const MAX_STEPS = g.maxAgentSteps || 5;
    const STEP_TIMEOUT = g.stepTimeoutMs || 120000;
    const conversation = [{ role: 'user', content: prompt }];
    let toolCallsUsed = 0;
    const withTimeout = (p, ms) => Promise.race([ p, new Promise((_,rej)=>setTimeout(()=>rej(new Error('Step timeout exceeded')), ms)) ]);
    try {
      for (let i = 0; i < MAX_STEPS; i++) {
        // Request streaming response from model
        const resp = await fetch(openaiUrl, { method: 'POST', headers, body: JSON.stringify({ model: process.env.MODEL || 'gpt-4o-mini', messages: conversation, tools: functions, tool_choice: 'auto', stream: true }) });
        let toolCall = null; let finalText = '';
        const reader = resp.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buf = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const events = buf.split('\n\n');
          buf = events.pop();
          for (const ev of events) {
            const line = ev.trim();
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (payload === '[DONE]') continue;
            let json; try { json = JSON.parse(payload); } catch { continue; }
            const delta = json.choices?.[0]?.delta || {};
            if (delta.content) sendEvt('model_token', { text: delta.content }), finalText += delta.content;
            if (delta.tool_calls && delta.tool_calls.length) {
              const t = delta.tool_calls[0];
              toolCall = toolCall || { name: '', arguments: '' };
              if (t.function?.name) toolCall.name = t.function.name;
              if (t.function?.arguments) toolCall.arguments += t.function.arguments;
            }
          }
        }
        if (!toolCall) {
          appendSession({ type: 'chat', stream: true, messages: [{ role: 'user', content: prompt }], steps: [], result: { content: finalText }, guardrails: getGuardrails(), endedAt: new Date().toISOString() });
          sendEvt('final', { content: finalText });
          res.end();
          return;
        }
        // Assistant decided to call a tool
        try { toolCall.arguments = JSON.parse(toolCall.arguments || '{}'); } catch { toolCall.arguments = {}; }
        sendEvt('assistant_decision', { tool_calls: [{ function: toolCall }] });
        conversation.push({ role: 'assistant', tool_calls: [{ id: 'tool-1', type: 'function', function: { name: toolCall.name, arguments: JSON.stringify(toolCall.arguments) } }] });
        const name = toolCall.name;
        const args = toolCall.arguments;
        // Guardrails
        if (args?.url && !domainAllowed(args.url)) { sendEvt('error', { error: 'Domain blocked by guardrails' }); res.end(); return; }
        if (Array.isArray(args?.urls)) for (const u of args.urls) if (!domainAllowed(u)) { sendEvt('error', { error: `Domain blocked: ${u}` }); res.end(); return; }
        try { if (getGuardrails().respectRobotsTxt) await checkRobotsForArgs(args); }
        catch (e) { sendEvt('error', { error: String(e.message||e) }); res.end(); return; }
        // Budget
        toolCallsUsed++; if (g.maxToolCallsPerChat && toolCallsUsed > g.maxToolCallsPerChat) { sendEvt('limit', { reason: 'maxToolCallsPerChat' }); res.end(); return; }
        // Tool call
        try {
          sendEvt('tool_start', { name, args });
          const hosts = extractHostnames(args);
          const result = await withDomains(hosts, () => withTimeout(mcp.callTool(name, args), STEP_TIMEOUT));
          const toolContent = typeof result === 'string' ? result : JSON.stringify(result);
          sendEvt('tool_result', { name, args, preview: toolContent.slice(0, 1000) });
          conversation.push({ role: 'tool', tool_call_id: 'tool-1', content: toolContent });
        } catch (e) { sendEvt('error', { error: String(e.message||e) }); res.end(); return; }
      }
      appendSession({ type: 'chat', stream: true, messages: [{ role: 'user', content: prompt }], steps: [], result: { step: 'limit' }, guardrails: getGuardrails(), endedAt: new Date().toISOString() });
      sendEvt('limit', { reason: 'maxAgentSteps' });
      res.end();
    } catch (e) {
      sendEvt('error', { error: String(e.message||e) });
      appendSession({ type: 'chat', stream: true, messages: [{ role: 'user', content: prompt }], steps: [], result: { error: String(e.message||e) }, guardrails: getGuardrails(), endedAt: new Date().toISOString() });
      res.end();
    }
    return;
  }
  send(res, 404, { error: 'Not Found' });
}

function serveStatic(req, res, parsed) {
  const root = path.join(process.cwd(), 'apps/web');
  let p = path.join(root, parsed.pathname.replace(/^\/+/, ''));
  if (parsed.pathname === '/' || !fs.existsSync(p)) p = path.join(root, 'index.html');
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end(''); return; }
    const ext = path.extname(p);
    const mime = ext === '.html' ? 'text/html' : ext === '.js' ? 'text/javascript' : 'text/plain';
    res.writeHead(200, { 'content-type': mime });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  if (parsed.pathname && parsed.pathname.startsWith('/api/')) return handleApi(req, res, parsed);
  return serveStatic(req, res, parsed);
});

server.listen(PORT, () => console.log(`Bridge + UI at http://localhost:${PORT}`));
