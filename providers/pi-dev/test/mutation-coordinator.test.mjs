import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { withMutationPath, withMutationPaths } from '../mutation-coordinator.mjs';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function withTimeout(promise, ms = 500) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

test('same canonical path mutation critical sections do not overlap', async () => {
  let active = 0;
  let maxActive = 0;

  const run = () => withMutationPath('/tmp/shared.txt', async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await delay(10);
    active -= 1;
  });

  await Promise.all([run(), run(), run()]);
  assert.equal(maxActive, 1);
});

test('different canonical paths may execute concurrently', async () => {
  let entered = 0;
  let release;
  const bothEntered = new Promise(resolve => { release = resolve; });

  const run = target => withMutationPath(target, async () => {
    entered += 1;
    if (entered === 2) release();
    await bothEntered;
  });

  await withTimeout(Promise.all([
    run('/tmp/a.txt'),
    run('/tmp/b.txt')
  ]));
  assert.equal(entered, 2);
});

test('missing targets through symlinked parent aliases share one canonical lease', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mutation-coordinator-alias-'));
  const realDir = path.join(root, 'real');
  const aliasDir = path.join(root, 'alias');
  await fs.mkdir(realDir);
  await fs.symlink(realDir, aliasDir);

  let active = 0;
  let maxActive = 0;
  const run = target => withMutationPath(target, async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await delay(10);
    active -= 1;
  });

  await Promise.all([
    run(path.join(realDir, 'new.txt')),
    run(path.join(aliasDir, 'new.txt'))
  ]);
  assert.equal(maxActive, 1);
});

test('multiple-path acquisition uses stable ordering and does not deadlock', async () => {
  let active = 0;
  let maxActive = 0;

  const first = withMutationPaths(['/tmp/b.txt', '/tmp/a.txt'], async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await delay(10);
    active -= 1;
  });
  const second = withMutationPaths(['/tmp/a.txt', '/tmp/b.txt'], async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await delay(10);
    active -= 1;
  });

  await withTimeout(Promise.all([first, second]));
  assert.equal(maxActive, 1);
});

test('leases release after success and thrown failure', async () => {
  await assert.rejects(
    () => withMutationPath('/tmp/release.txt', async () => {
      throw new Error('expected failure');
    }),
    /expected failure/
  );

  let entered = false;
  await withTimeout(withMutationPath('/tmp/release.txt', async () => {
    entered = true;
  }));
  assert.equal(entered, true);
});
