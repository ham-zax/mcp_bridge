#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { renderConfig } from './render-config.mjs';

const PROVIDER_SOURCE_REF = 'e99579a';
const IMPLEMENTATION_BASELINE_REF = '41491ac';

function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) throw new Error(`invalid profile env line: ${raw}`);
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function replaceStrings(value, replacements) {
  if (typeof value === 'string') {
    let out = value;
    for (const [token, replacement] of Object.entries(replacements)) out = out.split(token).join(replacement);
    return out;
  }
  if (Array.isArray(value)) return value.map((item) => replaceStrings(item, replacements));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceStrings(item, replacements)]));
  }
  return value;
}

function gitShow(repoRoot, spec) {
  return execFileSync('git', ['-C', repoRoot, 'show', spec], { encoding: 'utf8' });
}

async function atomicJson(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await fs.chmod(tmp, 0o600);
  await fs.rename(tmp, file);
}

export async function renderEvaluationAb({ profile, envFile, stateDir, repoRoot }) {
  const rendered = await renderConfig({ profile, envFile, stateDir, repoRoot });
  const current = JSON.parse(await fs.readFile(rendered.configPath, 'utf8'));
  const baselineTemplate = JSON.parse(gitShow(repoRoot, `${PROVIDER_SOURCE_REF}:config/templates/mcp.json`));
  const baselineProfile = parseEnv(gitShow(repoRoot, `${PROVIDER_SOURCE_REF}:config/profiles/${profile}.env`));
  const dev = current.mcpServers?.dev;
  if (!dev) throw new Error('current renderer did not produce dev provider');
  if (!baselineTemplate.mcpServers?.filesystem || !baselineTemplate.mcpServers?.shell) {
    throw new Error('A/B source ref is missing filesystem or shell provider');
  }

  const historical = replaceStrings(baselineTemplate, {
    __WORKSPACE_ROOT__: dev.env.MCP_DEV_WORKSPACE_ROOT,
    __REPO_ROOT__: path.resolve(repoRoot),
    __SHELL_ALLOW_COMMANDS__: baselineProfile.MCP_SHELL_ALLOW_COMMANDS ?? '',
    __SHELL_ALLOW_PATTERNS__: baselineProfile.MCP_SHELL_ALLOW_PATTERNS ?? '',
    __SHELL_ALLOW_DANGEROUS__: baselineProfile.MCP_SHELL_ALLOW_DANGEROUS ?? '',
    __SHELL_MODE__: baselineProfile.MCP_SHELL_MODE ?? '',
    __DEV_STATE_DIR__: dev.env.MCP_DEV_STATE_DIR,
    __DEV_MAX_OUTPUT_BYTES__: dev.env.MCP_DEV_MAX_OUTPUT_BYTES,
  });

  current.mcpServers.filesystem = historical.mcpServers.filesystem;
  current.mcpServers.shell = historical.mcpServers.shell;
  await atomicJson(rendered.configPath, current);

  const metadataPath = path.join(rendered.stateDir, 'evaluation-ab.json');
  await atomicJson(metadataPath, {
    kind: 'temporary-provider-ab',
    provider_source_ref: PROVIDER_SOURCE_REF,
    implementation_baseline_ref: IMPLEMENTATION_BASELINE_REF,
    rendering_head: execFileSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    profile,
    providers: Object.keys(current.mcpServers).sort(),
  });
  return { ...rendered, metadataPath };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (['--profile', '--env-file', '--state-dir', '--repo-root'].includes(arg)) {
      const value = argv[++i];
      if (!value) throw new Error(`missing value for ${arg}`);
      out[arg.slice(2)] = value;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return out;
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (!args.profile) throw new Error('--profile is required');
    const result = await renderEvaluationAb({
      profile: args.profile,
      envFile: args['env-file'],
      stateDir: args['state-dir'],
      repoRoot: path.resolve(args['repo-root'] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..')),
    });
    console.log(`A/B config: ${result.configPath}`);
    console.log(`A/B metadata: ${result.metadataPath}`);
  } catch (error) {
    console.error(`render-evaluation-ab: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
