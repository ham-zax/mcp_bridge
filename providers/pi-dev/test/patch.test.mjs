import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  applyPatchPlan,
  applyUpdateHunks,
  parsePatch,
  preflightPatch,
  runPatch
} from '../patch.mjs';
import { runEdit, runWrite } from '../files.mjs';

const tempDir = prefix => fs.mkdtemp(path.join(os.tmpdir(), prefix));

function patch(...lines) {
  return lines.join('\n');
}

test('parser accepts update/add/delete and move operations in the Task 4 grammar', () => {
  const parsed = parsePatch(patch(
    '*** Begin Patch',
    '*** Update File: src/a.txt',
    '*** Move to: src/moved.txt',
    '@@',
    ' alpha',
    '-beta',
    '+BETA',
    ' gamma',
    '*** Add File: src/new.txt',
    '+new',
    '+file',
    '*** Delete File: src/old.txt',
    '*** End Patch'
  ));

  assert.equal(parsed.operations.length, 3);
  assert.deepEqual(parsed.operations[0], {
    type: 'update',
    path: 'src/a.txt',
    moveTo: 'src/moved.txt',
    hunks: [{
      lines: [
        { kind: 'context', text: 'alpha' },
        { kind: 'delete', text: 'beta' },
        { kind: 'add', text: 'BETA' },
        { kind: 'context', text: 'gamma' }
      ]
    }]
  });
  assert.deepEqual(parsed.operations[1], {
    type: 'add',
    path: 'src/new.txt',
    content: 'new\nfile\n'
  });
  assert.deepEqual(parsed.operations[2], { type: 'delete', path: 'src/old.txt' });
});

test('parser rejects an invalid begin header', () => {
  assert.throws(
    () => parsePatch('*** Start Patch\n*** End Patch'),
    /Begin Patch/i
  );
});

test('parser rejects a patch missing End Patch', () => {
  assert.throws(
    () => parsePatch(patch('*** Begin Patch', '*** Delete File: x.txt')),
    /End Patch/i
  );
});

test('parser rejects malformed update hunks rather than guessing', () => {
  assert.throws(
    () => parsePatch(patch(
      '*** Begin Patch',
      '*** Update File: x.txt',
      '@@',
      'alpha',
      '-beta',
      '+BETA',
      '*** End Patch'
    )),
    /hunk line.*prefix/i
  );
});

test('update hunks require exact context and reject missing matches', () => {
  const parsed = parsePatch(patch(
    '*** Begin Patch',
    '*** Update File: x.txt',
    '@@',
    ' alpha',
    '-beta',
    '+BETA',
    '*** End Patch'
  ));
  assert.throws(
    () => applyUpdateHunks('alpha\nother\n', parsed.operations[0].hunks),
    /context.*not found|mismatch/i
  );
});

test('update hunks reject ambiguous exact context', () => {
  const parsed = parsePatch(patch(
    '*** Begin Patch',
    '*** Update File: x.txt',
    '@@',
    '-same',
    '+changed',
    '*** End Patch'
  ));
  assert.throws(
    () => applyUpdateHunks('same\nother\nsame\n', parsed.operations[0].hunks),
    /ambiguous.*2/i
  );
});

test('multiple update hunks apply exactly and preserve CRLF style', () => {
  const parsed = parsePatch(patch(
    '*** Begin Patch',
    '*** Update File: x.txt',
    '@@',
    '-alpha',
    '+ALPHA',
    '@@',
    '-gamma',
    '+GAMMA',
    '*** End Patch'
  ));
  assert.equal(
    applyUpdateHunks('alpha\r\nbeta\r\ngamma\r\n', parsed.operations[0].hunks),
    'ALPHA\r\nbeta\r\nGAMMA\r\n'
  );
});

test('preflight refuses add over an existing path without mutating earlier targets', async () => {
  const defaultCwd = await tempDir('patch-preflight-add-');
  const first = path.join(defaultCwd, 'first.txt');
  const existing = path.join(defaultCwd, 'existing.txt');
  await fs.writeFile(first, 'alpha\n');
  await fs.writeFile(existing, 'keep\n');

  await assert.rejects(
    () => runPatch({
      pathMode: 'user',
      defaultCwd,
      patch: patch(
        '*** Begin Patch',
        '*** Update File: first.txt',
        '@@',
        '-alpha',
        '+ALPHA',
        '*** Add File: existing.txt',
        '+replacement',
        '*** End Patch'
      )
    }),
    /add.*already exists|existing.*exists/i
  );

  assert.equal(await fs.readFile(first, 'utf8'), 'alpha\n');
  assert.equal(await fs.readFile(existing, 'utf8'), 'keep\n');
});

test('preflight requires delete source to exist', async () => {
  const defaultCwd = await tempDir('patch-delete-missing-');
  await assert.rejects(
    () => runPatch({
      pathMode: 'user',
      defaultCwd,
      patch: patch('*** Begin Patch', '*** Delete File: missing.txt', '*** End Patch')
    }),
    /delete.*missing|ENOENT|no such file/i
  );
});

test('preflight refuses an existing move destination and preserves the source', async () => {
  const defaultCwd = await tempDir('patch-move-existing-');
  await fs.writeFile(path.join(defaultCwd, 'source.txt'), 'alpha\n');
  await fs.writeFile(path.join(defaultCwd, 'dest.txt'), 'dest\n');

  await assert.rejects(
    () => runPatch({
      pathMode: 'user',
      defaultCwd,
      patch: patch(
        '*** Begin Patch',
        '*** Update File: source.txt',
        '*** Move to: dest.txt',
        '@@',
        '-alpha',
        '+ALPHA',
        '*** End Patch'
      )
    }),
    /move.*destination.*exists|dest.*exists/i
  );

  assert.equal(await fs.readFile(path.join(defaultCwd, 'source.txt'), 'utf8'), 'alpha\n');
  assert.equal(await fs.readFile(path.join(defaultCwd, 'dest.txt'), 'utf8'), 'dest\n');
});

test('personal patch cwd uses Agent 1 user-path semantics for relative and absolute paths', async () => {
  const defaultCwd = await tempDir('patch-user-path-');
  const repo = path.join(defaultCwd, 'repo');
  await fs.mkdir(repo);
  await fs.writeFile(path.join(repo, 'relative.txt'), 'one\n');
  const absolute = path.join(defaultCwd, 'absolute.txt');
  await fs.writeFile(absolute, 'two\n');

  const result = await runPatch({
    pathMode: 'user',
    defaultCwd,
    cwd: 'repo',
    patch: patch(
      '*** Begin Patch',
      '*** Update File: relative.txt',
      '@@',
      '-one',
      '+ONE',
      `*** Update File: ${absolute}`,
      '@@',
      '-two',
      '+TWO',
      '*** End Patch'
    )
  });

  assert.equal(await fs.readFile(path.join(repo, 'relative.txt'), 'utf8'), 'ONE\n');
  assert.equal(await fs.readFile(absolute, 'utf8'), 'TWO\n');
  assert.deepEqual(result.changes.map(change => change.path), ['relative.txt', absolute]);
});

test('runPatch refuses workspace mode so public path semantics cannot gain patch implicitly', async () => {
  const workspaceRoot = await tempDir('patch-workspace-refusal-');
  await fs.writeFile(path.join(workspaceRoot, 'x.txt'), 'alpha\n');
  await assert.rejects(
    () => runPatch({
      pathMode: 'workspace',
      workspaceRoot,
      patch: patch(
        '*** Begin Patch',
        '*** Update File: x.txt',
        '@@',
        '-alpha',
        '+ALPHA',
        '*** End Patch'
      )
    }),
    /personal user path mode|pathMode.*user/i
  );
  assert.equal(await fs.readFile(path.join(workspaceRoot, 'x.txt'), 'utf8'), 'alpha\n');
});

test('snapshot conflict blocks update after preflight', async () => {
  const defaultCwd = await tempDir('patch-update-conflict-');
  const target = path.join(defaultCwd, 'x.txt');
  await fs.writeFile(target, 'alpha\n');
  const plan = await preflightPatch({
    pathMode: 'user',
    defaultCwd,
    patch: patch(
      '*** Begin Patch',
      '*** Update File: x.txt',
      '@@',
      '-alpha',
      '+ALPHA',
      '*** End Patch'
    )
  });
  await fs.writeFile(target, 'external\n');
  await assert.rejects(() => applyPatchPlan(plan), /changed since preflight|conflict/i);
  assert.equal(await fs.readFile(target, 'utf8'), 'external\n');
});

test('delete verifies the preflight snapshot immediately before unlink', async () => {
  const defaultCwd = await tempDir('patch-delete-conflict-');
  const target = path.join(defaultCwd, 'x.txt');
  await fs.writeFile(target, 'alpha\n');
  const plan = await preflightPatch({
    pathMode: 'user',
    defaultCwd,
    patch: patch('*** Begin Patch', '*** Delete File: x.txt', '*** End Patch')
  });
  await fs.writeFile(target, 'external\n');
  await assert.rejects(() => applyPatchPlan(plan), /changed since preflight|conflict/i);
  assert.equal(await fs.readFile(target, 'utf8'), 'external\n');
});

test('add keeps exclusive create semantics if destination appears after preflight', async () => {
  const defaultCwd = await tempDir('patch-add-race-');
  const target = path.join(defaultCwd, 'x.txt');
  const plan = await preflightPatch({
    pathMode: 'user',
    defaultCwd,
    patch: patch('*** Begin Patch', '*** Add File: x.txt', '+ours', '*** End Patch')
  });
  await fs.writeFile(target, 'external\n');
  await assert.rejects(() => applyPatchPlan(plan), /already exists|conflict|EEXIST/i);
  assert.equal(await fs.readFile(target, 'utf8'), 'external\n');
});

test('move rechecks exclusive destination and source snapshot before removal', async () => {
  const defaultCwd = await tempDir('patch-move-race-');
  const source = path.join(defaultCwd, 'source.txt');
  const destination = path.join(defaultCwd, 'dest.txt');
  await fs.writeFile(source, 'alpha\n');
  const plan = await preflightPatch({
    pathMode: 'user',
    defaultCwd,
    patch: patch(
      '*** Begin Patch',
      '*** Update File: source.txt',
      '*** Move to: dest.txt',
      '@@',
      '-alpha',
      '+ALPHA',
      '*** End Patch'
    )
  });
  await fs.writeFile(destination, 'external\n');
  await assert.rejects(() => applyPatchPlan(plan), /destination.*exists|conflict|EEXIST/i);
  assert.equal(await fs.readFile(source, 'utf8'), 'alpha\n');
  assert.equal(await fs.readFile(destination, 'utf8'), 'external\n');
});

test('successful patch applies update add delete and move plus update', async () => {
  const defaultCwd = await tempDir('patch-success-');
  await fs.writeFile(path.join(defaultCwd, 'update.txt'), 'alpha\nbeta\ngamma\n');
  await fs.writeFile(path.join(defaultCwd, 'delete.txt'), 'remove\n');
  await fs.writeFile(path.join(defaultCwd, 'move.txt'), 'old\n');

  const result = await runPatch({
    pathMode: 'user',
    defaultCwd,
    patch: patch(
      '*** Begin Patch',
      '*** Update File: update.txt',
      '@@',
      '-alpha',
      '+ALPHA',
      '@@',
      '-gamma',
      '+GAMMA',
      '*** Add File: add.txt',
      '+new',
      '+file',
      '*** Delete File: delete.txt',
      '*** Update File: move.txt',
      '*** Move to: moved.txt',
      '@@',
      '-old',
      '+NEW',
      '*** End Patch'
    )
  });

  assert.equal(await fs.readFile(path.join(defaultCwd, 'update.txt'), 'utf8'), 'ALPHA\nbeta\nGAMMA\n');
  assert.equal(await fs.readFile(path.join(defaultCwd, 'add.txt'), 'utf8'), 'new\nfile\n');
  await assert.rejects(() => fs.access(path.join(defaultCwd, 'delete.txt')));
  await assert.rejects(() => fs.access(path.join(defaultCwd, 'move.txt')));
  assert.equal(await fs.readFile(path.join(defaultCwd, 'moved.txt'), 'utf8'), 'NEW\n');
  assert.deepEqual(result.changes.map(change => change.kind), ['update', 'add', 'delete', 'move']);
});

test('unexpected failure after mutation reports completed changes and the failed target', async () => {
  const defaultCwd = await tempDir('patch-partial-');
  const first = path.join(defaultCwd, 'first.txt');
  const second = path.join(defaultCwd, 'second.txt');
  await fs.writeFile(first, 'one\n');
  await fs.writeFile(second, 'two\n');
  const plan = await preflightPatch({
    pathMode: 'user',
    defaultCwd,
    patch: patch(
      '*** Begin Patch',
      '*** Update File: first.txt',
      '@@',
      '-one',
      '+ONE',
      '*** Update File: second.txt',
      '@@',
      '-two',
      '+TWO',
      '*** End Patch'
    )
  });

  let writes = 0;
  await assert.rejects(
    () => applyPatchPlan(plan, {
      writeFile: async (target, content, options) => {
        writes += 1;
        if (writes === 2) {
          const error = new Error('simulated disk failure');
          error.code = 'EIO';
          throw error;
        }
        return fs.writeFile(target, content, options);
      }
    }),
    error => {
      assert.match(error.message, /partially applied/i);
      assert.match(error.message, /applied: update first\.txt/i);
      assert.match(error.message, /uncertain: update second\.txt write state unknown/i);
      assert.match(error.message, /failed: update second\.txt/i);
      assert.match(error.message, /simulated disk failure/i);
      return true;
    }
  );

  assert.equal(await fs.readFile(first, 'utf8'), 'ONE\n');
  assert.equal(await fs.readFile(second, 'utf8'), 'two\n');
});

test('first-operation write failure reports no confirmed application and an uncertain target', async () => {
  const defaultCwd = await tempDir('patch-uncertain-first-');
  const target = path.join(defaultCwd, 'x.txt');
  await fs.writeFile(target, 'alpha\n');
  const plan = await preflightPatch({
    pathMode: 'user',
    defaultCwd,
    patch: patch(
      '*** Begin Patch',
      '*** Update File: x.txt',
      '@@',
      '-alpha',
      '+ALPHA',
      '*** End Patch'
    )
  });

  await assert.rejects(
    () => applyPatchPlan(plan, {
      writeFile: async () => {
        const error = new Error('simulated uncertain write');
        error.code = 'EIO';
        throw error;
      }
    }),
    error => {
      assert.match(error.message, /partially applied/i);
      assert.match(error.message, /applied: none confirmed/i);
      assert.match(error.message, /uncertain: update x\.txt write state unknown/i);
      assert.match(error.message, /failed: update x\.txt/i);
      return true;
    }
  );

  assert.equal(await fs.readFile(target, 'utf8'), 'alpha\n');
});

test('multi-file patch reports partial application when a later snapshot becomes stale', async () => {
  const defaultCwd = await tempDir('patch-multifile-stale-');
  const first = path.join(defaultCwd, 'first.txt');
  const second = path.join(defaultCwd, 'second.txt');
  await fs.writeFile(first, 'one\n');
  await fs.writeFile(second, 'two\n');

  const plan = await preflightPatch({
    pathMode: 'user',
    defaultCwd,
    patch: patch(
      '*** Begin Patch',
      '*** Update File: first.txt',
      '@@',
      '-one',
      '+ONE',
      '*** Update File: second.txt',
      '@@',
      '-two',
      '+TWO',
      '*** End Patch'
    )
  });

  await fs.writeFile(second, 'EXTERNAL\n');
  await assert.rejects(
    () => applyPatchPlan(plan),
    error => {
      assert.equal(error.code, 'PATCH_PARTIAL');
      assert.match(error.message, /applied: update first\.txt/i);
      assert.match(error.message, /failed: update second\.txt/i);
      assert.match(error.message, /changed since preflight|reread and reconcile/i);
      return true;
    }
  );

  assert.equal(await fs.readFile(first, 'utf8'), 'ONE\n');
  assert.equal(await fs.readFile(second, 'utf8'), 'EXTERNAL\n');
});

test('concurrent personal mutations on disjoint paths do not interfere', async () => {
  const defaultCwd = await tempDir('patch-disjoint-agents-');
  await fs.writeFile(path.join(defaultCwd, 'edit.txt'), 'alpha\n');
  await fs.writeFile(path.join(defaultCwd, 'patch.txt'), 'beta\n');

  const settled = await Promise.allSettled([
    runEdit({
      pathMode: 'user',
      defaultCwd,
      path: 'edit.txt',
      edits: [{ oldText: 'alpha', newText: 'ALPHA' }]
    }),
    runPatch({
      pathMode: 'user',
      defaultCwd,
      patch: patch(
        '*** Begin Patch',
        '*** Update File: patch.txt',
        '@@',
        '-beta',
        '+BETA',
        '*** End Patch'
      )
    }),
    runWrite({ pathMode: 'user', defaultCwd, path: 'new.txt', content: 'NEW\n' })
  ]);

  assert.ok(settled.every(x => x.status === 'fulfilled'));
  assert.equal(await fs.readFile(path.join(defaultCwd, 'edit.txt'), 'utf8'), 'ALPHA\n');
  assert.equal(await fs.readFile(path.join(defaultCwd, 'patch.txt'), 'utf8'), 'BETA\n');
  assert.equal(await fs.readFile(path.join(defaultCwd, 'new.txt'), 'utf8'), 'NEW\n');
});

test.todo('CAS trigger: overlapping apply_patch calls on one snapshot must not both report success after one update is lost');
test.todo('CAS trigger: disjoint apply_patch updates to one file must preserve both changes or reject one actor');
test.todo('CAS trigger: apply_patch versus exact edit on one file must preserve both changes or reject one actor');
test.todo('CAS trigger: delete/update race must not report both operations as successful');
