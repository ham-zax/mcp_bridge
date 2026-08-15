import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { RepoChildPool } from '../pool.mjs';
import { CodeRouter } from '../server.mjs';

const execFileAsync = promisify(execFile);

async function gitRepo(t, prefix) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await execFileAsync('git', ['-C', root, 'init', '-q']);
  return fs.realpath(root);
}

function recordingFactory() {
  let next = 0;
  const children = [];
  const factory = async root => {
    const id = ++next;
    let alive = true;
    const child = {
      root,
      pid: 20000 + id,
      get alive() { return alive; },
      async callTool(name, args) { return { id, root, name, args }; },
      async close() { alive = false; }
    };
    children.push(child);
    return child;
  };
  return { factory, children };
}

test('routes nested cwd calls to one canonical rooted child and returns the chosen root', async t => {
  const root = await gitRepo(t, 'code-router-server-');
  const one = path.join(root, 'src', 'one');
  const two = path.join(root, 'src', 'two');
  await fs.mkdir(one, { recursive: true });
  await fs.mkdir(two, { recursive: true });
  const { factory, children } = recordingFactory();
  const pool = new RepoChildPool({ childFactory: factory });
  const router = new CodeRouter({ pool });
  t.after(() => router.shutdown());

  const first = await router.call({ cwd: one, tool: 'codedb_status', arguments: {} });
  const second = await router.call({ cwd: two, tool: 'codedb_search', arguments: { query: 'x' } });

  assert.equal(first.repoRoot, root);
  assert.equal(second.repoRoot, root);
  assert.equal(first.result.id, second.result.id);
  assert.equal(children.length, 1);
});

test('routes different repositories to independent children', async t => {
  const rootA = await gitRepo(t, 'code-router-server-a-');
  const rootB = await gitRepo(t, 'code-router-server-b-');
  const { factory } = recordingFactory();
  const pool = new RepoChildPool({ childFactory: factory });
  const router = new CodeRouter({ pool });
  t.after(() => router.shutdown());

  const [a, b] = await Promise.all([
    router.call({ cwd: rootA, tool: 'codedb_status', arguments: {} }),
    router.call({ cwd: rootB, tool: 'codedb_status', arguments: {} })
  ]);

  assert.notEqual(a.result.id, b.result.id);
  assert.equal(router.inspect().length, 2);
});

test('outside a Git repository preserves explicit NO_REPOSITORY', async t => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'code-router-server-none-'));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  const { factory } = recordingFactory();
  const router = new CodeRouter({ pool: new RepoChildPool({ childFactory: factory }) });
  t.after(() => router.shutdown());

  await assert.rejects(
    () => router.call({ cwd, tool: 'codedb_status', arguments: {} }),
    error => error.code === 'NO_REPOSITORY'
  );
  assert.equal(router.inspect().length, 0);
});

test('failed root discovery prunes an already-active repository that disappeared', async t => {
  const root = await gitRepo(t, 'code-router-server-gone-');
  const { factory, children } = recordingFactory();
  const pool = new RepoChildPool({ childFactory: factory });
  const router = new CodeRouter({ pool });
  t.after(() => router.shutdown());

  await router.call({ cwd: root, tool: 'codedb_status', arguments: {} });
  assert.equal(router.inspect().length, 1);
  await fs.rm(root, { recursive: true, force: true });

  await assert.rejects(() => router.call({ cwd: root, tool: 'codedb_status', arguments: {} }));
  assert.equal(router.inspect().length, 0);
  assert.equal(children[0].alive, false);
});

test('losing Git repository identity reaps the rooted child even when the directory survives', async t => {
  const root = await gitRepo(t, 'code-router-server-no-git-');
  const { factory, children } = recordingFactory();
  const pool = new RepoChildPool({ childFactory: factory });
  const router = new CodeRouter({ pool });
  t.after(() => router.shutdown());

  await router.call({ cwd: root, tool: 'codedb_status', arguments: {} });
  await fs.rm(path.join(root, '.git'), { recursive: true, force: true });

  await assert.rejects(
    () => router.call({ cwd: root, tool: 'codedb_status', arguments: {} }),
    error => error.code === 'NO_REPOSITORY'
  );
  assert.equal(router.inspect().length, 0);
  assert.equal(children[0].alive, false);
});

test('shutdown closes the pool and rejects later routed work', async t => {
  const root = await gitRepo(t, 'code-router-server-close-');
  const { factory, children } = recordingFactory();
  const router = new CodeRouter({ pool: new RepoChildPool({ childFactory: factory }) });

  await router.call({ cwd: root, tool: 'codedb_status', arguments: {} });
  await router.shutdown();

  assert.equal(children[0].alive, false);
  assert.equal(router.inspect().length, 0);
  await assert.rejects(
    () => router.call({ cwd: root, tool: 'codedb_status', arguments: {} }),
    error => error.code === 'ROUTER_CLOSED'
  );
});
