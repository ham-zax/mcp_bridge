import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

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
    MCP_DEV_MAX_OUTPUT_BYTES: maxBytes
  };
  return { defaultCwd, stateDir, env };
}

async function withClient(env, fn) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [server],
    env: { ...process.env, ...env },
    stderr: 'pipe'
  });
  const client = new Client({ name: 'pi-dev-test', version: '1.0.0' });
  await client.connect(transport);
  try { return await fn(client); }
  finally { await client.close(); }
}

function textOf(result) {
  assert.equal(result.structuredContent, undefined);
  assert.ok(result.content.every(block => block.type === 'text'));
  return result.content.map(block => block.text).join('\n');
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
    assert.deepEqual(listed.tools.map(x => x.name).sort(), ['apply_patch', 'bash', 'edit', 'read', 'write']);
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
