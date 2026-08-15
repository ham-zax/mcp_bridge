import { CodeDbChild, defaultCodeDbBin, verifyCodeDbBinary } from './codedb-child.mjs';
import { RepoChildPool } from './pool.mjs';
import { resolveRepoRoot } from './repo-root.mjs';

function routerError(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  return error;
}

export class CodeRouter {
  constructor({ pool, resolveRoot = resolveRepoRoot } = {}) {
    if (!pool) throw new TypeError('pool is required');
    if (typeof resolveRoot !== 'function') throw new TypeError('resolveRoot must be a function');
    this.pool = pool;
    this.resolveRoot = resolveRoot;
    this.closed = false;
  }

  inspect() {
    return this.pool.inspect();
  }

  async pruneInvalidRepositories() {
    for (const { root } of this.pool.inspect()) {
      let resolved = null;
      try { resolved = await this.resolveRoot(root); } catch { /* invalid root */ }
      if (resolved !== root) await this.pool.release(root);
    }
  }

  async call({ cwd, tool, arguments: args = {} } = {}) {
    if (this.closed) throw routerError('ROUTER_CLOSED', 'code router is shut down');
    if (typeof tool !== 'string' || tool.length === 0) throw new TypeError('tool is required');

    let repoRoot;
    try {
      repoRoot = await this.resolveRoot(cwd);
    } catch (error) {
      try { await this.pruneInvalidRepositories(); } catch { /* preserve the discovery error */ }
      throw error;
    }

    const result = await this.pool.call(repoRoot, tool, args);
    return { repoRoot, result };
  }

  async shutdown() {
    if (this.closed) return;
    this.closed = true;
    await this.pool.close();
  }
}

export async function createCodeRouter({ bin = defaultCodeDbBin(), maxActive = 4 } = {}) {
  const verified = await verifyCodeDbBinary(bin);
  return new CodeRouter({
    pool: new RepoChildPool({
      maxActive,
      childFactory: root => CodeDbChild.start({ root, bin: verified.path })
    })
  });
}
