# Source and adaptation

This skill is adapted from the Moyu anti-over-engineering framework by Tayer Ruze (`uucz/moyu`).

Source: https://github.com/uucz/moyu
License: MIT

The adaptation keeps the simplicity and scope-control philosophy but intentionally changes the upstream strict behavior for this workflow: tests remain part of correctness, required transitive file changes are allowed, process overhead must justify itself, artifact-appropriate verification replaces code-oriented ceremony for non-code work, and the agent asks at architectural/ownership boundaries rather than requiring explicit permission for every file not named in the prompt.
