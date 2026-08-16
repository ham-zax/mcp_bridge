import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const providerRequire = createRequire(path.join(root, 'providers/pi-dev/package.json'));
const { Client } = await import(pathToFileURL(providerRequire.resolve('@modelcontextprotocol/sdk/client/index.js')).href);
const { StdioClientTransport } = await import(pathToFileURL(providerRequire.resolve('@modelcontextprotocol/sdk/client/stdio.js')).href);
const configPath = process.argv[2] ?? path.join(process.env.HOME, '.local/state/mcp-dev-bridge/1mcp/mcp.json');
const outputPath = process.argv[3] ?? path.join(root, 'docs/history/benchmarks/2026-08-16-edit-v2-current-main-a0.json');
const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
const localEntrypoints = {
  dev: path.join(root, 'providers/pi-dev/server.mjs'),
  code: path.join(root, 'providers/code-router/server.mjs'),
  terminal: path.join(root, 'providers/terminal/mcp-server.mjs'),
};

function normalizedTools(tools) {
  return tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
}

async function captureProvider(name) {
  const spec = config.mcpServers?.[name];
  if (!spec) throw new Error(`missing ${name} in ${configPath}`);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [localEntrypoints[name]],
    env: { ...process.env, ...(spec.env ?? {}) },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'edit-v2-a0-capture', version: '1.0.0' });
  await client.connect(transport);
  try {
    const listed = await client.listTools();
    const tools = normalizedTools(listed.tools);
    const perTool = tools.map(tool => {
      const json = JSON.stringify(tool);
      return { name: tool.name, bytes: Buffer.byteLength(json), tool };
    });
    const normalizedJson = JSON.stringify(tools);
    return {
      serverVersion: client.getServerVersion?.() ?? null,
      serverCapabilities: client.getServerCapabilities?.() ?? null,
      count: tools.length,
      normalizedBytes: Buffer.byteLength(normalizedJson),
      perTool,
      tools,
    };
  } finally {
    await client.close();
  }
}

const result = {
  formatVersion: 1,
  capturedAt: new Date().toISOString(),
  modelFacingBaselineSha: execFileSync('git', ['rev-parse', '9098c9f^{commit}'], { cwd: root, encoding: 'utf8' }).trim(),
  captureWorktreeHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  captureBranch: execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim(),
  repositoryRoot: '<repository-root>',
  configSource: '<local-personal-rendered-config>',
  nodeVersion: process.version,
  providers: {},
};
for (const name of ['dev', 'code', 'terminal']) result.providers[name] = await captureProvider(name);
result.totalNormalizedBytes = Object.values(result.providers).reduce((sum, provider) => sum + provider.normalizedBytes, 0);
const edit = result.providers.dev.tools.find(tool => tool.name === 'edit');
result.editV1 = edit ? { description: edit.description, inputSchema: edit.inputSchema, normalizedBytes: Buffer.byteLength(JSON.stringify(edit)) } : null;
await fs.writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(outputPath);
