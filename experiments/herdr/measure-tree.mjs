#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

function parsePid(value) {
  const pid = Number(value);
  if (!Number.isInteger(pid) || pid <= 0) throw new Error(`invalid pid: ${value}`);
  return pid;
}

async function readText(file) {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ESRCH') return null;
    throw error;
  }
}

async function childrenOf(pid) {
  const raw = await readText(`/proc/${pid}/task/${pid}/children`);
  if (!raw) return [];
  return raw.trim().split(/\s+/).filter(Boolean).map(Number);
}

async function collectTree(roots) {
  const seen = new Set();
  const queue = [...roots];
  while (queue.length) {
    const pid = queue.shift();
    if (seen.has(pid)) continue;
    seen.add(pid);
    for (const child of await childrenOf(pid)) queue.push(child);
  }
  return [...seen].sort((a, b) => a - b);
}

function fieldKb(text, name) {
  const match = text?.match(new RegExp(`^${name}:\\s+(\\d+)\\s+kB$`, 'm'));
  return match ? Number(match[1]) : 0;
}

function cpuTicks(statText) {
  if (!statText) return 0;
  const end = statText.lastIndexOf(')');
  if (end < 0) return 0;
  const fields = statText.slice(end + 2).trim().split(/\s+/);
  // fields[0] is /proc stat field 3 (state); utime/stime are fields 14/15.
  return Number(fields[11] || 0) + Number(fields[12] || 0);
}

const roots = process.argv.slice(2).map(parsePid);
if (roots.length === 0) {
  console.error('usage: measure-tree.mjs <pid> [pid ...]');
  process.exit(64);
}

const hzResult = spawnSync('getconf', ['CLK_TCK'], { encoding: 'utf8' });
const clockTicksPerSecond = Number(hzResult.stdout.trim()) || 100;
const pids = await collectTree(roots);
const processes = [];
let rssKb = 0;
let pssKb = 0;
let ticks = 0;

for (const pid of pids) {
  const [status, smaps, stat, cmdlineRaw] = await Promise.all([
    readText(`/proc/${pid}/status`),
    readText(`/proc/${pid}/smaps_rollup`),
    readText(`/proc/${pid}/stat`),
    readText(`/proc/${pid}/cmdline`),
  ]);
  if (!status || !stat) continue;
  const procRss = fieldKb(status, 'VmRSS');
  const procPss = fieldKb(smaps, 'Pss');
  const procTicks = cpuTicks(stat);
  rssKb += procRss;
  pssKb += procPss;
  ticks += procTicks;
  processes.push({
    pid,
    rssKb: procRss,
    pssKb: procPss,
    cpuSeconds: procTicks / clockTicksPerSecond,
    command: (cmdlineRaw || '').split('\0').filter(Boolean).join(' '),
  });
}

console.log(JSON.stringify({
  roots,
  pids: processes.map((entry) => entry.pid),
  processCount: processes.length,
  rssKb,
  pssKb,
  cpuSeconds: ticks / clockTicksPerSecond,
  processes,
}, null, 2));
