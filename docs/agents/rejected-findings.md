# Rejected audit findings

Findings the user declined, so `repo-auditor` leaves them out of later audits.
The main session appends a line per declined finding when the user picks which
findings to fix. `repo-auditor` raises a finding again only when its file
changed after the entry's date.

Format: `- YYYY-MM-DD · path[:line] · tag · finding — reason`
