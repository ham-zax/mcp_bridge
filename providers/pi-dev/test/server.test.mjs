import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { BrokerClient } from '../../terminal/broker-client.mjs';
import { makeSandbox, onceExit, startBroker } from '../../terminal/test/helpers.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const server = path.resolve(here, '..', 'server.mjs');
const tempDir = prefix => fs.mkdtemp(path.join(os.tmpdir(), prefix));

async function fixture(mode = 'unrestricted', maxBytes = '1048576') {
  const workspaceRoot = await tempDir('pi-dev-workspace-');
  const stateDir = await tempDir('pi-dev-state-');
  const env = {
    MCP_DEV_SHELL_MODE: mode,
    MCP_DEV_PATH_MODE: 'workspace',
    MCP_DEV_WORKSPACE_ROOT: workspaceRoot,
    MCP_DEV_STATE_DIR: stateDir,
    MCP_DEV_MAX_OUTPUT_BYTES: maxBytes
  };
  return { workspaceRoot, stateDir, env };
}

async function userFixture(maxBytes = '1048576') {
  const defaultCwd = await tempDir('pi-dev-user-cwd-');
  const stateDir = await tempDir('pi-dev-user-state-');
  const env = {
    MCP_DEV_SHELL_MODE: 'unrestricted',
    MCP_DEV_PATH_MODE: 'user',
    MCP_DEV_DEFAULT_CWD: defaultCwd,
    MCP_DEV_STATE_DIR: stateDir,
    MCP_DEV_MAX_OUTPUT_BYTES: maxBytes,
    MCP_DEV_TERMINAL_SOCKET: path.join(stateDir, 'wsl-agent-terminal.sock')
  };
  return { defaultCwd, stateDir, env };
}

async function withClientAt(serverPath, env, fn) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    env: { ...process.env, ...env },
    stderr: 'pipe'
  });
  const client = new Client({ name: 'pi-dev-test', version: '1.0.0' });
  await client.connect(transport);
  try { return await fn(client); }
  finally { await client.close(); }
}

function withClient(env, fn) {
  return withClientAt(server, env, fn);
}

function textOf(result) {
  assert.equal(result.structuredContent, undefined);
  assert.ok(result.content.every(block => block.type === 'text'));
  return result.content.map(block => block.text).join('\n');
}

async function readWaitRecord(stateDir, name) {
  return JSON.parse(await fs.readFile(path.join(stateDir, 'waits', `${name}.json`), 'utf8'));
}

async function runServerProcess(env) {
  const child = spawn(process.execPath, [server], {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'ignore', 'pipe']
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => { stderr += chunk; });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  return { code, stderr };
}

test('path mode startup validation requires the matching authority root', async () => {
  const stateDir = await tempDir('pi-dev-validation-state-');
  const base = {
    MCP_DEV_SHELL_MODE: 'unrestricted',
    MCP_DEV_STATE_DIR: stateDir,
    MCP_DEV_MAX_OUTPUT_BYTES: '1048576'
  };

  const invalid = await runServerProcess({ ...base, MCP_DEV_PATH_MODE: 'other' });
  assert.equal(invalid.code, 2);
  assert.match(invalid.stderr, /MCP_DEV_PATH_MODE.*workspace or user/i);

  const missingWorkspace = await runServerProcess({
    ...base,
    MCP_DEV_PATH_MODE: 'workspace',
    MCP_DEV_WORKSPACE_ROOT: ''
  });
  assert.equal(missingWorkspace.code, 2);
  assert.match(missingWorkspace.stderr, /MCP_DEV_WORKSPACE_ROOT.*absolute path/i);

  const missingDefault = await runServerProcess({
    ...base,
    MCP_DEV_PATH_MODE: 'user',
    MCP_DEV_DEFAULT_CWD: ''
  });
  assert.equal(missingDefault.code, 2);
  assert.match(missingDefault.stderr, /MCP_DEV_DEFAULT_CWD.*absolute path/i);
});

test('trusted-dev exposes four tools and minimal schemas', async () => {
  const { env } = await fixture('unrestricted');
  await withClient(env, async client => {
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map(x => x.name).sort(), ['bash', 'edit', 'read', 'write']);
    const bash = listed.tools.find(x => x.name === 'bash');
    assert.deepEqual(Object.keys(bash.inputSchema.properties).sort(), ['command', 'cwd', 'timeout_seconds']);
    const read = listed.tools.find(x => x.name === 'read');
    assert.deepEqual(Object.keys(read.inputSchema.properties).sort(), ['limit', 'offset', 'path']);
    for (const tool of listed.tools) {
      assert.equal(JSON.stringify(tool.inputSchema).includes('max_output_bytes'), false);
      assert.equal(JSON.stringify(tool.inputSchema).includes('workspaceRoot'), false);
    }
  });
});

test('restricted omits unrestricted Pi bash', async () => {
  const { env } = await fixture('allowlist');
  await withClient(env, async client => {
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map(x => x.name).sort(), ['edit', 'read', 'write']);
  });
});

test('personal user mode exposes apply_patch alongside edit with user-path descriptions', async () => {
  const { env } = await userFixture();
  await withClient(env, async client => {
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map(x => x.name).sort(), ['apply_patch', 'bash', 'edit', 'read', 'wait', 'write']);
    const read = listed.tools.find(x => x.name === 'read');
    assert.match(read.description, /absolute paths.*accepted/i);
    assert.match(read.inputSchema.properties.path.description, /relative.*default.*absolute/i);
    const bash = listed.tools.find(x => x.name === 'bash');
    assert.match(bash.description, /default cwd/i);
    assert.match(bash.inputSchema.properties.cwd.description, /relative.*default.*absolute/i);
    const edit = listed.tools.find(x => x.name === 'edit');
    assert.match(edit.description, /single-file.*guarded|guarded.*single-file/i);
    const applyPatch = listed.tools.find(x => x.name === 'apply_patch');
    assert.deepEqual(Object.keys(applyPatch.inputSchema.properties).sort(), ['cwd', 'patch']);
    assert.match(applyPatch.description, /multi-file.*structural|structural.*multi-file/i);
    assert.match(applyPatch.description, /partial/i);
    assert.match(applyPatch.inputSchema.properties.patch.description, /\*\*\* Move to:/i);
    assert.match(applyPatch.inputSchema.properties.cwd.description, /relative.*default.*absolute/i);
  });
});

test('wait schema enforces create, resume, and cancel modes plus exact first-phase condition kinds', async () => {
  const { waitInputSchema } = await import('../wait-schema.mjs');
  const validKinds = [
    { kind: 'terminal_output', session: 'term', literal: 'READY' },
    { kind: 'terminal_exit', session: 'term' },
    { kind: 'process_exit', pid: 123 },
    { kind: 'tcp_listen', port: 4321 },
    { kind: 'file_exists', path: 'ready.flag' },
    { kind: 'file_changed', path: 'watched.txt' },
    { kind: 'http_ready', url: 'http://127.0.0.1:8080/health' },
    { kind: 'systemd_user', unit: 'demo.service' },
  ];
  for (const condition of validKinds) {
    assert.equal(waitInputSchema.safeParse({ name: `wait-${condition.kind}`, condition }).success, true, condition.kind);
  }
  assert.equal(waitInputSchema.safeParse({ name: 'resume' }).success, true);
  assert.equal(waitInputSchema.safeParse({ name: 'cancel', cancel: true }).success, true);
  assert.equal(waitInputSchema.safeParse({ name: 'bad', condition: validKinds[0], cancel: true }).success, false);
  assert.equal(waitInputSchema.safeParse({ name: 'bad', cancel: true, timeout_seconds: 10 }).success, false);
  assert.equal(waitInputSchema.safeParse({
    name: 'regex', condition: { kind: 'terminal_output', session: 'term', literal: 'READY', regex: '.*' },
  }).success, false);
  assert.equal(waitInputSchema.safeParse({
    name: 'empty', condition: { kind: 'terminal_output', session: 'term', literal: '' },
  }).success, false);
  assert.equal(waitInputSchema.safeParse({
    name: 'large', condition: { kind: 'terminal_output', session: 'term', literal: 'x'.repeat(1025) },
  }).success, false);
});

test('personal wait reports WAIT_NOT_FOUND for resume of an unknown name', async () => {
  const { env } = await userFixture();
  await withClient(env, async client => {
    const result = await client.callTool({ name: 'wait', arguments: { name: 'missing', hold_seconds: 0 } });
    assert.equal(result.isError, true);
    assert.match(textOf(result), /WAIT_NOT_FOUND/);
  });
});

test('personal wait create, idempotent retry, resume, and cancel stay concise native TextContent', async () => {
  const { defaultCwd, env } = await userFixture();
  await withClient(env, async client => {
    const createArgs = {
      name: 'ready-file',
      condition: { kind: 'file_exists', path: 'ready.flag' },
      timeout_seconds: 30,
      hold_seconds: 0,
    };
    const created = await client.callTool({ name: 'wait', arguments: createArgs });
    const createdText = textOf(created);
    assert.match(createdText, /^pending ready-file deadline=/);
    const deadline = createdText.split('deadline=')[1];

    const retried = await client.callTool({ name: 'wait', arguments: createArgs });
    assert.equal(textOf(retried), createdText);
    assert.equal(textOf(retried).split('deadline=')[1], deadline);

    await fs.writeFile(path.join(defaultCwd, 'ready.flag'), 'ready\n');
    const matched = await client.callTool({ name: 'wait', arguments: { name: 'ready-file', hold_seconds: 0 } });
    assert.equal(matched.isError, undefined);
    assert.match(textOf(matched), /^matched ready-file file=.*ready\.flag exists$/);

    const cancelCreated = await client.callTool({
      name: 'wait',
      arguments: {
        name: 'cancel-file',
        condition: { kind: 'file_exists', path: 'never.flag' },
        hold_seconds: 0,
      },
    });
    assert.match(textOf(cancelCreated), /^pending cancel-file deadline=/);
    const cancelled = await client.callTool({ name: 'wait', arguments: { name: 'cancel-file', cancel: true } });
    assert.equal(textOf(cancelled), 'cancelled cancel-file');
  });
});

test('aborting a personal wait MCP call leaves its durable record pending', async () => {
  const { stateDir, env } = await userFixture();
  await withClient(env, async client => {
    const created = await client.callTool({
      name: 'wait',
      arguments: {
        name: 'abort-file',
        condition: { kind: 'file_exists', path: 'never.flag' },
        hold_seconds: 0,
      },
    });
    assert.match(textOf(created), /^pending abort-file deadline=/);

    const controller = new AbortController();
    const pending = client.callTool(
      { name: 'wait', arguments: { name: 'abort-file', hold_seconds: 15 } },
      undefined,
      { signal: controller.signal, timeout: 20000 },
    );
    setTimeout(() => controller.abort(), 60);
    await assert.rejects(pending, /abort/i);
    await new Promise((resolve) => setTimeout(resolve, 80));

    const record = JSON.parse(await fs.readFile(path.join(stateDir, 'waits', 'abort-file.json'), 'utf8'));
    assert.equal(record.status, 'pending');
  });
});

test('Terminal output wait through personal MCP does not consume the Terminal model cursor', async (t) => {
  const sandbox = await makeSandbox(t);
  await startBroker(t, sandbox);
  const broker = new BrokerClient({ socketPath: sandbox.brokerSocket });
  await broker.request('session.open', { name: 'mcp-wait-cursor', command: 'cat' });

  const { env } = await userFixture();
  env.MCP_DEV_TERMINAL_SOCKET = sandbox.brokerSocket;
  await withClient(env, async client => {
    const armed = await client.callTool({
      name: 'wait',
      arguments: {
        name: 'terminal-marker',
        condition: { kind: 'terminal_output', session: 'mcp-wait-cursor', literal: 'READY_FROM_WAIT' },
        hold_seconds: 0,
      },
    });
    assert.match(textOf(armed), /^pending terminal-marker deadline=/);

    await broker.request('session.send', { name: 'mcp-wait-cursor', text: 'READY_FROM_WAIT' });
    await broker.request('session.send', { name: 'mcp-wait-cursor', key: 'Enter' });
    const matched = await client.callTool({
      name: 'wait', arguments: { name: 'terminal-marker', hold_seconds: 2 },
    });
    assert.match(textOf(matched), /^matched terminal-marker output mcp-wait-cursor READY_FROM_WAIT /);

    const unread = await broker.request('model.read', { name: 'mcp-wait-cursor' });
    assert.match(unread.text, /READY_FROM_WAIT/);
    const empty = await broker.request('model.read', { name: 'mcp-wait-cursor' });
    assert.equal(empty.text, '');
  });
});

test('personal http_ready wait times out when readiness arrives only after the durable absolute deadline', async (t) => {
  const httpServer = http.createServer((_req, res) => {
    setTimeout(() => {
      if (res.destroyed) return;
      res.writeHead(204);
      res.end();
    }, 1500);
  });
  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => httpServer.close(resolve)));
  const url = `http://127.0.0.1:${httpServer.address().port}/ready`;
  const { stateDir, env } = await userFixture();

  await withClient(env, async client => {
    const result = await client.callTool({
      name: 'wait',
      arguments: {
        name: 'late-http',
        condition: { kind: 'http_ready', url },
        timeout_seconds: 1,
        hold_seconds: 2,
      },
    });
    assert.equal(textOf(result), 'timeout late-http');
    const saved = await readWaitRecord(stateDir, 'late-http');
    assert.equal(saved.status, 'timeout');
    assert.ok(saved.completedAtMs >= saved.deadlineAtMs);
  });
});

test('personal http_ready hold_seconds is a total resumed-call budget', async (t) => {
  const httpServer = http.createServer((_req, res) => {
    setTimeout(() => {
      if (res.destroyed) return;
      res.writeHead(503);
      res.end('not ready');
    }, 700);
  });
  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => httpServer.close(resolve)));
  const url = `http://127.0.0.1:${httpServer.address().port}/slow`;
  const { stateDir, env } = await userFixture();

  await withClient(env, async client => {
    const created = await client.callTool({
      name: 'wait',
      arguments: {
        name: 'http-hold-budget',
        condition: { kind: 'http_ready', url },
        timeout_seconds: 30,
        hold_seconds: 0,
      },
    });
    assert.match(textOf(created), /^pending http-hold-budget /);

    const started = Date.now();
    const resumed = await client.callTool({
      name: 'wait', arguments: { name: 'http-hold-budget', hold_seconds: 1 },
    });
    const elapsed = Date.now() - started;
    assert.match(textOf(resumed), /^pending http-hold-budget /);
    assert.ok(elapsed >= 750, `hold returned unexpectedly early: ${elapsed}ms`);
    assert.ok(elapsed < 1400, `hold exceeded total one-second budget by source timeout: ${elapsed}ms`);
    assert.equal((await readWaitRecord(stateDir, 'http-hold-budget')).status, 'pending');
  });
});

test('armed personal Terminal wait survives broker outage abort and restart without baseline drift', async (t) => {
  const sandbox = await makeSandbox(t);
  const broker1 = await startBroker(t, sandbox);
  const control = new BrokerClient({ socketPath: sandbox.brokerSocket });
  await control.request('session.open', { name: 'mcp-broker-recovery', command: 'cat' });

  const { stateDir, env } = await userFixture();
  env.MCP_DEV_TERMINAL_SOCKET = sandbox.brokerSocket;
  await withClient(env, async client => {
    const created = await client.callTool({
      name: 'wait',
      arguments: {
        name: 'broker-recovery',
        condition: { kind: 'terminal_output', session: 'mcp-broker-recovery', literal: 'BROKER_BACK' },
        timeout_seconds: 30,
        hold_seconds: 0,
      },
    });
    assert.match(textOf(created), /^pending broker-recovery /);
    const before = await readWaitRecord(stateDir, 'broker-recovery');

    broker1.kill('SIGTERM');
    await onceExit(broker1);
    const unavailable = await client.callTool({
      name: 'wait', arguments: { name: 'broker-recovery', hold_seconds: 2 },
    });
    assert.equal(unavailable.isError, true);
    assert.match(textOf(unavailable), /^WAIT_SOURCE_UNAVAILABLE:/);
    const afterUnavailable = await readWaitRecord(stateDir, 'broker-recovery');
    assert.equal(afterUnavailable.status, 'pending');
    assert.equal(afterUnavailable.deadlineAtMs, before.deadlineAtMs);
    assert.deepEqual(afterUnavailable.baseline, before.baseline);

    const controller = new AbortController();
    const started = Date.now();
    const aborted = client.callTool(
      { name: 'wait', arguments: { name: 'broker-recovery', hold_seconds: 5 } },
      undefined,
      { signal: controller.signal, timeout: 10000 },
    );
    setTimeout(() => controller.abort(), 50);
    await assert.rejects(aborted, /abort/i);
    assert.ok(Date.now() - started < 400, 'broker-down wait abort was not prompt');
    await new Promise((resolve) => setTimeout(resolve, 80));
    const afterAbort = await readWaitRecord(stateDir, 'broker-recovery');
    assert.equal(afterAbort.status, 'pending');
    assert.equal(afterAbort.deadlineAtMs, before.deadlineAtMs);
    assert.deepEqual(afterAbort.baseline, before.baseline);

    await startBroker(t, sandbox);
    const recovered = new BrokerClient({ socketPath: sandbox.brokerSocket });
    await recovered.request('session.send', { name: 'mcp-broker-recovery', text: 'BROKER_BACK' });
    await recovered.request('session.send', { name: 'mcp-broker-recovery', key: 'Enter' });
    const matched = await client.callTool({
      name: 'wait', arguments: { name: 'broker-recovery', hold_seconds: 2 },
    });
    assert.match(textOf(matched), /^matched broker-recovery output mcp-broker-recovery BROKER_BACK /);
  });
});

test('explicit Terminal close persists stable WAIT_SOURCE_ENDED instead of raw tmux diagnostics', async (t) => {
  const sandbox = await makeSandbox(t);
  await startBroker(t, sandbox);
  const broker = new BrokerClient({ socketPath: sandbox.brokerSocket });
  await broker.request('session.open', { name: 'mcp-explicit-close', command: 'cat' });
  const { stateDir, env } = await userFixture();
  env.MCP_DEV_TERMINAL_SOCKET = sandbox.brokerSocket;

  await withClient(env, async client => {
    const created = await client.callTool({
      name: 'wait',
      arguments: {
        name: 'explicit-close-wait',
        condition: { kind: 'terminal_output', session: 'mcp-explicit-close', literal: 'NEVER' },
        hold_seconds: 0,
      },
    });
    assert.match(textOf(created), /^pending explicit-close-wait /);
    await broker.request('session.close', { name: 'mcp-explicit-close', force: true });
    const ended = await client.callTool({
      name: 'wait', arguments: { name: 'explicit-close-wait', hold_seconds: 0 },
    });
    assert.equal(ended.isError, true);
    assert.match(textOf(ended), /^WAIT_SOURCE_ENDED:/);
    const saved = await readWaitRecord(stateDir, 'explicit-close-wait');
    assert.equal(saved.status, 'failed');
    assert.equal(saved.code, 'WAIT_SOURCE_ENDED');
  });
});

test('workspace-mode pi-dev loads from a public-style fixture with the private Terminal tree absent', async () => {
  const root = await tempDir('pi-dev-public-export-');
  const publicProviders = path.join(root, 'providers');
  const copiedPi = path.join(publicProviders, 'pi-dev');
  await fs.mkdir(publicProviders, { recursive: true });
  await fs.cp(path.resolve(here, '..'), copiedPi, {
    recursive: true,
    filter: source => path.basename(source) !== 'node_modules',
  });
  await fs.symlink(path.resolve(here, '..', 'node_modules'), path.join(copiedPi, 'node_modules'), 'dir');
  await assert.rejects(() => fs.stat(path.join(publicProviders, 'terminal')), error => error?.code === 'ENOENT');

  const { env } = await fixture('unrestricted');
  await withClientAt(path.join(copiedPi, 'server.mjs'), env, async client => {
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map(tool => tool.name).sort(), ['bash', 'edit', 'read', 'write']);
  });
});

test('personal read accepts relative default-cwd paths and harmless absolute paths', async () => {
  const { defaultCwd, env } = await userFixture();
  await fs.writeFile(path.join(defaultCwd, 'relative.txt'), 'relative\n');
  await withClient(env, async client => {
    const relative = await client.callTool({ name: 'read', arguments: { path: 'relative.txt' } });
    assert.match(textOf(relative), /relative/);
    const absolute = await client.callTool({ name: 'read', arguments: { path: '/etc/os-release', limit: 2 } });
    assert.equal(absolute.isError, undefined);
    assert.match(textOf(absolute), /(NAME|PRETTY_NAME)=/);
  });
});

test('personal bash uses stable default cwd and accepts relative or absolute cwd', async () => {
  const { defaultCwd, env } = await userFixture();
  await fs.mkdir(path.join(defaultCwd, 'repo'));
  await withClient(env, async client => {
    const base = await client.callTool({ name: 'bash', arguments: { command: 'pwd' } });
    assert.equal(textOf(base).trim(), await fs.realpath(defaultCwd));
    const relative = await client.callTool({ name: 'bash', arguments: { command: 'pwd', cwd: 'repo' } });
    assert.equal(textOf(relative).trim(), await fs.realpath(path.join(defaultCwd, 'repo')));
    const absolute = await client.callTool({ name: 'bash', arguments: { command: 'pwd', cwd: '/tmp' } });
    assert.equal(textOf(absolute).trim(), await fs.realpath('/tmp'));
  });
});

test('personal apply_patch mutates through explicit cwd and returns native summary text', async () => {
  const { defaultCwd, env } = await userFixture();
  const repo = path.join(defaultCwd, 'repo');
  await fs.mkdir(repo);
  await fs.writeFile(path.join(repo, 'a.txt'), 'alpha\nbeta\n');
  await withClient(env, async client => {
    const result = await client.callTool({
      name: 'apply_patch',
      arguments: {
        cwd: 'repo',
        patch: [
          '*** Begin Patch',
          '*** Update File: a.txt',
          '@@',
          '-alpha',
          '+ALPHA',
          '*** Add File: b.txt',
          '+new',
          '*** End Patch'
        ].join('\n')
      }
    });
    assert.equal(result.isError, undefined);
    assert.equal(textOf(result), 'M a.txt (+1 -1)\nA b.txt (+1)');
    assert.equal(await fs.readFile(path.join(repo, 'a.txt'), 'utf8'), 'ALPHA\nbeta\n');
    assert.equal(await fs.readFile(path.join(repo, 'b.txt'), 'utf8'), 'new\n');
  });
});

test('personal apply_patch returns exact-context diagnostics without structured content', async () => {
  const { defaultCwd, env } = await userFixture();
  await fs.writeFile(path.join(defaultCwd, 'x.txt'), 'same\nother\nsame\n');
  await withClient(env, async client => {
    const result = await client.callTool({
      name: 'apply_patch',
      arguments: {
        patch: [
          '*** Begin Patch',
          '*** Update File: x.txt',
          '@@',
          '-same',
          '+changed',
          '*** End Patch'
        ].join('\n')
      }
    });
    assert.equal(result.isError, true);
    assert.match(textOf(result), /ambiguous \(2 matches\)/i);
    assert.equal(await fs.readFile(path.join(defaultCwd, 'x.txt'), 'utf8'), 'same\nother\nsame\n');
  });
});

test('read returns plain text and rejects absolute paths', async () => {
  const { workspaceRoot, env } = await fixture();
  await fs.writeFile(path.join(workspaceRoot, 'x.txt'), 'alpha\nbeta\n');
  await withClient(env, async client => {
    const ok = await client.callTool({ name: 'read', arguments: { path: 'x.txt', offset: 1, limit: 1 } });
    assert.match(textOf(ok), /alpha/);
    const denied = await client.callTool({ name: 'read', arguments: { path: '/etc/passwd' } });
    assert.equal(denied.isError, true);
    assert.match(textOf(denied), /relative/);
  });
});

test('edit returns one diff artifact without generic success prose', async () => {
  const { workspaceRoot, env } = await fixture();
  await fs.writeFile(path.join(workspaceRoot, 'x.txt'), 'alpha\nbeta\n');
  await withClient(env, async client => {
    const result = await client.callTool({
      name: 'edit',
      arguments: { path: 'x.txt', edits: [{ oldText: 'alpha', newText: 'ALPHA' }] }
    });
    const text = textOf(result);
    assert.match(text, /^x\.txt\n/);
    assert.match(text, /ALPHA/);
    assert.doesNotMatch(text, /Successfully replaced|Done!/);
  });
});

test('write returns a short acknowledgement', async () => {
  const { workspaceRoot, env } = await fixture();
  await withClient(env, async client => {
    const result = await client.callTool({
      name: 'write',
      arguments: { path: 'new.txt', content: 'new\n' }
    });
    assert.equal(textOf(result), 'Created new.txt');
    assert.equal(await fs.readFile(path.join(workspaceRoot, 'new.txt'), 'utf8'), 'new\n');
  });
});

test('bash returns terminal text rather than JSON record', async () => {
  const { workspaceRoot, env } = await fixture();
  await fs.mkdir(path.join(workspaceRoot, 'repo'));
  await withClient(env, async client => {
    const result = await client.callTool({
      name: 'bash',
      arguments: { cwd: 'repo', command: "printf ' M src/foo.ts\\n'; exit 1" }
    });
    const text = textOf(result);
    assert.equal(text, ' M src/foo.ts\n[exit 1]');
    assert.throws(() => JSON.parse(text));
  });
});

test('bash cwd parameter rejects absolute and traversal values', async () => {
  const { env } = await fixture();
  await withClient(env, async client => {
    for (const cwd of ['/tmp', '../outside']) {
      const result = await client.callTool({
        name: 'bash',
        arguments: { cwd, command: 'pwd' }
      });
      assert.equal(result.isError, true);
      assert.match(textOf(result), /relative|\.\./);
    }
  });
});

test('trusted-dev command body remains unrestricted outside workspace', async () => {
  const { env } = await fixture();
  await withClient(env, async client => {
    const result = await client.callTool({
      name: 'bash',
      arguments: { command: "head -1 /etc/os-release" }
    });
    assert.match(textOf(result), /^(NAME|PRETTY_NAME)=/);
  });
});

test('deployment output limit is applied without appearing in schema', async () => {
  const { env } = await fixture('unrestricted', '1024');
  await withClient(env, async client => {
    const result = await client.callTool({
      name: 'bash',
      arguments: { command: `node -e "process.stdout.write('x'.repeat(5000))"` }
    });
    const text = textOf(result);
    assert.match(text, /\[truncated · full: .*\]/);
    assert.ok(Buffer.byteLength(text) < 1300);
  });
});

test('edit diagnostics keep model-facing paths workspace-relative', async () => {
  const { workspaceRoot, env } = await fixture();
  await fs.writeFile(path.join(workspaceRoot, 'x.txt'), 'abcdef\n');
  await withClient(env, async client => {
    const result = await client.callTool({
      name: 'edit',
      arguments: {
        path: 'x.txt',
        edits: [
          { oldText: 'abc', newText: 'ABC' },
          { oldText: 'bcd', newText: 'BCD' }
        ]
      }
    });
    assert.equal(result.isError, true);
    const text = textOf(result);
    assert.match(text, /overlap.*x\.txt/i);
    assert.doesNotMatch(text, new RegExp(workspaceRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
});
