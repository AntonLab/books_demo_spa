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
The Role that moderates other people's content, manages User and Author
Accounts, and keeps the Genre list.

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

**Sign out**:
An Account ending its own session on purpose. A session belongs to the device,
not to one open tab, so every tab becomes a Guest's; the Account's Unsaved text
on that device is discarded.
_Avoid_: Logout (the button's label, not a different event)

**Lost session**:
A session that ended without a Sign out: it expired, the Account was Blocked,
or its password was reset. Every tab on the device becomes a Guest's, but the
Account's Unsaved text is kept for when it signs back in.
_Avoid_: Sign out (for a session the Account did not end itself)

**Pending**:
An Account status reserved for a future email-verification step. Today it
restricts nothing: a Pending Account signs in like an active one.

**Avatar**:
The optional picture an Account shows beside its name, whatever its Role. An
Account without one is shown by its initials.
_Avoid_: Author photo, profile picture, userpic

### Content

**Book**:
A work credited to one or more Co-authors, read as a sequence of Chapters in
its Reading order and optionally grouped into a Series.
_Avoid_: Title, work

**Cover**:
The one optional picture that stands for a Book. A Book without one is shown
with a placeholder bearing its title.
_Avoid_: Image, thumbnail, poster

**Book status**:
Where a Book stands: Draft, In progress or Complete. Every Book has exactly one.
_Avoid_: State (for a Book)

**Draft book**:
A Book kept from readers; only its Co-authors and Moderators can see it. When
it is filed in a Series, that Series's Co-authors also see its title and
status among the Series' Books, so they can order them — never its contents.

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

**Genre**:
A category of the catalogue, from a list Admins and Superadmins keep. A Book
has at most one. A Series may carry its own, set independently of its Books':
a Book never takes its Genre from its Series.
_Avoid_: Category, Tag (for a Genre)

**Tag**:
A free-form label a Book's or Series' Co-authors attach to it, any number of
them and from no list.
_Avoid_: Genre (for a Tag), keyword

**Unsaved text**:
What an Account has typed into a new or an existing Comment or Chapter but not
yet sent. It exists only on the Account's device, one per place it was typed (a
Book's Comment, a reply to one Comment, an edit of one Comment, one Chapter),
survives a reload and the loss of a session, and is
discarded once sent, when its Account signs out, or when another Account signs
in on that device. Text left exactly as it is saved in its place is not
Unsaved text: opening an edit and changing nothing, or changing it back, leaves
nothing behind. If its place is gone (the Chapter or Book deleted, the
Comment made a Tombstone, the Account no longer a Co-author), the Account is
offered a copy before it is discarded. Unsaved text on a Chapter remembers the
version it was typed against: when a Co-author has saved since, the Account
chooses between that Co-author's version and its own, and nothing is
overwritten silently. It is not a Draft book or a Draft chapter.
_Avoid_: Draft (for text not yet sent)

**Device preferences**:
How the app looks and reads on one device, such as its theme, the layout of
search results (grid or list), or how a Chapter reads: its background, font,
font size, line height and text width. The server never sees
them, so another device does not share them,
and signing out keeps them.
_Avoid_: Settings, Profile (both suggest something the Account keeps)

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

**Popularity**:
How many Likes a Book has received, all time. Dislikes and Likes on its
Comments do not count.
_Avoid_: Rating, trending

### Discovery

**Release time**:
The Publication time of a Book's earliest Published Chapter: the moment it
first had something to read. A Book with no Published Chapter has none, so it
is not a New release. Its Book status and creation time do not enter into it.
_Avoid_: Created at, publish date (for a Book)

**New release**:
A Book ranked by its Release time, latest first.
_Avoid_: New book (for any recently created Book)

**Last update**:
The Publication time of a Book's latest Published Chapter. Editing a Book's
details or an existing Chapter does not move it, and neither does a Scheduled
chapter until its Publication time passes.
_Avoid_: Updated at (for a Book)
