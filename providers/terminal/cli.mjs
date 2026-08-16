#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { BrokerClient } from './broker-client.mjs';

function socketPath() {
  if (process.env.MCP_TERMINAL_SOCKET) return process.env.MCP_TERMINAL_SOCKET;
  if (process.env.XDG_RUNTIME_DIR) return `${process.env.XDG_RUNTIME_DIR}/wsl-agent-terminal.sock`;
  if (typeof process.getuid === 'function') return `/run/user/${process.getuid()}/wsl-agent-terminal.sock`;
  throw new Error('MCP_TERMINAL_SOCKET or XDG_RUNTIME_DIR is required');
}

function tmuxArgs() {
  const args = ['-N'];
  if (process.env.MCP_TERMINAL_TMUX_SOCKET_PATH) {
    args.push('-S', process.env.MCP_TERMINAL_TMUX_SOCKET_PATH);
  } else {
    args.push('-L', process.env.MCP_TERMINAL_TMUX_SOCKET_NAME || 'wsl-agent');
  }
  return args;
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

function waitForChild(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
}

async function listSessions(client) {
  const result = await client.request('session.list', {});
  if (result.sessions.length > 0) {
    process.stdout.write(`${result.sessions.map(renderSession).join('\n')}\n`);
  }
  return 0;
}

async function attachSession(client, name) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('wsl-term attach requires an interactive TTY');
  }

  const lease = await client.request('lease.acquire_human', {
    name,
    clientId: `wsl-term:${process.pid}`,
  });
  let child = null;
  const signalHandlers = new Map();
  try {
    const args = [...tmuxArgs(), 'attach-session', '-t', name];
    child = spawn(process.env.MCP_TERMINAL_TMUX_BIN || 'tmux', args, {
      stdio: 'inherit',
      env: process.env,
    });
    await new Promise((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });

    await client.request('lease.bind_human', {
      name,
      leaseId: lease.leaseId,
      clientPid: child.pid,
    });

    for (const signal of ['SIGTERM', 'SIGHUP']) {
      const handler = () => {
        if (child && child.exitCode === null) child.kill(signal);
      };
      signalHandlers.set(signal, handler);
      process.on(signal, handler);
    }

    const result = await waitForChild(child);
    if (result.code !== null) return result.code;
    return 128;
  } finally {
    for (const [signal, handler] of signalHandlers) process.off(signal, handler);
    try {
      await client.request('lease.release_human', { name, leaseId: lease.leaseId });
    } catch {}
  }
}

export async function runCli(argv = process.argv.slice(2)) {
  const [command, name, ...rest] = argv;
  if (rest.length > 0 || !['list', 'attach'].includes(command)) {
    throw new Error('usage: wsl-term list | wsl-term attach <session>');
  }
  if (command === 'attach' && (!name || name.length === 0)) {
    throw new Error('usage: wsl-term attach <session>');
  }
  if (command === 'list' && name !== undefined) {
    throw new Error('usage: wsl-term list');
  }

  const client = new BrokerClient({ socketPath: socketPath() });
  return command === 'list' ? listSessions(client) : attachSession(client, name);
}

async function main() {
  try {
    process.exitCode = await runCli();
  } catch (error) {
    const code = typeof error?.code === 'string' ? `${error.code}: ` : '';
    process.stderr.write(`${code}${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
