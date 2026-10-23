# Rejected audit findings

Findings the user declined, so `repo-auditor` leaves them out of later audits.
The main session appends a line per declined finding when the user picks which
findings to fix. `repo-auditor` raises a finding again only when its file
changed after the entry's date. An item the user drops from a follow-up brief
gets a line too, and the audit dispatch lists the dropped items.

Format: `- YYYY-MM-DD · path[:line] · tag · finding — reason`

- 2026-10-23 · server/src/repositories/{comment,like,favorite,readingList}Repository.ts · dup · share the column-to-error mapping of `asMissingReference` — the #234 spec keeps each repository's own mapping
