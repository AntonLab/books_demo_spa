# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

This is a single-context repo:

- **`CONTEXT.md`** at the repo root — the glossary.
- **`docs/adr/`** — read the ADRs that touch the area you're about to work in
  (`0005-co-authors-are-equal.md`, `0006-shared-types-workspace.md`, …).
  Each opens with frontmatter: `status` (`accepted` or `superseded`), `date`,
  and `supersedes` / `superseded-by` / `amends` / `amended-by` where another
  ADR changed it. Skip a superseded ADR unless you need its history. A new ADR
  carries the same fields, and the one it changes gets the reverse link.

The `/domain-modeling` skill updates both when a term or a decision gets resolved.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0005 (co-authors are equal), but worth reopening because…_
