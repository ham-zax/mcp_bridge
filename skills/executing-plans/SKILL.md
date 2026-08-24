---
name: executing-plans
description: Use when you have a written implementation plan to execute in a separate session with review checkpoints
---

# Executing Plans

## Overview

Load plan, review critically, execute all tasks, report when complete.

**Announce at start:** "I'm using the executing-plans skill to implement this plan."

**Note:** Tell your human partner that Superpowers works much better with access to subagents (Claude Code, Codex CLI, Codex App, Copilot CLI, and Gemini CLI all qualify; see the per-platform tool refs in `../using-superpowers/references/`). If subagents are available, use superpowers:subagent-driven-development instead of this skill.

## The Process

### Step 1: Load and Review Plan
1. Use the current checkout by default; create/use a worktree only when explicit/concurrent-writer isolation or mandatory repository policy requires it.
2. Read the plan file.
3. Review critically for blockers, stale assumptions, and process steps that exceed the task's authority.
4. Remove test creation/modification/execution, TDD, broad-suite, setup, or validation steps unless the user, authoritative user-approved specification, or mandatory repository policy explicitly requires them. A stale plan does not create testing authorization.
5. If a proposed normalization would change product behavior, public contracts, security semantics, or another protected boundary, raise that decision; otherwise proceed with the normalized plan.

### Step 2: Execute Tasks

For each task:
1. Mark as in_progress
2. Follow each step exactly (plan has bite-sized steps)
3. Run only validation that remains explicitly required after the Step 1 scope review
4. Mark as completed

### Step 3: Complete Development

After all tasks complete and verified:
- Announce: "I'm using the finishing-a-development-branch skill to complete this work."
- **REQUIRED SUB-SKILL:** Use superpowers:finishing-a-development-branch
- Follow that skill to establish required completion evidence, present options, and execute the user's integration choice without introducing unauthorized tests

## When to Stop and Ask for Help

**STOP executing immediately when:**
- Hit a blocker (missing dependency, test fails, instruction unclear)
- Plan has critical gaps preventing starting
- You don't understand an instruction
- Verification fails repeatedly

**Ask for clarification rather than guessing.**

## When to Revisit Earlier Steps

**Return to Review (Step 1) when:**
- Partner updates the plan based on your feedback
- Fundamental approach needs rethinking

**Don't force through blockers** - stop and ask.

## Remember
- Review plan critically first
- Follow plan steps exactly
- Don't skip explicitly required validation, and don't invent additional test/verification work
- Reference skills when plan says to
- Stop when blocked, don't guess
- Never start implementation on main/master branch without explicit user consent
