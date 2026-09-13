# A book's or series' co-authors are equal, deletion included

A Book or a Series may be credited to several Co-authors, and every one of them
holds the same rights over it: editing it and its Chapters, adding and removing
other Co-authors, and deleting the work outright. We rejected a single Owner
with lesser Co-authors, which would have kept one account able to veto the
destruction of shared work, because it splits every ownership check into two
tiers and needs a hand-over rule for when that Owner leaves or deletes their
account. The cost is that one Co-author can delete everyone's work alone —
including, through ADR-0004's cascade, other people's comment threads — so the
guards are elsewhere: every Co-author is notified when someone else adds or
removes a Co-author, leaves, or deletes the work; a work always keeps at least
one Co-author; and Moderators may edit or delete a work but never change who is
credited on it.

## Consequences

- ADR-0004 still holds, but deleting an account now deletes only the works on
  which it was the last Co-author; from every other work it is merely removed.
- The permission matrix's `own` scope on books, series and chapters means "the
  caller is one of the work's Co-authors", not "the caller is its owner".
