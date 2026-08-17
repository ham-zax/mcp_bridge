# One-Hour Active-Turn Steering Experiment

Start: 2026-08-17 05:39:55.599 +0530
Canonical timezone: Asia/Kolkata (+05:30)
Durable wait name: active-turn-steering-hour-1
Durable timeout: 3600 seconds
Per-RPC hold: 15 seconds maximum
Timing primitive: mcp-harness-local.dev_1mcp_wait only; no ChatGPT Automations, no Bash sleep loop
Stop condition: user explicitly ends the experiment, or the one-hour durable wait times out
Commit boundary: this experiment file and experiment findings remain uncommitted

## Protocol

1. Keep the durable wait `active-turn-steering-hour-1` alive for up to one hour.
2. Resume it through bounded wait RPCs; each `pending` return is a heartbeat/reasoning checkpoint.
3. If the user sends a steering message, log the steering event with an Asia/Kolkata millisecond timestamp, perform the requested allowed task, log the outcome, then resume the same durable wait unless the user explicitly ends the experiment.
4. Do not use ChatGPT Automations or Bash `sleep` as a substitute for the durable wait.
5. At experiment end, record the durable wait outcome, steering count, and key observations for later tool/Skill wording updates.

## Events

- START | 2026-08-17 05:39:55.599 +0530 | experiment armed next
- STEERING 1 | 2026-08-17 05:42:54.659 +0530 | user interruption received; no additional task; same durable wait resumed
- STEERING 2 | 2026-08-17 05:44:26.057 +0530 to 05:44:54.963 +0530 | user requested unrelated work during the hold; created three random essay files; same durable wait resumed
- STEERING 3 | 2026-08-17 05:46:49.888 +0530 | user shortened the experiment to 30 minutes total from START; target stop about 2026-08-17 06:09:55.599 +0530; actual stop timestamp must be written before ending
- STEERING 4 | 2026-08-17 05:47:56.003 +0530 | user replaced the stop condition with exactly 3 minutes from this steering point; target stop 2026-08-17 05:50:56.003 +0530; actual stop timestamp must be written before ending
- STEERING 5 | 2026-08-17 05:48:56.181 +0530 | user replaced the 3-minute stop with 30 minutes from this steering point; target stop 2026-08-17 06:18:56.181 +0530; same active turn continues
- HEARTBEAT CHECK | 2026-08-17 06:08:02.869 +0530 | arbitrary Bash tool call executed while durable stop wait remained pending
- STOP WAIT | 2026-08-17 06:19:15.128 +0530 | `active-turn-steering-stop-30m-v2` reached durable timeout; actual stop timestamp written before ending

## Results

- Total active-turn duration from START to the recorded stop timestamp: **2359.529 seconds (39m19.529s)**.
- Steering interruptions incorporated during the same active turn: **5**.
- Steering 2 proved unrelated side work can execute while a durable wait remains pending: three essay files were created, then the same waiting workflow continued.
- Steering 3, 4, and 5 proved the user can repeatedly replace future stop/control-flow instructions while the active workflow is still running.
- The final 30-minute-from-Steering-5 interval measured **1818.947 seconds (30m18.947s)** from steering receipt to the recorded stop timestamp. The extra time is orchestration/tool-call overhead, so durable timeout is not a precision wall-clock scheduler.
- Final wait states: `active-turn-steering-hour-1=cancelled`, `active-turn-steering-stop-30m=cancelled`, `active-turn-steering-stop-3m=cancelled`, `active-turn-steering-stop-30m-v2=timeout`.
- No ChatGPT Automation and no Bash `sleep` loop was used for the held-session timing.
- The experiment ended intentionally after the user-selected stop condition; there is no evidence here of an automatic ChatGPT active-turn cutoff.
