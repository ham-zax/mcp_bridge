#!/usr/bin/env node
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { appendTranscript, ensureTranscript, readTranscript } from '../../providers/terminal/transcript.mjs';

const budgetBytes = 16 * 1024 * 1024;
const dir = await mkdtemp(path.join(os.tmpdir(), 'herdr-hybrid-cursor-'));
const input = await readFile('/dev/stdin', 'utf8');
let frames = 0;
let fullFrames = 0;
let deltaFrames = 0;
let sourceBytes = 0;

try {
  await ensureTranscript(dir, { budgetBytes });
  for (const line of input.split('\n')) {
    if (!line.trim()) continue;
    const record = JSON.parse(line);
    if (record.type !== 'terminal.frame') continue;
    const bytes = Buffer.from(record.bytes || '', 'base64');
    frames += 1;
    if (record.full === true) fullFrames += 1;
    else deltaFrames += 1;
    sourceBytes += bytes.length;
    await appendTranscript(dir, bytes, { budgetBytes });
  }

  let cursor = 0;
  let text = '';
  let finalRead;
  while (true) {
    finalRead = await readTranscript(dir, { cursor, maxBytes: 65536 });
    text += finalRead.text;
    cursor = finalRead.nextCursor;
    if (cursor >= finalRead.endOffset) break;
  }

  const ansiEscapeCount = (text.match(/\x1b/g) || []).length;
  const csiLikeCount = (text.match(/\x1b\[[0-9;?]*[ -/]*[@-~]/g) || []).length;
  const roughStripped = text
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');

  console.log(JSON.stringify({
    prototype: 'our transcript cursor over Herdr terminal.frame ANSI bytes',
    frames,
    fullFrames,
    deltaFrames,
    sourceBytes,
    cursor: {
      baseOffset: finalRead.baseOffset,
      endOffset: finalRead.endOffset,
      nextCursor: cursor,
      monotonic: cursor === sourceBytes,
    },
    modelFacingIfUsedDirectly: {
      utf8Bytes: Buffer.byteLength(text),
      ansiEscapeCount,
      csiLikeCount,
      roughStrippedBytes: Buffer.byteLength(roughStripped),
      containsRenderedTerminalControl: ansiEscapeCount > 0,
    },
  }, null, 2));
} finally {
  await rm(dir, { recursive: true, force: true });
}
