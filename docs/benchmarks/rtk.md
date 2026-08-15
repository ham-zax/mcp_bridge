# RTK selective Bash experiment

Date: 2026-08-15

## Verdict

```text
RTK_NOT_MATERIAL
```

RTK produced real reductions for a narrow pair of human-oriented Git reads, but the representative corpus did not justify adding an RTK policy layer to the proven Bash primitive.

The winning isolated cases were plain `git status` and browsing-style `git log -n N`. Across the rest of the corpus RTK either declined the rewrite, added measurable latency for no result reduction, preserved already-concise output unchanged, made machine-readable output worse, or removed useful debugging evidence.

No RTK execution path is retained in the provider. Native Bash remains the only Bash execution/output path, so no new `raw` parameter, MCP action, profile setting, hook, PATH shim, or RTK-specific cwd/root/sandbox is introduced.

This maps to the canonical Task-11 losing-integration path (`RTK_REMOVE`) while using the mission's required verdict vocabulary, `RTK_NOT_MATERIAL`.

## Experiment binary

The machine already had a non-prerelease RTK binary, so the experiment reused it rather than installing another copy or installing client hooks.

```text
binary              $HOME/.local/bin/rtk
version             rtk 0.43.0
size                10083968 bytes
sha256              f160611f3baee17fe4eb3a04c56a8bc3d15fec4274d8838016088d4776c6f628
client hooks added  none
```

The binary's own `rtk rewrite --help` says exit 0 means a supported rewrite and exit 1 means no RTK equivalent. The benchmark treated only exit 0 plus a non-empty rewritten command as eligible for shaping. It did not reinterpret other return codes.

Raw evidence is retained outside Git at:

```text
${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge/benchmarks/rtk-task11/
```

## Comparison model

RAW:

```text
bash(command)
  -> original native Bash command string
  -> native combined output / native exit status
```

RTK SELECTIVE experiment:

```text
bash(command)
  -> rtk rewrite "$command"
       exit 0 + rewrite -> execute rewritten command through Bash
       otherwise        -> execute original command through Bash
```

This was an experiment harness only. The repository's Bash implementation was not modified to run this policy.

## Measurement method

- Token counts use `tiktoken==0.13.0`, `o200k_base`.
- RAW and SELECTIVE captured combined stdout/stderr.
- SELECTIVE latency includes the `rtk rewrite` decision plus command execution.
- Fast commands were timed three times and report the median.
- The direct Node test was timed twice.
- Full Pi test runs were timed once per variant because they are long-running; their latency differences are treated as directional rather than deterministic.
- The failing-test fixture was timed three times per variant.
- Exit codes were compared for every command.
- Redirected file contents were hashed and compared for redirect cases.
- Pipelines and redirects were executed as native Bash strings; there was no custom shell parsing.

The main Git fixture was a disposable real Git repository with:

```text
25 commits
12 modified tracked files
10 untracked files
109 dirty insertions
1 deliberate trailing-whitespace error
```

Repository-native commands (`rg`, package-manager commands, Pi tests, direct Node tests) were run against this worktree. A separate disposable Node test fixture contained 30 passing tests plus one deliberate deep-equality failure to test failure diagnostics.

## Representative command corpus

`Rewritten=yes` means `rtk rewrite` returned exit 0 and the rewritten command was actually used. `Rewritten=no` means SELECTIVE executed the original native command.

| # | Command | Rewritten | RAW tokens | SELECTIVE tokens | Reduction | RAW ms | SELECTIVE ms | Classification |
|---:|---|:---:|---:|---:|---:|---:|---:|---|
| 1 | `git status` | yes | 253 | 145 | +42.7% | 3.2 | 62.9 | SAFE_TO_SHAPE |
| 2 | `git diff` | yes | 2849 | 2325 | +18.4% | 4.4 | 62.7 | MUST_STAY_NATIVE |
| 3 | `git log -n 20` | yes | 1291 | 422 | +67.3% | 3.6 | 56.5 | SAFE_TO_SHAPE |
| 4 | `git diff --stat` | yes | 142 | 142 | +0.0% | 3.8 | 56.9 | SHAPING_NOT_MATERIAL |
| 5 | `git diff --name-only` | yes | 60 | 62 | -3.3% | 2.5 | 60.2 | MUST_STAY_NATIVE |
| 6 | `git status --porcelain=v1` | yes | 142 | 141 | +0.7% | 3.3 | 57.5 | MUST_STAY_NATIVE |
| 7 | `git log -n 5 --format='%H%x09%an%x09%s'` | yes | 181 | 181 | +0.0% | 3.1 | 59.0 | MUST_STAY_NATIVE |
| 8 | `git status | sed -n '1,8p'` | no | 80 | 80 | +0.0% | 3.2 | 36.7 | MUST_STAY_NATIVE |
| 9 | `git diff | head -n 40` | no | 536 | 536 | +0.0% | 4.1 | 37.2 | MUST_STAY_NATIVE |
| 10 | `git status > "$RTK_BENCH_REDIRECT"` | no | 0 | 0 | +0.0% | 3.2 | 7.4 | MUST_STAY_NATIVE |
| 11 | `git diff --check` | yes | 18 | 0 | +100.0% | 3.2 | 56.8 | SHAPING_DAMAGES_EVIDENCE |
| 12 | `git log -n 3 --oneline` | yes | 35 | 35 | +0.0% | 2.6 | 58.1 | SHAPING_NOT_MATERIAL |
| 13 | `git status --short` | yes | 142 | 141 | +0.7% | 2.6 | 56.6 | MUST_STAY_NATIVE |
| 14 | `rg registerTool providers/pi-dev` | no | 73 | 73 | +0.0% | 6.2 | 36.1 | MUST_STAY_NATIVE |
| 15 | `rg test providers/pi-dev/test` | no | 2033 | 2033 | +0.0% | 6.1 | 36.6 | MUST_STAY_NATIVE |
| 16 | `rg -n 'MCP_DEV_PATH_MODE' providers/pi-dev/server.mjs` | no | 34 | 34 | +0.0% | 3.2 | 34.4 | MUST_STAY_NATIVE |
| 17 | `rg -l apply_patch providers/pi-dev` | no | 24 | 24 | +0.0% | 6.3 | 37.7 | MUST_STAY_NATIVE |
| 18 | `npm run test` | yes | 1411 | 1381 | +2.1% | 17107.8 | 17435.2 | SHAPING_NOT_MATERIAL |
| 19 | `npm test` | no | 1411 | 1424 | -0.9% | 16938.2 | 22671.0 | MUST_STAY_NATIVE |
| 20 | `npm ls --depth=0` | no | 86 | 86 | +0.0% | 372.4 | 365.2 | MUST_STAY_NATIVE |
| 21 | `pnpm list --depth 0` | no | 0 | 0 | +0.0% | 616.1 | 750.3 | MUST_STAY_NATIVE |
| 22 | `node --test test/shell.test.mjs` | no | 224 | 224 | +0.0% | 1551.0 | 1415.6 | MUST_STAY_NATIVE |
| 23 | `printf 'already concise\n'` | no | 3 | 3 | +0.0% | 1.5 | 5.7 | SHAPING_NOT_MATERIAL |
| 24 | `printf 'alpha\nbeta\n' | grep beta` | no | 2 | 2 | +0.0% | 3.8 | 7.2 | MUST_STAY_NATIVE |
| 25 | `printf 'redirect-marker\n' > "$RTK_BENCH_REDIRECT"; cat "$RTK_BENCH_REDIRECT"` | no | 3 | 3 | +0.0% | 2.1 | 5.4 | MUST_STAY_NATIVE |
| 26 | `bash -c 'printf "debug: value=42 expected=41\n" >&2; exit 7'` | no | 9 | 9 | +0.0% | 2.2 | 6.4 | MUST_STAY_NATIVE |
| 27 | `node -e 'console.error(new Error("debug-marker").stack); process.exit(3)'` | no | 121 | 121 | +0.0% | 28.6 | 30.1 | MUST_STAY_NATIVE |
| 28 | `false` | no | 0 | 0 | +0.0% | 1.2 | 5.7 | SHAPING_NOT_MATERIAL |
| 29 | failing fixture: `npm run test` | yes | 802 | 772 | +3.7% | 238.6 | 293.0 | SHAPING_NOT_MATERIAL |

The 28-command main corpus totaled:

```text
RAW tokens        11163
SELECTIVE tokens   9627
reduction           13.8%
rewrite exit-0       11 / 28
native fallback      17 / 28
```

Including the explicit failing-test variant gives 11965 RAW tokens versus 10399 SELECTIVE tokens, a 13.1% reduction.

That aggregate overstates the benefit that is safe to retain, because it includes the lossy `git diff` and the completely suppressed `git diff --check` diagnostic. Restricting the useful default-on candidates to the two materially useful shapes observed here (`git status` and browsing-style `git log -n N`) saves 977 tokens in this 29-case corpus, about 8.2% of total corpus output.

For fast commands (RAW median below one second), the median command latency was 3.2 ms RAW versus 37.7 ms under the generic SELECTIVE probe, with a median added cost of 33.2 ms. The RTK-rewritten Git commands generally took about 56-63 ms versus 2.5-4.4 ms RAW.

## Semantic correctness and evidence review

### Commands safe to shape in isolation

#### Plain `git status`

On the dirty fixture, RTK reduced 253 tokens to 145 while preserving branch and every modified/untracked path.

An additional adversarial status probe covered:

```text
 M  unstaged modification
MM  staged + unstaged modification
D   staged deletion
R   staged rename
??  untracked file
```

RTK's status summary preserved those exact status codes and paths. A clean status also reduced 23 tokens to 12, although that absolute saving is only 11 tokens while latency rose from about 2.9 ms to 59.3 ms.

#### Browsing-style `git log -n N`

`git log -n 20` reduced 1291 tokens to 422. Subjects, author names and commit identity via abbreviated hashes were retained. RTK intentionally replaces full hashes and absolute timestamps with abbreviated hashes and relative time, so this is only safe for browsing. Exact audit/reproducibility requests must stay native.

### Commands where shaping is not material

- `git diff --stat`: same 142 tokens.
- `git log --oneline`: same 35 tokens.
- passing `npm run test`: 1411 -> 1381 tokens, only 2.1%.
- failing `npm run test`: 802 -> 772 tokens, only 3.7%; the assertion diff and stack remained present.
- already-concise shell output: no reduction.
- empty/non-zero concise output: no reduction.

### Commands that must stay native

Machine-readable or exact-format Git commands must stay native even when `rtk rewrite` returns success:

- `git diff --name-only`
- `git status --porcelain=v1`
- `git status --short`
- custom `git log --format=...`

`git diff --name-only` is the clearest example: RTK increased output from 60 to 62 tokens by appending a `Changes:` section, so a consumer expecting one path per line would no longer receive the requested format.

Pipelines and redirects also stay native. The tested RTK rewrite path declined them, and both pipeline output and redirected file hashes matched RAW exactly under fallback.

The tested `rg` forms, package-manager listing commands, direct Node test command, explicit failure/debug commands, and ordinary shell commands also remained native.

### Evidence-loss cases

#### `git diff --check`

RAW exited 2 with the exact diagnostic:

```text
src/file01.js:43: trailing whitespace.
+const whitespace_error = true;
```

RTK also exited 2 but returned **zero output**. The failure signal survived while the evidence needed to fix the failure disappeared. This is disqualifying for treating RTK's rewrite decision itself as a safe default-on policy.

#### `git diff`

RTK reduced tokens by 18.4%, but removed normal diff metadata and unchanged context. The changed lines remained useful for a high-level scan, but exact patch/debug review loses evidence for a modest saving. Native `git diff` therefore remains the correct default.

#### `git diff --name-only`

RTK appended non-path text to an explicitly machine-readable command and increased token count. This is semantic damage, not merely a formatting preference.

## Rewrite-policy reliability observation

On this exact RTK 0.43.0 binary, tested `rg` commands printed an RTK candidate rewrite but returned exit status 3. The binary's help documents exit 0 as the supported-rewrite signal and exit 1 as no equivalent. The experiment honored the documented exit-status contract and therefore ran those `rg` commands natively.

A harness integration would have to either leave those commands native or invent semantics for an undocumented return code. This experiment does neither.

## Why the verdict is not `RTK_SELECTIVE_KEEP`

A safe integration could theoretically hard-code a narrower harness allowlist around plain `git status` and browsing-style `git log`, then ask RTK to confirm those rewrites. The benchmark does not show enough breadth to justify that extra policy layer:

1. Only two tested command shapes were both materially smaller and acceptable for default shaping.
2. High-volume `rg` did not enter the documented rewrite-success path.
3. Passing and failing test-runner output saved only 2.1-3.7%.
4. Package-manager and direct test commands generally remained native.
5. Several RTK-recognized Git forms had no material benefit.
6. One recognized failure diagnostic lost all explanatory output.
7. One machine-readable command became less machine-readable and larger.
8. A custom harness allowlist plus model-visible raw bypass would add policy/schema complexity for an observed safe-corpus benefit of only about 8%.

There are real isolated RTK wins, so the result is `RTK_NOT_MATERIAL` rather than `RTK_REJECT`. A future RTK version could justify re-running this experiment if its rewrite contract and filters materially improve, especially for `rg` and test output.

## Final Bash contract after Task 11

Unchanged:

```text
executor                  native one-shot Bash command string
raw/native path           always available; it is the only retained path
RTK default               none
RTK hooks/shims            none added
new MCP actions            0
new Bash schema fields     0
hidden mutable cwd         none
personal default cwd       unchanged from the integrated personal profile
personal path mode         user
public path mode           workspace
restricted/trusted-dev     unchanged
```

RTK is not installed, initialized, or required by repository configuration as a result of this task. The already-present local binary was benchmarked only.
