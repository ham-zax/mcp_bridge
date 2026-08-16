# Session Skill Snapshot

This directory tracks the Skills that were exposed or invoked in the ChatGPT session that produced this snapshot on 2026-08-17.

## Included skills

1. `brainstorming`
2. `context-audit`
3. `dispatching-parallel-agents`
4. `executing-plans`
5. `finishing-a-development-branch`
6. `mcp-harness-router`
7. `moyu`
8. `receiving-code-review`
9. `reflexion`
10. `requesting-code-review`
11. `skill-creator`
12. `subagent-driven-development`
13. `superpowers-web-adapter`
14. `systematic-debugging`
15. `test-driven-development`
16. `using-git-worktrees`
17. `using-superpowers`
18. `verification-before-completion`
19. `writing-plans`
20. `writing-skills`

## Provenance

- The 14 Superpowers skills come from the locally installed `superpowers` 6.2.0 bundle whose `brainstorming`, `using-superpowers`, and `writing-skills` entrypoints were checked against the versions exposed in this session. The complete local skill directories were copied so helper/reference files omitted by the ChatGPT Web resource view are preserved along with executable permissions.
- `mcp-harness-router` is the repository's deployed router skill, completed with the icon and UI metadata exposed by the session resource.
- `superpowers-web-adapter`, `context-audit`, `moyu`, and `reflexion` were materialized from the session-exposed resources. Their resource reader exposes the instruction body without YAML frontmatter, so valid `name`/`description` frontmatter was added without changing the body.
- `skill-creator` uses the locally installed official OpenAI system Skill Creator bundle. The session resource view is useful for reading instructions but is not byte-preserving for executable source because escaped newlines inside scripts are rendered as literal line breaks; the local canonical bundle is therefore safer and executable.
- `agents/openai.yaml` files for the Superpowers bundles are local ChatGPT UI metadata added for installability; their upstream `SKILL.md` and helper files are otherwise copied unchanged.
- `LICENSES/superpowers-LICENSE.txt` preserves the license shipped with the copied Superpowers package. Skills with their own session-exposed licenses keep those licenses inside their directories.

## Validation

Every first-level skill directory must contain:

- `SKILL.md` with valid YAML frontmatter;
- `agents/openai.yaml` with a display name and short description.

Validate the snapshot with the installed OpenAI Skill Creator validator:

```bash
VALIDATOR="$HOME/.codex/skills/.system/skill-creator/scripts/quick_validate.py"
for dir in skills/*/; do
  [ -f "$dir/SKILL.md" ] || continue
  python3 "$VALIDATOR" "$dir"
done
```

The repository publication policy treats all `skills/*` paths as private-only.
