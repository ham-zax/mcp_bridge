# RTK selective Bash experiment

Date: 2026-08-15

## RTK 0.43 verdict

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

---

## RTK 0.45 delta requalification — real development flows

Date: 2026-08-15

### Delta verdict

```text
RTK_EXPLICIT_HELPER
```

RTK 0.45 does **not** justify an automatic Bash rewrite layer. Native Bash remains the normal and trusted execution path. The real-flow delta does justify one narrow, explicitly selected use: `rtk test <test command>` can substantially compress known test-runner output when the caller is willing to use RTK's retained full-output log for recovery.

No production Bash, MCP schema, profile, provider composition, hook, shim, or command classifier is changed by this verdict.

The result does **not** promote `rtk rg`, `rtk read`, RTK Git diff shaping, or RTK shell rewriting as routine coding primitives. Against an intelligently compact native baseline, those operations were either equivalent, slower, lossy, or worse.

### Installed 0.45 binary and local integration state

```text
binary                 $HOME/.local/bin/rtk
version                rtk 0.45.0
size                   10326432 bytes
sha256                 99e0cff729d52297a23eb832f809d9773ba7c32de818dfe76b2cdd900a951535
PATH command shims      none for git/rg/grep/sed/npm/pnpm
RTK environment vars   none observed
Claude RTK hook         none observed in Claude hook configuration
Codex integration      present: global RTK.md + AGENTS reference
RTK config             present under $HOME/.config/rtk/
```

`rtk init --show --codex` reports the global Codex instruction integration as installed. That is an instruction-layer integration, not a shell/PATH execution shim. The installed RTK document tells Codex to prefix commands with RTK, but the Personal WSL Harness policy in this benchmark deliberately does not adopt that behavior: native Bash remains normal, and RTK is evaluated only when explicitly chosen.

No installed RTK integration was added, removed, or modified by this experiment.

### Actual 0.45 operation/rewrite discovery

The installed binary advertises direct output helpers including `git`, `rg`, `grep`, `read`, `smart`, `test`, `err`, `npm`, `pnpm`, `pipe`, and language/tool-specific wrappers. There is no dedicated RTK `sed` shaping subcommand; `rtk sed --help` reaches native GNU `sed` behavior.

Observed `rtk rewrite` behavior on this binary:

```text
exit 0 + rewrite
  git status
  git diff
  git diff --check
  git diff --name-only
  git log --oneline -20
  npm run test

exit 1 + no rewrite
  sed -n ...
  npm test
  git status > file
  exact node -e diagnostic command

exit 3 + printed candidate
  rg ...
  rg -n ...
  rg -l ...
  pipeline whose grep stage was replaced with rtk grep
```

The help text documents exit 0 as supported and exit 1 as no equivalent. Exit 3 is not documented there, so this benchmark does not reinterpret it as an automation-safe signal.

### Measurement model

The primary benchmark compares three complete development workflows in paired disposable clones of the exact same repository state.

NATIVE uses deliberately compact native commands where appropriate, including `rg -n`, `sed -n`, `git status --short`, `git diff --stat`, `git log --oneline`, and focused Node tests.

RTK-ASSISTED keeps those native commands when they are already the better primitive and uses RTK only for operations a coding agent could plausibly select deliberately. In the paired flows those candidate helpers were direct `rtk rg` and `rtk test`; exact diff/status/range inspection stayed native.

Token counts use `tiktoken==0.13.0` with `o200k_base`. Tool calls and command executions count each logical development command. Clone/setup preparation is excluded from flow timing and token totals. Final correctness is independently verified after each flow.

Raw evidence is retained outside Git at:

```text
${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge/benchmarks/rtk-v045/
```

### Flow A — failing-test bugfix

A disposable commit changed the Bash non-zero annotation from `[exit N]` to `[code N]`. Both variants then performed the same workflow:

```text
search symptom
inspect renderer source
run focused failing renderer test
apply exact fix
rerun focused test
inspect exact git diff
git diff --check
git status --short
```

Results:

| Metric | NATIVE | RTK-assisted |
|---|---:|---:|
| tool calls | 8 | 8 |
| command executions | 8 | 8 |
| result tokens | 1475 | 898 |
| wall time | 397 ms | 664 ms |
| raw reruns | 0 | 0 |
| final correctness | pass | pass |

Token reduction: **39.1%**.

The search result was identical: 230 tokens in both cases. `rtk rg -n` therefore earned no credit. The material reduction came from `rtk test`:

```text
failing focused test   505 -> 80 tokens
passing focused test   198 -> 46 tokens
```

For the failure, RTK retained the actionable actual/expected values:

```text
actual:   ... [code 1]
expected: ... [exit 1]
```

and provided a full-output log path. It omitted the test location, assertion heading, code frame, and stack from the compact result. No raw rerun was required in this particular flow because the prior search/source inspection already localized the bug. This is evidence that `rtk test` is a compression helper, not a replacement for raw debugging evidence.

### Flow B — multi-file refactor

A coordinated internal refactor renamed `renderPatchText` to `renderApplyPatchText` across renderer, server, and renderer tests. Both variants performed:

```text
search symbol/usages
inspect coordinated source ranges
modify all three files
run focused renderer + server tests
inspect git diff --stat
inspect exact unified diff
git diff --check
git status --short
```

Results:

| Metric | NATIVE | RTK-assisted |
|---|---:|---:|
| tool calls | 8 | 8 |
| command executions | 8 | 8 |
| result tokens | 2385 | 1948 |
| wall time | 19.95 s | 17.78 s |
| raw reruns | 0 | 0 |
| final correctness | pass | pass |

Token reduction: **18.3%**.

Again, direct `rtk rg -n` returned the same 135-token usage list as native `rg -n`. All 437 saved tokens came from the passing test result:

```text
native focused tests   484 tokens
rtk test                47 tokens
reduction               90.3%
```

The wall-time difference is dominated by normal server-test runtime variance and is not credited as an RTK speedup.

### Flow C — repository investigation/navigation

The investigation asked a concrete repository question: is `apply_patch` personal/user-mode only, and does it reuse the Agent-1 user path policy rather than introducing another cwd/root model?

Both variants performed:

```text
broad implementation search, capped to 80 lines
inspect exact server policy ranges
inspect exact patch resolver/preflight ranges
inspect harness profile assertions
inspect compact git history
git status --short
git diff --stat
```

Both arrived at the correct conclusion:

```text
apply_patch is registered only in user mode;
patch cwd/paths reuse resolveUserCwd/resolveUserPath;
workspace/public mode does not gain apply_patch.
```

Results:

| Metric | NATIVE | RTK-assisted |
|---|---:|---:|
| tool calls | 7 | 7 |
| command executions | 7 | 7 |
| result tokens | 3827 | 3827 |
| wall time | 46 ms | 87 ms |
| raw reruns | 0 | 0 |
| final correctness | pass | pass |

Token reduction: **0%**.

The two RTK search calls were byte-for-byte equivalent to the already-compact native `rg -n ... | head` results and only added wrapper latency. Exact source navigation still needed native `sed -n` because RTK `read` has max/tail controls but no arbitrary start/end line range.

### Whole-flow totals

| Metric | NATIVE | RTK-assisted |
|---|---:|---:|
| total result tokens | 7687 | 6673 |
| total tool calls | 23 | 23 |
| total command executions | 23 | 23 |
| total raw reruns | 0 | 0 |
| summed observed wall time | 20.39 s | 18.53 s |

Total result-token reduction across the three flows: **13.2%**.

That aggregate should not be interpreted as a general RTK gain. Flow C had no token benefit at all, and in Flows A/B virtually all savings came from `rtk test`. The observed total wall-time improvement is test-runtime noise: repeated micro-measurement of the small renderer suite showed native median 109.1 ms versus RTK median 125.8 ms, while targeted `rg` was 6.1 ms native versus 27.5 ms through RTK.

### 0.43 problem cases retested under 0.45

#### `git diff --check` — still unsafe

```text
NATIVE  exit 2, 15 tokens, exact file/line/trailing-whitespace diagnostic
RTK     exit 2, 0 tokens
```

The old evidence-loss defect remains: RTK preserves failure status but removes the remediation evidence entirely.

#### `git diff --name-only` — still damages machine-readable output

```text
NATIVE  20 tokens, paths only
RTK     22 tokens, paths plus an extra `Changes:` section
```

This remains unsuitable when a caller asked for path-only output.

#### Plain `git diff` — still not worth replacing native diff

```text
NATIVE  832 tokens
RTK     689 tokens
saving  17.2%
```

RTK removes normal diff metadata/context for a modest saving. Exact review/debugging should stay native.

#### `rg`, `rg -n`, and `rg -l`

On real repository queries:

```text
broad rg, capped identically       1900 -> 1900 tokens
line-sensitive rg -n                90 ->   90 tokens
file-list rg -l                     24 ->   24 tokens
```

Targeted searches therefore get no result reduction while adding about 20-25 ms wrapper latency in repeated measurements.

A synthetic 300-match query demonstrated RTK's noisy-result policy: it returned a summary, the first 25 matches, and a recoverable full-output log reference (`+275 more ...`). This is useful as a convenience display, but it is not an exhaustive usage search. Native coding practice can obtain the same bounded-discovery behavior with `rg ... | head`, and exhaustive refactor/usages work must not silently rely on RTK's capped view.

#### Passing/failing test output

Direct `rtk test` is the material 0.45-era helper result:

```text
real passing renderer suite     198 ->  46 tokens  (76.8%)
fixture failing Node suite      496 -> 107 tokens  (78.4%)
Flow-B 25-test focused suite    484 ->  47 tokens  (90.3%)
```

The failing test retained the final actual/expected object values plus a full-output log path, but omitted the failure location, assertion heading, and stack in the compact result.

A control npm fixture confirms this benefit comes from explicit test shaping, not ordinary npm filtering:

```text
npm run test             300 tokens
rtk npm run test         272 tokens   (9.3% saving)
rtk test npm run test     62 tokens   (79.3% saving)
```

The 0.43 study benchmarked the rewrite/npm path, not this explicit `rtk test` helper. Therefore the stronger result cannot be attributed solely to the 0.45 binary version; it is also a consequence of the narrower explicit-helper evaluation requested here.

#### Pipelines and redirects

A simple `grep` pipeline produced exactly the same 14 tokens natively and through `rtk grep`, with added RTK latency.

`rtk rewrite` still refused a shell redirection (`git status > file`, exit 1/no rewrite). An explicitly invoked `rtk git status > file` writes RTK's shaped status, as expected, so it must not be substituted when a redirect is intended to preserve native command output.

#### Exact stack/error diagnostics

On a real throwing Node module:

```text
native       188 tokens, source code frame + message + stack + Node version
rtk err      161 tokens, error message + useful stack + full-output log
rtk test      95 tokens, only tail stack/version + full-output log
```

`rtk err` is a modest optional compression when its omitted source code frame is not needed. `rtk test` is inappropriate for arbitrary non-test diagnostics: in this probe its compact tail omitted the `EXACT_STACK_MARKER` error message itself, so the raw/full output would be required to diagnose the failure.

### Search/read/text-tool findings

`rtk rg` is not promoted as a general coding helper by this benchmark:

- targeted real searches were output-identical to native `rg`;
- line-sensitive `-n` was preserved, but saved no tokens;
- `-l` preserved the same file set but reordered it and saved no tokens;
- noisy searches are capped to the first 25 matches plus a full-log recovery handle;
- native `rg ... | head`, `rg -c`, and related compact forms already cover exploratory bounding without changing the trusted command model.

No dedicated RTK `sed` shaping capability was discovered. For exact code-range navigation, native `sed -n` decisively wins. In the tested server range:

```text
sed -n '98,126p'       372 tokens
rtk read -n -m 126     839 tokens
```

RTK `read` had to emit from line 1 because it lacks an arbitrary start offset. On a small full-file read, native `cat` and `rtk read` were both 389 tokens, with RTK adding wrapper latency.

### Why the verdict is `RTK_EXPLICIT_HELPER`

The user policy rules out automatic Bash rewriting in this mission, and the evidence does not justify reopening it anyway:

1. Search/navigation produced no whole-flow token gain against compact native commands.
2. The two serious 0.43 Git correctness/evidence problems remain in 0.45.
3. Plain RTK diff still trades away review evidence for only ~17% reduction.
4. Machine-readable Git output remains unsafe to shape generically.
5. Native pipelines, redirects, compact Git forms, `rg`, and `sed -n` remain better defaults.
6. Flow C showed zero token improvement from RTK-assisted navigation.
7. `rtk test` did materially reduce real focused-test output in both passing and failing workflows while retaining a full-output recovery path.

The earned helper is therefore narrow and explicit:

```text
use deliberately:
  rtk test <known test-runner command>

best case:
  focused/noisy test suites where a compact pass/fail result is enough

on failure:
  inspect the compact actual/expected tail;
  if location/stack/root cause is missing, read the full RTK log or rerun natively

optional secondary use:
  rtk err <noisy command> when a compact error+stack view is sufficient

not promoted:
  rtk rg for exhaustive code search
  rtk read instead of targeted sed -n
  rtk git diff / diff --check / --name-only
  automatic rtk rewrite
```

### Final Bash policy after 0.45 delta

Unchanged production contract:

```text
normal executor             native one-shot Bash command string
normal output               native Bash output
RTK automatic rewrite       none
RTK classifier/hook         none in the harness
new MCP action              none
new Bash schema field       none
explicit RTK helper         allowed only by deliberate command choice
recommended RTK helper      rtk test for selected noisy test runs
raw recovery                native Bash/full RTK log always available
pipelines/redirections      native shell semantics unchanged
personal/public path modes  unchanged
```

The benchmark verdict is an operator/model usage recommendation only. It does not modify provider behavior or require RTK for correct harness operation.
