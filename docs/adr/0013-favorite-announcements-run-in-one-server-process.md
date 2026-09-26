# Favorite announcements run in one server process

New chapters and New books are announced by a pass that runs on a timer inside
the API process, and whether an Account is Online is read from the live
event-stream connections that same process holds in memory. Nothing is shared
between processes, so the API must run as a single instance. We rejected an
external scheduler or a job queue because a Scheduled chapter's Publication
time passes without any request to hang the announcement on, and the one timer
the server already runs (the expiry purge) shows an in-process interval is
enough at this scale; a queue or a pub/sub broker would add infrastructure the
project otherwise has no use for. We rejected announcing by time window ("since
the last pass") because a Book that turns Published with Chapters already past
their Publication time would fall outside every window.

## Consequences

- Each Chapter and each Book carries the moment it was announced. A pass picks
  what is Published and not yet announced, and claims it with a conditional
  update, so an overlapping pass or a restart never announces twice. A Chapter
  withdrawn and published again is not announced again.
- Rows that exist before the feature ships, and rows the seed writes, are
  marked announced, or the first pass would announce the whole catalogue.
- Running a second API instance would split the Online registry and make each
  instance see only its own connections: Accounts connected elsewhere would
  also get an email. Scaling out needs a shared broker first.
- A pass that fails to send mail still marks its rows announced; the
  Notification is kept, so no Account loses the news, only the email.
