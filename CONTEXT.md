# Books Demo SPA

A reading platform: authors publish books chapter by chapter, and signed-in
readers comment on them and like them. What each person may do is governed by
their role.

## Language

### People and access

**Account**:
Any registered person, whatever their role.
_Avoid_: User (for a registered person in general)

**Guest**:
Someone with no session: an anonymous visitor.
_Avoid_: Anonymous user

**Role**:
The rank an Account holds: User, Author, Admin or Superadmin. Guest is the
role assumed for someone with no session; no Account holds it.

**Scope**:
How far a Role's grant on an action reaches: `none` refuses it, `own` limits
it to rows the Account owns, `any` reaches every row regardless of Owner.

**User**:
The entry-level Role: reads, comments and likes.
_Avoid_: "user" for any Account

**Author**:
The Role that may also publish Series, Books and Chapters, and the only Role an
Account must hold to be made a Co-author.
_Avoid_: "author" for whoever wrote a comment (its Owner) or for someone
credited on a Book (a Co-author)

**Co-author**:
An Account credited on a Book or a Series. Every credited Account is one, even
when it is the only one; all of a work's Co-authors are equal, and a work always
has at least one.
_Avoid_: Primary author, creator, "author" for a credit

**Admin**:
The Role that moderates other people's content and manages User and Author
Accounts.

**Superadmin**:
The top Role, and the only one that reaches Admin and Superadmin Accounts.

**Owner**:
The Account a Comment or Like belongs to; whoever wrote a comment is its Owner.
A Book or Series has no single Owner — each of its Co-authors owns it equally —
and a Chapter is owned by its Book's Co-authors.
_Avoid_: Author (for a comment's writer), creator

**Moderator**:
An Admin or Superadmin acting on content they do not own. A hat worn for one
action, not a Role.
_Avoid_: treating Moderator as a Role

**Blocked**:
An Account status that refuses sign-in and ends the Account's existing
sessions.

**Pending**:
An Account status reserved for a future email-verification step. Today it
restricts nothing: a Pending Account signs in like an active one.

### Content

**Book**:
A work credited to one or more Co-authors, read as a sequence of Chapters in
its Reading order and optionally grouped into a Series.
_Avoid_: Title, work

**Book status**:
Where a Book stands: Draft, In progress or Complete. Every Book has exactly one.
_Avoid_: State (for a Book)

**Draft book**:
A Book kept from readers; only its Co-authors and Moderators can see it.

**In progress**:
The Book status of a Published Book whose Chapters are still coming out.
_Avoid_: Ongoing

**Complete**:
The Book status of a Published Book declared finished. A label for readers
only: Chapters may still be added, and the Book may return to In progress.
_Avoid_: Finished, full text

**Chapter**:
One instalment of a Book, and the unit a reader reads. It belongs to exactly
one Book and never stands alone.
_Avoid_: Part, section, episode

**Reading order**:
The explicit position of each Chapter within its Book, independent of when a
Chapter was created or published.
_Avoid_: Chapter number (a title may carry one; the order does not depend on it)

**Publication time**:
The moment a Chapter becomes Published. A Draft chapter has none.

**Draft chapter**:
A Chapter with no Publication time; only its Book's Co-authors and Moderators
can see it.

**Scheduled chapter**:
A Chapter whose Publication time is still in the future. Until then it is
hidden from readers entirely, not announced.

**Published**:
A Book whose status is In progress or Complete, or a Chapter whose Publication
time has passed. A reader sees a Chapter only when both it and its Book are
Published.
_Avoid_: Live, released

**Series**:
An optional grouping of Books, credited to one or more Co-authors; a Book may
stand alone with no Series.
_Avoid_: Collection

**Series order**:
The explicit position of each Book within its Series, independent of when a
Book was created or filed into it.

### Comments

**Comment**:
A remark an Account (its Owner) posts on a Book, optionally in reply to
another Comment.
_Avoid_: Post, message

**Tombstone**:
A Deleted or Removed comment. It stays in its thread so its replies keep their
place, and shows neither its text nor its Owner.
_Avoid_: Deleted placeholder

**Deleted comment**:
A Tombstone its Owner made by deleting the comment, or one left behind when the
Owner's Account was deleted. Nobody can restore it.
_Avoid_: Removed comment (that one a Moderator made)

**Removed comment**:
A Tombstone a Moderator made. A Moderator can restore it; nobody can edit it.
_Avoid_: Deleted comment (that one its Owner made)

### Notifications

**Notification**:
An in-app notice telling a Co-author that someone else changed who is credited
on a shared Book or Series, or deleted it. It keeps the work's title and the
actor's name as they were at the time, so it outlives both.
_Avoid_: Notice, alert, message

### Likes

**Like**:
An Account's vote of approval on exactly one Book or one Comment, never both
at once.
_Avoid_: Vote, favorite, upvote
