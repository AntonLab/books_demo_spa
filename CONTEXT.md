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
The Role that may also publish Series, Books and Chapters.
_Avoid_: "author" for whoever wrote a comment; that is its Owner

**Admin**:
The Role that moderates other people's content and manages User and Author
Accounts.

**Superadmin**:
The top Role, and the only one that reaches Admin and Superadmin Accounts.

**Owner**:
The Account a Book, Series, Comment or Like belongs to. Whoever wrote a
comment is its Owner. A Chapter has no Owner column of its own — it takes its
Book's.
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

**Series**:
An optional grouping of an Author's Books; a Book may stand alone with no
Series.
_Avoid_: Collection

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

### Likes

**Like**:
An Account's vote of approval on exactly one Book or one Comment, never both
at once.
_Avoid_: Vote, favorite, upvote
