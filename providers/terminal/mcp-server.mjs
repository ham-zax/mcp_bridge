#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { BrokerClient } from './broker-client.mjs';

const PUBLIC_KEYS = {
  ENTER: 'Enter',
  CTRL_C: 'C-c',
  CTRL_D: 'C-d',
  CTRL_Z: 'C-z',
  ESC: 'Escape',
  TAB: 'Tab',
  BACKSPACE: 'BSpace',
  UP: 'Up',
  DOWN: 'Down',
  LEFT: 'Left',
  RIGHT: 'Right',
};

function defaultSocketPath() {
  if (process.env.MCP_TERMINAL_SOCKET) return process.env.MCP_TERMINAL_SOCKET;
  if (process.env.XDG_RUNTIME_DIR) return `${process.env.XDG_RUNTIME_DIR}/wsl-agent-terminal.sock`;
  if (typeof process.getuid === 'function') return `/run/user/${process.getuid()}/wsl-agent-terminal.sock`;
  throw new Error('MCP_TERMINAL_SOCKET or XDG_RUNTIME_DIR is required');
}

function textResult(text) {
  return { content: [{ type: 'text', text }] };
}

function errorText(error) {
  const code = typeof error?.code === 'string' ? error.code : 'TERMINAL_ERROR';
  let text = `${code}: ${error instanceof Error ? error.message : String(error)}`;
  const recovery = error?.details?.recovery;
  if (code === 'CURSOR_EXPIRED' && recovery) {
    text += `\nrecovery cursor=${recovery.cursor} nextCursor=${recovery.nextCursor}`;
    if (typeof recovery.text === 'string' && recovery.text.length > 0) text += `\n${recovery.text}`;
  }
  return text;
}

async function invoke(fn) {
  try {
    return await fn();
  } catch (error) {
    return {
      isError: true,
      content: [{ type: 'text', text: errorText(error) }],
    };
  }
}

function compactParams(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function renderSession(session) {
  const state = session.paneDead
    ? `dead exit=${session.paneDeadStatus ?? 'unknown'}`
    : 'live';
  return [
    session.name,
    state,
    `pid=${session.panePid}`,
    `${session.cols}x${session.rows}`,
    `human=${session.humanLease ? 'yes' : 'no'}`,
  ].join(' ');
}

export function createTerminalMcpServer({ client } = {}) {
  if (!client || typeof client.request !== 'function') {
    throw new TypeError('client with request() is required');
  }

  const server = new McpServer({ name: 'terminal', version: '0.1.0' });
  const name = z.string().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/);
  const dimension = z.number().int().positive().max(1000);

  server.registerTool('terminal_open', {
    description: 'Open one durable terminal session in the private harness tmux namespace (production default wsl-agent), not the user\'s default tmux server.',
    inputSchema: {
      name,
      command: z.string().optional(),
      cwd: z.string().min(1).optional(),
      cols: dimension.optional(),
      rows: dimension.optional(),
    },
  }, async (args) => invoke(async () => {
    const result = await client.request('session.open', compactParams(args));
    return textResult(`opened ${result.name} pid=${result.panePid} ${result.cols}x${result.rows}`);
  }));

  server.registerTool('terminal_read', {
    description: 'Read only unread output from a private harness Terminal session; use cursor for recovery or snapshot for current-screen/TUI recovery.',
    inputSchema: {
      name,
      cursor: z.number().int().nonnegative().optional(),
      snapshot: z.boolean().optional(),
    },
  }, async (args) => invoke(async () => {
    const result = await client.request('model.read', compactParams(args));
    return textResult(result.text);
  }));

  const sendSchema = z.object({
    name,
    text: z.string().optional(),
    key: z.enum(Object.keys(PUBLIC_KEYS)).optional(),
  }).superRefine((value, ctx) => {
    const hasText = value.text !== undefined;
    const hasKey = value.key !== undefined;
    if (hasText === hasKey) {
      ctx.addIssue({
        code: 'custom',
        message: 'terminal_send requires exactly one of text or key',
      });
    }
  });

  server.registerTool('terminal_send', {
    description: 'Send literal text or one recognized control/navigation key to a session in the private harness tmux namespace (production default wsl-agent), not a same-named session in the user\'s default tmux server. bin/wsl-term watch <session> is read-only observation and leaves model control available; bin/wsl-term attach <session> is writable human takeover and blocks model mutation.',
    inputSchema: sendSchema,
  }, async (args) => invoke(async () => {
    const params = args.key === undefined
      ? { name: args.name, text: args.text }
      : { name: args.name, key: PUBLIC_KEYS[args.key] };
    await client.request('session.send', params);
    return textResult(`sent to ${args.name}`);
  }));

  server.registerTool('terminal_resize', {
    description: 'Resize an existing private harness Terminal session; writable human takeover blocks model resize.',
    inputSchema: { name, cols: dimension, rows: dimension },
  }, async (args) => invoke(async () => {
    const result = await client.request('session.resize', args);
    return textResult(`resized ${result.name} ${result.cols}x${result.rows}`);
  }));

  server.registerTool('terminal_list', {
    description: 'List durable sessions in the private harness tmux namespace, including dead exit status, dimensions, and writable human-control state.',
    inputSchema: {},
  }, async () => invoke(async () => {
    const result = await client.request('session.list', {});
    return textResult(result.sessions.map(renderSession).join('\n'));
  }));

  server.registerTool('terminal_close', {
    description: 'Close a private harness Terminal session; force=true explicitly overrides writable human control.',
    inputSchema: { name, force: z.boolean().optional() },
  }, async (args) => invoke(async () => {
    const result = await client.request('session.close', compactParams(args));
    return textResult(`closed ${result.name}`);
  }));

  return server;
}

export async function runTerminalMcpStdio({ socketPath = defaultSocketPath() } = {}) {
  const client = new BrokerClient({ socketPath });
  const server = createTerminalMcpServer({ client });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return { server, transport };
}

async function main() {
  const runtime = await runTerminalMcpStdio();
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await runtime.server.close();
  };
  process.stdin.once('end', () => { void shutdown(); });
  process.once('SIGTERM', () => { void shutdown().finally(() => process.exit(0)); });
  process.once('SIGINT', () => { void shutdown().finally(() => process.exit(0)); });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`terminal MCP failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
