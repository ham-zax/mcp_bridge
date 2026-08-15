#!/usr/bin/env node
import readline from 'node:readline';

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let frames = 0;
let fullFrames = 0;
let deltaFrames = 0;
let closed = 0;
let ansiBytes = 0;
let base64Chars = 0;
let escapeBytes = 0;
let printableBytes = 0;
let controlBytes = 0;
let minSeq = null;
let maxSeq = null;
const dimensions = new Set();
const closeReasons = [];

for await (const line of rl) {
  if (!line.trim()) continue;
  const record = JSON.parse(line);
  if (record.type === 'terminal.closed') {
    closed += 1;
    if (record.reason) closeReasons.push(record.reason);
    continue;
  }
  if (record.type !== 'terminal.frame') continue;
  frames += 1;
  if (record.full === true) fullFrames += 1;
  else deltaFrames += 1;
  dimensions.add(`${record.width}x${record.height}`);
  if (Number.isInteger(record.seq)) {
    minSeq = minSeq === null ? record.seq : Math.min(minSeq, record.seq);
    maxSeq = maxSeq === null ? record.seq : Math.max(maxSeq, record.seq);
  }
  const encoded = record.bytes || '';
  base64Chars += encoded.length;
  const bytes = Buffer.from(encoded, 'base64');
  ansiBytes += bytes.length;
  for (const byte of bytes) {
    if (byte === 0x1b) escapeBytes += 1;
    if (byte === 0x09 || byte === 0x0a || byte === 0x0d || (byte >= 0x20 && byte <= 0x7e)) {
      printableBytes += 1;
    } else {
      controlBytes += 1;
    }
  }
}

console.log(JSON.stringify({
  frames,
  fullFrames,
  deltaFrames,
  closed,
  seq: { min: minSeq, max: maxSeq },
  dimensions: [...dimensions],
  base64Chars,
  ansiBytes,
  escapeBytes,
  printableBytes,
  controlBytes,
  printableRatio: ansiBytes === 0 ? 0 : printableBytes / ansiBytes,
  closeReasons,
}, null, 2));
