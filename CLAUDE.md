# CLAUDE.md — Project Guidelines

## Code Comments

- **No redundant one-liner comments.** Don't restate what the code already says (e.g., `// increment counter` above `counter++`). Comments should explain *why*, not *what*. It should be easy for an LLM and/or human coder to understand behavior from these comments.
- **Use standard doc-comment formats** appropriate to the language:
  - TypeScript/JavaScript: JSDoc (`/** ... */`)
  - Python: docstrings (`"""..."""`)
  - Java: Javadoc
  - C/C++: Doxygen
- Inline comments (`//`) are fine for genuinely non-obvious logic. If the code is self-explanatory, skip the comment.

## Git Workflow

- **One commit per small feature.** Each self-contained change (bug fix, small feature, refactor) gets its own commit with a clear message.
- **Feature branches for complex work.** Multi-commit features get a dedicated branch (`feature/<name>`) and are merged via PR.
- Write commit messages that explain the *why*, not just the *what*.

## Skills
- Project-specific skills are located in .claude/skills/ and .agents/skills/. These give you access to specialized knowledge that could be useful to tasks.


## Testing

Use the **`run-tests` skill** (`.claude/skills/run-tests/SKILL.md`) whenever running any part of the test suite. It documents the three-tier stack (Vitest unit tests, single-player Playwright perf, multiplayer Playwright perf), which tier to run for a given change type, and how to parallelize Tier 1 + Tier 2.

**Minimum bar:** Always run `npm run test` (Tier 1) after any non-trivial change. Run the full suite before a PR is merged.

## Regression Handling

When a code change causes a previously passing test to fail:

- **Do not automatically fix the regression.** Stop, describe the failing test(s) and the exact reason the change broke them, propose a fix, and wait for user approval before touching anything.
- **Exception:** If a test is asserting old behavior that was *intentionally* changed (e.g., a UI label rename), you may note this and ask for confirmation to update the test — but still wait for approval.
- The goal is to keep the user in the loop on what the tests are actually protecting. Smoothing over a regression without discussion hides signal.