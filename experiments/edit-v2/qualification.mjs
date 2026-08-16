import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const v2Root = path.resolve(here, '../..');
const controlRoot = path.resolve(process.argv[2] ?? path.join(v2Root, '../edit-v2-a0-control'));
const outputPath = path.resolve(process.argv[3] ?? path.join(v2Root, 'docs/history/benchmarks/2026-08-16-edit-v2-qualification.json'));

const controlFiles = await import(pathToFileURL(path.join(controlRoot, 'providers/pi-dev/files.mjs')).href);
const controlPatch = await import(pathToFileURL(path.join(controlRoot, 'providers/pi-dev/patch.mjs')).href);
const controlRender = await import(pathToFileURL(path.join(controlRoot, 'providers/pi-dev/render.mjs')).href);
const v2Files = await import(pathToFileURL(path.join(v2Root, 'providers/pi-dev/files.mjs')).href);
const v2Render = await import(pathToFileURL(path.join(v2Root, 'providers/pi-dev/render.mjs')).href);

function generatedTargets(count) {
  return Array.from({ length: count }, (_, i) => ({
    path: `f${String(i + 1).padStart(2, '0')}.txt`,
    initial: `value-${i + 1}\n`,
    edits: [{ oldText: `value-${i + 1}`, newText: `VALUE-${i + 1}` }],
    expected: `VALUE-${i + 1}\n`,
  }));
}

const workloads = [
  { name: 'one-target-one-edit', targets: generatedTargets(1) },
  {
    name: 'one-target-multiple-edits',
    targets: [{
      path: 'multi.txt', initial: 'alpha\nbeta\ngamma\n',
      edits: [{ oldText: 'alpha', newText: 'ALPHA' }, { oldText: 'gamma', newText: 'GAMMA' }],
      expected: 'ALPHA\nbeta\nGAMMA\n',
    }],
  },
  { name: 'two-targets', targets: generatedTargets(2) },
  { name: 'six-targets', targets: generatedTargets(6) },
  { name: 'thirty-two-targets', targets: generatedTargets(32) },
  {
    name: 'exact-removal',
    targets: [{
      path: 'remove.txt', initial: 'alpha\nremove-me\ngamma\n',
      edits: [{ oldText: 'remove-me\n', newText: '' }],
      expected: 'alpha\ngamma\n',
    }],
  },
  {
    name: 'crlf',
    targets: [{
      path: 'crlf.txt', initial: 'alpha\r\nbeta\r\n',
      edits: [{ oldText: 'alpha\n', newText: 'ALPHA\n' }],
      expected: 'ALPHA\r\nbeta\r\n',
    }],
  },
  {
    name: 'bom-preserved',
    targets: [{
      path: 'bom.txt', initial: '\ufeffalpha\nbeta\n',
      edits: [{ oldText: 'beta', newText: 'BETA' }],
      expected: '\ufeffalpha\nBETA\n',
    }],
  },
];

function targetArgs(target) {
  return { path: target.path, edits: target.edits.map(edit => ({ ...edit })) };
}

function textLines(value) {
  const normalized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const withoutFinal = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized;
  return withoutFinal === '' ? [] : withoutFinal.split('\n');
}

function patchFor(targets) {
  const lines = ['*** Begin Patch'];
  for (const target of targets) {
    lines.push(`*** Update File: ${target.path}`);
    for (const edit of target.edits) {
      lines.push('@@');
      for (const line of textLines(edit.oldText)) lines.push(`-${line}`);
      for (const line of textLines(edit.newText)) lines.push(`+${line}`);
    }
  }
  lines.push('*** End Patch');
  return lines.join('\n');
}

async function fixture(workload, prefix) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `edit-v2-${prefix}-`));
  for (const target of workload.targets) {
    await fs.writeFile(path.join(dir, target.path), target.initial, 'utf8');
  }
  return dir;
}

async function correctness(dir, workload) {
  const mismatches = [];
  for (const target of workload.targets) {
    const actual = await fs.readFile(path.join(dir, target.path), 'utf8');
    if (actual !== target.expected) mismatches.push({ path: target.path, expected: target.expected, actual });
  }
  return { correct: mismatches.length === 0, mismatches };
}

function toolEnvelope(name, args) {
  return JSON.stringify({ name, arguments: args });
}

async function measureStrategy(workload, strategy) {
  const dir = await fixture(workload, `${workload.name}-${strategy}`);
  const requests = [];
  const results = [];
  let calls = 0;
  let error = null;
  const rssBefore = process.memoryUsage().rss;
  const started = performance.now();
  try {
    if (strategy === 'A0a-edit-v1') {
      for (const target of workload.targets) {
        const args = { path: target.path, edits: target.edits };
        requests.push(toolEnvelope('edit', args));
        calls += 1;
        const result = await controlFiles.runEdit({ pathMode: 'user', defaultCwd: dir, ...args });
        results.push(controlRender.renderEditText(target.path, result.details?.diff));
      }
    } else if (strategy === 'A0b-apply-patch') {
      const patch = patchFor(workload.targets);
      const args = { patch };
      requests.push(toolEnvelope('apply_patch', args));
      calls = 1;
      const result = await controlPatch.runPatch({ pathMode: 'user', defaultCwd: dir, patch });
      results.push(controlRender.renderPatchText(result));
    } else if (strategy === 'A1-edit-v2') {
      const args = { targets: workload.targets.map(targetArgs) };
      requests.push(toolEnvelope('edit', args));
      calls = 1;
      const result = await v2Files.runEdit({ pathMode: 'user', defaultCwd: dir, ...args });
      results.push(result.targets.length === 1
        ? v2Render.renderEditText(result.targets[0].path, result.targets[0].diff)
        : result.targets.map(target => `M ${target.path}`).join('\n'));
    } else {
      throw new Error(`unknown strategy ${strategy}`);
    }
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }
  const wallMs = performance.now() - started;
  const rssAfter = process.memoryUsage().rss;
  const checked = await correctness(dir, workload);
  await fs.rm(dir, { recursive: true, force: true });
  return {
    strategy,
    calls,
    firstAttemptSuccess: error === null,
    correct: checked.correct,
    mismatches: checked.mismatches,
    error,
    requestBytes: requests.reduce((sum, value) => sum + Buffer.byteLength(value), 0),
    resultBytes: results.reduce((sum, value) => sum + Buffer.byteLength(value), 0),
    requestTexts: requests,
    resultTexts: results,
    wallMs,
    rssDeltaBytes: rssAfter - rssBefore,
  };
}

function tokenCounts(strings) {
  if (strings.length === 0) return [];
  const code = [
    'import json,sys,tiktoken',
    'xs=json.load(sys.stdin)',
    "enc=tiktoken.get_encoding('o200k_base')",
    'print(json.dumps([len(enc.encode(x)) for x in xs]))',
  ].join(';');
  const child = spawnSync('uv', ['run', '--quiet', '--with', 'tiktoken==0.13.0', 'python', '-c', code], {
    input: JSON.stringify(strings), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
  if (child.status !== 0) throw new Error(`token estimator failed: ${child.stderr}`);
  return JSON.parse(child.stdout);
}

async function concurrencySafety(strategy) {
  const workload = { name: 'conflict', targets: [{ path: 'x.txt', initial: 'alpha\n', edits: [], expected: '' }] };
  const dir = await fixture(workload, `conflict-${strategy}`);
  let operations;
  if (strategy === 'A0a-edit-v1') {
    operations = [
      controlFiles.runEdit({ pathMode: 'user', defaultCwd: dir, path: 'x.txt', edits: [{ oldText: 'alpha', newText: 'ONE' }] }),
      controlFiles.runEdit({ pathMode: 'user', defaultCwd: dir, path: 'x.txt', edits: [{ oldText: 'alpha', newText: 'TWO' }] }),
    ];
  } else if (strategy === 'A0b-apply-patch') {
    operations = ['ONE', 'TWO'].map(value => controlPatch.runPatch({
      pathMode: 'user', defaultCwd: dir,
      patch: ['*** Begin Patch', '*** Update File: x.txt', '@@', '-alpha', `+${value}`, '*** End Patch'].join('\n'),
    }));
  } else {
    operations = ['ONE', 'TWO'].map(value => v2Files.runEdit({
      pathMode: 'user', defaultCwd: dir,
      targets: [{ path: 'x.txt', edits: [{ oldText: 'alpha', newText: value }] }],
    }));
  }
  const settled = await Promise.allSettled(operations);
  const final = await fs.readFile(path.join(dir, 'x.txt'), 'utf8');
  await fs.rm(dir, { recursive: true, force: true });
  return {
    fulfilled: settled.filter(item => item.status === 'fulfilled').length,
    rejected: settled.filter(item => item.status === 'rejected').length,
    final,
    safe: settled.filter(item => item.status === 'fulfilled').length === 1 && ['ONE\n', 'TWO\n'].includes(final),
  };
}

async function cancellationSafety(strategy) {
  const workload = { name: 'cancel', targets: [{ path: 'x.txt', initial: 'alpha\n', edits: [], expected: 'alpha\n' }] };
  const dir = await fixture(workload, `cancel-${strategy}`);
  const controller = new AbortController();
  controller.abort();
  let rejected = false;
  let message = null;
  try {
    if (strategy === 'A0a-edit-v1') {
      await controlFiles.runEdit({ pathMode: 'user', defaultCwd: dir, path: 'x.txt', edits: [{ oldText: 'alpha', newText: 'ONE' }] }, controller.signal);
    } else if (strategy === 'A0b-apply-patch') {
      await controlPatch.runPatch({
        pathMode: 'user', defaultCwd: dir,
        patch: ['*** Begin Patch', '*** Update File: x.txt', '@@', '-alpha', '+ONE', '*** End Patch'].join('\n'),
      }, controller.signal);
    } else {
      await v2Files.runEdit({ pathMode: 'user', defaultCwd: dir, targets: [{ path: 'x.txt', edits: [{ oldText: 'alpha', newText: 'ONE' }] }] }, controller.signal);
    }
  } catch (error) {
    rejected = true;
    message = error instanceof Error ? error.message : String(error);
  }
  const final = await fs.readFile(path.join(dir, 'x.txt'), 'utf8');
  await fs.rm(dir, { recursive: true, force: true });
  return { rejected, message, final, safe: rejected && final === 'alpha\n' };
}

const strategies = ['A0a-edit-v1', 'A0b-apply-patch', 'A1-edit-v2'];
const measurements = [];
for (const workload of workloads) {
  for (const strategy of strategies) {
    measurements.push({ workload: workload.name, ...(await measureStrategy(workload, strategy)) });
  }
}

const allTexts = measurements.flatMap(item => [...item.requestTexts, ...item.resultTexts]);
const counts = tokenCounts(allTexts);
let cursor = 0;
for (const item of measurements) {
  const reqCount = item.requestTexts.length;
  item.requestTokens = counts.slice(cursor, cursor + reqCount).reduce((a, b) => a + b, 0);
  cursor += reqCount;
  const resCount = item.resultTexts.length;
  item.resultTokens = counts.slice(cursor, cursor + resCount).reduce((a, b) => a + b, 0);
  cursor += resCount;
  item.totalVisibleTokens = item.requestTokens + item.resultTokens;
  delete item.requestTexts;
  delete item.resultTexts;
}

const safety = {};
for (const strategy of strategies) {
  safety[strategy] = {
    conflict: await concurrencySafety(strategy),
    cancellation: await cancellationSafety(strategy),
  };
}

const output = {
  formatVersion: 1,
  generatedAt: new Date().toISOString(),
  controlSha: '9098c9fcc9088d3ddf31e30f7df2a9b18a86c1b1',
  v2Head: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: v2Root, encoding: 'utf8' }).stdout.trim(),
  methodology: {
    kind: 'deterministic offline capability mechanics; not causal model-routing evidence',
    requestMeasurement: 'UTF-8 bytes/tokens of compact JSON {name,arguments} envelopes',
    resultMeasurement: 'UTF-8 bytes/tokens of native rendered TextContent-equivalent strings',
    tokenizer: 'tiktoken 0.13.0 o200k_base via uv',
    applyPatchFairness: 'minimal exact-context update hunks generated directly from the same known old/new replacements',
    lockHoldDurationMs: null,
    lockHoldNote: 'not directly instrumented to avoid changing production locking solely for benchmarking',
  },
  workloads: workloads.map(w => ({ name: w.name, targetCount: w.targets.length, editCount: w.targets.reduce((n, t) => n + t.edits.length, 0) })),
  measurements,
  safety,
};
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(outputPath);
for (const workload of workloads) {
  console.log(`\n${workload.name}`);
  for (const item of measurements.filter(m => m.workload === workload.name)) {
    console.log(`${item.strategy}: ok=${item.firstAttemptSuccess && item.correct} calls=${item.calls} req=${item.requestTokens}tok res=${item.resultTokens}tok total=${item.totalVisibleTokens}tok wall=${item.wallMs.toFixed(2)}ms rss=${item.rssDeltaBytes}`);
    if (item.error) console.log(`  error=${item.error.split('\n')[0]}`);
  }
}
console.log('\nsafety', JSON.stringify(safety, null, 2));
