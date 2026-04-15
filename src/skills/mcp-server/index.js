/**
 * MCP Server Client
 * Speaks the Model Context Protocol over stdio to external tool servers.
 *
 * This is a minimal JSON-RPC 2.0 client: it spawns the server process,
 * handshakes (`initialize`), then lets callers invoke `listTools()` and
 * `callTool(name, args)`. Responses are correlated by request id.
 */

import { spawn } from 'node:child_process';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('skill:mcp');

export class McpClient {
  /**
   * @param {{ command: string, args?: string[], env?: object, name?: string }} opts
   */
  constructor({ command, args = [], env, name = command }) {
    this.command = command;
    this.args = args;
    this.env = env;
    this.name = name;
    this.child = null;
    this.pending = new Map();
    this.nextId = 1;
    this.buffer = '';
    this.tools = [];
    this.connected = false;
  }

  async start() {
    log.info(`Starting MCP server: ${this.name}`);
    this.child = spawn(this.command, this.args, {
      env: { ...process.env, ...this.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.child.stdout.on('data', (chunk) => this._onData(chunk));
    this.child.stderr.on('data', (chunk) => {
      log.debug(`[${this.name}][stderr] ${chunk.toString().trim()}`);
    });
    this.child.on('exit', (code) => {
      log.warn(`MCP server ${this.name} exited with code ${code}`);
      this.connected = false;
      for (const [, { reject }] of this.pending) {
        reject(new Error(`MCP server ${this.name} exited`));
      }
      this.pending.clear();
    });

    const initResult = await this._rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'jarvis', version: '1.0.0' },
    });
    this._notify('notifications/initialized', {});
    this.connected = true;

    try {
      const list = await this._rpc('tools/list', {});
      this.tools = list?.tools ?? [];
    } catch (err) {
      log.warn(`tools/list failed for ${this.name}: ${err.message}`);
      this.tools = [];
    }

    return initResult;
  }

  async listTools() {
    if (!this.connected) throw new Error('MCP client not connected');
    const list = await this._rpc('tools/list', {});
    this.tools = list?.tools ?? [];
    return this.tools;
  }

  async callTool(name, args = {}) {
    if (!this.connected) throw new Error('MCP client not connected');
    return this._rpc('tools/call', { name, arguments: args });
  }

  stop() {
    if (this.child && !this.child.killed) {
      this.child.kill();
      log.info(`Stopped MCP server: ${this.name}`);
    }
  }

  /* -------- internals -------- */

  _onData(chunk) {
    this.buffer += chunk.toString();
    let nl;
    while ((nl = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        this._dispatch(msg);
      } catch (err) {
        log.warn(`[${this.name}] Invalid JSON from MCP server: ${err.message}`);
      }
    }
  }

  _dispatch(msg) {
    if (msg.id !== undefined && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  }

  _rpc(method, params) {
    const id = this.nextId++;
    const payload = { jsonrpc: '2.0', id, method, params };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.child.stdin.write(JSON.stringify(payload) + '\n');
      // reject on timeout
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MCP ${method} timed out`));
        }
      }, 60000);
    });
  }

  _notify(method, params) {
    const payload = { jsonrpc: '2.0', method, params };
    this.child.stdin.write(JSON.stringify(payload) + '\n');
  }
}

/**
 * Manages multiple MCP clients and exposes a unified tool surface.
 */
export class McpHub {
  constructor() {
    this.clients = new Map();
  }

  async add(serverSpec) {
    const client = new McpClient(serverSpec);
    await client.start();
    this.clients.set(client.name, client);
    return client;
  }

  /** Return every tool from every connected server, prefixed with server name. */
  listAllTools() {
    const out = [];
    for (const [serverName, client] of this.clients) {
      for (const tool of client.tools) {
        out.push({ server: serverName, ...tool });
      }
    }
    return out;
  }

  async call(fullName, args) {
    // fullName format: "serverName.toolName" or just toolName (first match)
    let serverName = null;
    let toolName = fullName;
    const dot = fullName.indexOf('.');
    if (dot !== -1) {
      serverName = fullName.slice(0, dot);
      toolName = fullName.slice(dot + 1);
    }
    if (serverName) {
      const client = this.clients.get(serverName);
      if (!client) throw new Error(`Unknown MCP server: ${serverName}`);
      return client.callTool(toolName, args);
    }
    for (const client of this.clients.values()) {
      if (client.tools.some(t => t.name === toolName)) {
        return client.callTool(toolName, args);
      }
    }
    throw new Error(`No MCP server exposes tool: ${toolName}`);
  }

  stopAll() {
    for (const c of this.clients.values()) c.stop();
    this.clients.clear();
  }
}

export default McpHub;
