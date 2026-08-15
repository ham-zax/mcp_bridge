import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createStrictEditOperations, runRead, runEdit, runWrite } from '../files.mjs';

const execFileAsync = promisify(execFile);

const tempDir = prefix => fs.mkdtemp(path.join(os.tmpdir(), prefix));

test('read honors Pi offset and limit within workspace', async () => {
  const workspaceRoot = await tempDir('pi-read-');
  await fs.mkdir(path.join(workspaceRoot, 'repo'));
  await fs.writeFile(path.join(workspaceRoot, 'repo', 'x.txt'), 'one\ntwo\nthree\nfour\n');
  const result = await runRead({ workspaceRoot, path: 'repo/x.txt', offset: 2, limit: 2 });
  const text = result.content.filter(x => x.type === 'text').map(x => x.text).join('\n');
  assert.match(text, /two/);
  assert.match(text, /three/);
  assert.doesNotMatch(text, /four/);
});

test('user read resolves relative paths from default cwd and accepts harmless absolute paths', async () => {
  const defaultCwd = await tempDir('pi-user-read-');
  await fs.writeFile(path.join(defaultCwd, 'relative.txt'), 'relative\n');
  const relative = await runRead({ pathMode: 'user', defaultCwd, path: 'relative.txt' });
  const relativeText = relative.content.filter(x => x.type === 'text').map(x => x.text).join('\n');
  assert.match(relativeText, /relative/);

  const absolute = await runRead({ pathMode: 'user', defaultCwd, path: '/etc/os-release', limit: 2 });
  const absoluteText = absolute.content.filter(x => x.type === 'text').map(x => x.text).join('\n');
  assert.match(absoluteText, /(NAME|PRETTY_NAME)=/);
});

test('user edit and write keep exact-edit and create-only mutation safety', async () => {
  const defaultCwd = await tempDir('pi-user-mutate-');
  const existing = path.join(defaultCwd, 'existing.txt');
  await fs.writeFile(existing, 'alpha\nbeta\n');
  await runEdit({
    pathMode: 'user',
    defaultCwd,
    path: 'existing.txt',
    edits: [{ oldText: 'alpha', newText: 'ALPHA' }]
  });
  assert.equal(await fs.readFile(existing, 'utf8'), 'ALPHA\nbeta\n');

  const created = path.join(defaultCwd, 'created.txt');
  await runWrite({ pathMode: 'user', defaultCwd, path: created, content: 'first\n' });
  await assert.rejects(
    () => runWrite({ pathMode: 'user', defaultCwd, path: created, content: 'second\n' }),
    /already exists|use edit/i
  );
  assert.equal(await fs.readFile(created, 'utf8'), 'first\n');
});

test('edit performs multiple exact disjoint replacements and returns a diff', async () => {
  const workspaceRoot = await tempDir('pi-edit-');
  await fs.mkdir(path.join(workspaceRoot, 'repo'));
  const file = path.join(workspaceRoot, 'repo', 'x.txt');
  await fs.writeFile(file, 'alpha\nbeta\ngamma\n');
  const result = await runEdit({
    workspaceRoot,
    path: 'repo/x.txt',
    edits: [
      { oldText: 'alpha', newText: 'ALPHA' },
      { oldText: 'gamma', newText: 'GAMMA' }
    ]
  });
  assert.equal(await fs.readFile(file, 'utf8'), 'ALPHA\nbeta\nGAMMA\n');
  assert.match(result.details.diff, /ALPHA/);
  assert.match(result.details.diff, /GAMMA/);
});

test('fuzzy-only Unicode quote match is rejected', async () => {
  const workspaceRoot = await tempDir('pi-fuzzy-');
  await fs.writeFile(path.join(workspaceRoot, 'x.txt'), 'const x = “hello”;\n');
  await assert.rejects(
    () => runEdit({
      workspaceRoot,
      path: 'x.txt',
      edits: [{ oldText: 'const x = "hello";', newText: 'const x = "bye";' }]
    }),
    /exact text.*not found/i
  );
});

test('CRLF file accepts LF oldText and preserves CRLF', async () => {
  const workspaceRoot = await tempDir('pi-crlf-');
  const file = path.join(workspaceRoot, 'x.txt');
  await fs.writeFile(file, 'alpha\r\nbeta\r\n');
  await runEdit({
    workspaceRoot,
    path: 'x.txt',
    edits: [{ oldText: 'alpha\nbeta', newText: 'ALPHA\nbeta' }]
  });
  assert.equal(await fs.readFile(file, 'utf8'), 'ALPHA\r\nbeta\r\n');
});

test('edit operation detects a changed snapshot before write', async () => {
  const workspaceRoot = await tempDir('pi-conflict-');
  const file = path.join(workspaceRoot, 'x.txt');
  await fs.writeFile(file, 'alpha\n');
  const ops = createStrictEditOperations([{ oldText: 'alpha', newText: 'ALPHA' }]);
  await ops.access(file);
  await ops.readFile(file);
  await fs.writeFile(file, 'other\n');
  await assert.rejects(() => ops.writeFile(file, 'ALPHA\n'), /changed during edit/i);
  assert.equal(await fs.readFile(file, 'utf8'), 'other\n');
});

test('write creates a new file and refuses an existing path', async () => {
  const workspaceRoot = await tempDir('pi-write-');
  await runWrite({ workspaceRoot, path: 'new.txt', content: 'first\n' });
  await assert.rejects(
    () => runWrite({ workspaceRoot, path: 'new.txt', content: 'second\n' }),
    /already exists|use edit/i
  );
  assert.equal(await fs.readFile(path.join(workspaceRoot, 'new.txt'), 'utf8'), 'first\n');
});

test('two concurrent creates for one absent path yield exactly one success', async () => {
  const workspaceRoot = await tempDir('pi-write-race-');
  const settled = await Promise.allSettled([
    runWrite({ workspaceRoot, path: 'race.txt', content: 'A\n' }),
    runWrite({ workspaceRoot, path: 'race.txt', content: 'B\n' })
  ]);
  assert.equal(settled.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(settled.filter(x => x.status === 'rejected').length, 1);
  assert.match(await fs.readFile(path.join(workspaceRoot, 'race.txt'), 'utf8'), /^(A|B)\n$/);
});

test('personal concurrent creates keep create-only semantics', async () => {
  const defaultCwd = await tempDir('pi-user-write-race-');
  const settled = await Promise.allSettled([
    runWrite({ pathMode: 'user', defaultCwd, path: 'race.txt', content: 'A\n' }),
    runWrite({ pathMode: 'user', defaultCwd, path: 'race.txt', content: 'B\n' })
  ]);
  assert.equal(settled.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(settled.filter(x => x.status === 'rejected').length, 1);
  assert.match(await fs.readFile(path.join(defaultCwd, 'race.txt'), 'utf8'), /^(A|B)\n$/);
});

test('two personal edits of the same exact region produce one safe conflict', async () => {
  const defaultCwd = await tempDir('pi-user-edit-same-region-');
  const file = path.join(defaultCwd, 'x.txt');
  await fs.writeFile(file, `alpha\n${'middle\n'.repeat(12000)}`);

  const settled = await Promise.allSettled([
    runEdit({
      pathMode: 'user',
      defaultCwd,
      path: 'x.txt',
      edits: [{ oldText: 'alpha', newText: 'ACTOR_A' }]
    }),
    runEdit({
      pathMode: 'user',
      defaultCwd,
      path: 'x.txt',
      edits: [{ oldText: 'alpha', newText: 'ACTOR_B' }]
    })
  ]);

  assert.equal(settled.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(settled.filter(x => x.status === 'rejected').length, 1);
  assert.match(await fs.readFile(file, 'utf8'), /^(ACTOR_A|ACTOR_B)\n/);
});

test('a stale exact edit rejects after another actor changes the observed region', async () => {
  const defaultCwd = await tempDir('pi-user-edit-stale-region-');
  const file = path.join(defaultCwd, 'x.txt');
  await fs.writeFile(file, 'alpha\nbeta\n');

  const observed = await runRead({ pathMode: 'user', defaultCwd, path: 'x.txt' });
  assert.match(observed.content.map(block => block.text ?? '').join('\n'), /alpha/);

  await runEdit({
    pathMode: 'user',
    defaultCwd,
    path: 'x.txt',
    edits: [{ oldText: 'alpha', newText: 'ACTOR_B' }]
  });
  await assert.rejects(
    () => runEdit({
      pathMode: 'user',
      defaultCwd,
      path: 'x.txt',
      edits: [{ oldText: 'alpha', newText: 'ACTOR_A' }]
    }),
    /exact text.*not found|changed during edit/i
  );
  assert.equal(await fs.readFile(file, 'utf8'), 'ACTOR_B\nbeta\n');
});

test('independent personal edits in different files both succeed', async () => {
  const defaultCwd = await tempDir('pi-user-edit-independent-');
  await fs.writeFile(path.join(defaultCwd, 'a.txt'), 'alpha\n');
  await fs.writeFile(path.join(defaultCwd, 'b.txt'), 'beta\n');

  const settled = await Promise.allSettled([
    runEdit({
      pathMode: 'user',
      defaultCwd,
      path: 'a.txt',
      edits: [{ oldText: 'alpha', newText: 'ALPHA' }]
    }),
    runEdit({
      pathMode: 'user',
      defaultCwd,
      path: 'b.txt',
      edits: [{ oldText: 'beta', newText: 'BETA' }]
    })
  ]);

  assert.ok(settled.every(x => x.status === 'fulfilled'));
  assert.equal(await fs.readFile(path.join(defaultCwd, 'a.txt'), 'utf8'), 'ALPHA\n');
  assert.equal(await fs.readFile(path.join(defaultCwd, 'b.txt'), 'utf8'), 'BETA\n');
});

test('edit snapshot rejects a native Bash mutation before write', async () => {
  const defaultCwd = await tempDir('pi-user-edit-native-race-');
  const file = path.join(defaultCwd, 'x.txt');
  await fs.writeFile(file, 'alpha\n');

  const ops = createStrictEditOperations([{ oldText: 'alpha', newText: 'ALPHA' }]);
  await ops.access(file);
  await ops.readFile(file);
  await execFileAsync('bash', ['-c', 'printf "%s\\n" external > "$1"', 'bash', file]);

  await assert.rejects(() => ops.writeFile(file, 'ALPHA\n'), /changed during edit/i);
  assert.equal(await fs.readFile(file, 'utf8'), 'external\n');
});
