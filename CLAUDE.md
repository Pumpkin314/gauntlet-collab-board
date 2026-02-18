# CLAUDE.md — Project Guidelines

## Code Comments

- **No redundant one-liner comments.** Don't restate what the code already says (e.g., `// increment counter` above `counter++`). Comments should explain *why*, not *what*. It should be easy for an LLM and/or human to understand behavior from these comments.
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
