import test from 'node:test';
import assert from 'node:assert/strict';
import { renderBashText, renderEditPartial, renderEditText, renderPatchText, renderWriteText } from '../render.mjs';

function record(overrides = {}) {
  return {
    cwd: '/workspace/repo',
    exit_code: 0,
    output: '',
    output_bytes: 0,
    duration_ms: 1,
    timed_out: false,
    cancelled: false,
    truncated: false,
    spool_truncated: false,
    full_output_path: null,
    timeout_seconds: 30,
    ...overrides
  };
}

test('successful terminal output remains plain terminal text', () => {
  assert.equal(renderBashText(record({ output: ' M src/foo.ts\n' })), ' M src/foo.ts\n');
});

test('empty successful command gets a minimal acknowledgement', () => {
  assert.equal(renderBashText(record()), 'Command completed.');
});

test('non-zero exit appends only the meaningful status', () => {
  assert.equal(
    renderBashText(record({ exit_code: 1, output: 'Tests: 1 failed, 83 passed\n' })),
    'Tests: 1 failed, 83 passed\n[exit 1]'
  );
});

test('truncation points to the full output handle', () => {
  assert.equal(
    renderBashText(record({
      output: 'tail\n',
      truncated: true,
      full_output_path: '/state/dev/bash-a82f.log'
    })),
    'tail\n[truncated · full: /state/dev/bash-a82f.log]'
  );
});

test('capped retained output is labeled as partial rather than full', () => {
  assert.equal(
    renderBashText(record({
      output: 'tail\n',
      truncated: true,
      spool_truncated: true,
      full_output_path: '/state/dev/bash-capped.log'
    })),
    'tail\n[truncated · retained output capped · file: /state/dev/bash-capped.log]'
  );
});

test('timeout is rendered as a native exceptional annotation', () => {
  assert.equal(
    renderBashText(record({ timed_out: true, exit_code: null, timeout_seconds: 30 })),
    '[timed out after 30s]'
  );
});

test('edit renderer returns one path plus diff without Pi success prose', () => {
  const text = renderEditText('repo/src/foo.ts', '  old\n- value\n+ VALUE');
  assert.equal(text, 'repo/src/foo.ts\n  old\n- value\n+ VALUE');
  assert.doesNotMatch(text, /Successfully replaced|Done!/);
});



test('edit partial renderer distinguishes applied failed uncertain and unattempted targets', () => {
  const text = renderEditPartial({
    applied: ['a.txt'],
    failed: [{ path: 'b.txt', message: 'file changed since preflight; reread and reconcile' }],
    uncertain: [{ path: 'c.txt', message: 'write state unknown; reread target before retrying' }],
    unattempted: ['d.txt'],
  });
  assert.equal(text, [
    'EDIT_PARTIAL',
    'applied: a.txt',
    'failed: b.txt: file changed since preflight; reread and reconcile',
    'uncertain: c.txt: write state unknown; reread target before retrying',
    'unattempted: d.txt',
  ].join('\n'));
});

test('write renderer is a short creation acknowledgement', () => {
  assert.equal(renderWriteText('repo/src/new.ts'), 'Created repo/src/new.ts');
});

test('patch renderer returns a compact native multi-file diff summary', () => {
  const text = renderPatchText({
    changes: [
      { kind: 'update', path: 'src/a.ts', additions: 2, deletions: 1 },
      { kind: 'add', path: 'src/new.ts', additions: 3, deletions: 0 },
      { kind: 'delete', path: 'src/old.ts', additions: 0, deletions: 4 },
      { kind: 'move', path: 'src/from.ts', moveTo: 'src/to.ts', additions: 1, deletions: 1 }
    ]
  });
  assert.equal(
    text,
    'M src/a.ts (+2 -1)\nA src/new.ts (+3)\nD src/old.ts (-4)\nR src/from.ts -> src/to.ts (+1 -1)'
  );
  assert.doesNotMatch(text, /Begin Patch|Successfully|Done!/);
});

test('signal termination renders a meaningful native annotation', () => {
  assert.equal(
    renderBashText(record({ exit_code: null })),
    '[terminated]'
  );
});
