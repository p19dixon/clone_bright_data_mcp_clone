'use strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';

// Minimal JSON-RPC 2.0 client over stdio for MCP servers.
export class McpClient extends EventEmitter {
  constructor({ command, args = [], env = {} }) {
    super();
    this.command = command;
    this.args = args;
    this.env = { ...process.env, ...env };
    this.proc = null;
    this.msgId = 1;
    this.pending = new Map();
    this.buffer = '';
  }

  async start() {
    if (this.proc) return;
    this.proc = spawn(this.command, this.args, { env: this.env, stdio: ['pipe', 'pipe', 'pipe'] });
    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data', chunk => this._onData(chunk));
    this.proc.stderr.on('data', data => this.emit('stderr', data.toString()));
    this.proc.on('exit', (code) => this.emit('exit', code));
    await this._initialize();
  }

  _onData(chunk) {
    this.buffer += chunk;
    // Messages are HTTP-like headers + JSON per MCP transport; FastMCP stdio uses `Content-Length: <len>\r\n\r\n<body>`
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;
      const header = this.buffer.slice(0, headerEnd);
      const match = /Content-Length: (\d+)/i.exec(header);
      if (!match) { this.buffer = this.buffer.slice(headerEnd + 4); continue; }
      const length = parseInt(match[1], 10);
      const start = headerEnd + 4;
      if (this.buffer.length < start + length) break;
      const body = this.buffer.slice(start, start + length);
      this.buffer = this.buffer.slice(start + length);
      try { this._onMessage(JSON.parse(body)); }
      catch (e) { this.emit('error', e); }
    }
  }

  _send(msg) {
    const body = JSON.stringify(msg);
    const payload = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
    this.proc.stdin.write(payload);
  }

  _onMessage(msg) {
    if (msg.id && (msg.result || msg.error)) {
      const { resolve, reject } = this.pending.get(msg.id) || {};
      this.pending.delete(msg.id);
      if (!resolve) return;
      if (msg.error) reject(new Error(msg.error.message||'RPC error'));
      else resolve(msg.result);
      return;
    }
    // Notifications are ignored for now
  }

  async _rpc(method, params) {
    const id = this.msgId++;
    const p = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this._send({ jsonrpc: '2.0', id, method, params });
    return p;
  }

  async _initialize() {
    // Basic initialize per MCP handshake (loosely modeled)
    await this._rpc('initialize', { 
      capabilities: { experimental: {} },
      clientInfo: { name: 'mcp-bridge', version: '0.1.0' }
    });
    await this._rpc('notifications/initialized', {});
  }

  async listTools() { return (await this._rpc('tools/list', {})).tools || []; }
  async callTool(name, args) { return await this._rpc('tools/call', { name, arguments: args||{} }); }

  stop() { try { this.proc?.kill(); } catch {} }
}

