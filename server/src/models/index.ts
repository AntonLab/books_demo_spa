import type { Sequelize } from 'sequelize';
import { initBookModel, Book } from './Book.ts';
import { initBookAuthorModel, BookAuthor } from './BookAuthor.ts';
import { initBookCoverModel, BookCover } from './BookCover.ts';
import { initChapterModel, Chapter } from './Chapter.ts';
import { initCommentModel, Comment } from './Comment.ts';
import { initGenreModel, Genre } from './Genre.ts';
import { initLikeModel, Like } from './Like.ts';
import { initNotificationModel, Notification } from './Notification.ts';
import {
  initPasswordResetTokenModel,
  PasswordResetToken,
} from './PasswordResetToken.ts';
import { initPermissionModel, Permission } from './Permission.ts';
import { initSeriesModel, Series } from './Series.ts';
import { initSeriesAuthorModel, SeriesAuthor } from './SeriesAuthor.ts';
import { initSessionModel, Session } from './Session.ts';
import { initUserModel, User } from './User.ts';
import { initUserAvatarModel, UserAvatar } from './UserAvatar.ts';

export interface Models {
  User: typeof User;
  UserAvatar: typeof UserAvatar;
  Series: typeof Series;
  SeriesAuthor: typeof SeriesAuthor;
  Book: typeof Book;
  BookCover: typeof BookCover;
  BookAuthor: typeof BookAuthor;
  Chapter: typeof Chapter;
  Genre: typeof Genre;
  Comment: typeof Comment;
  Like: typeof Like;
  Notification: typeof Notification;
  Session: typeof Session;
  PasswordResetToken: typeof PasswordResetToken;
  Permission: typeof Permission;
}

export function initModels(sequelize: Sequelize): Models {
  initUserModel(sequelize);
  initUserAvatarModel(sequelize);
  // Reference data, unrelated to any row — no association block follows it.
  initPermissionModel(sequelize);
  // The catalogue's Genres. Initialised before series and books, which
  // reference it (M2).
  initGenreModel(sequelize);
  initSeriesModel(sequelize);
  initSeriesAuthorModel(sequelize);
  initBookModel(sequelize);
  initBookCoverModel(sequelize);
  initBookAuthorModel(sequelize);
  initChapterModel(sequelize);
  initCommentModel(sequelize);
  initLikeModel(sequelize);
  initNotificationModel(sequelize);
  initSessionModel(sequelize);
  initPasswordResetTokenModel(sequelize);

  // Associations are declared after every model is initialised, so the target
  // is always a registered model no matter what order the files load in.
  // An Account's Avatar (S1/S3, ADR-0007): one row, cascading with the
  // Account — deleting a User removes its Avatar with no application code.
  User.hasOne(UserAvatar, {
    as: 'avatar',
    foreignKey: 'userId',
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  });
  UserAvatar.belongsTo(User, { as: 'user', foreignKey: 'userId' });

  // A series' Co-authors, the same shape as a book's below (ADR-0005). Both
  // sides cascade; userRepository.remove deletes the series an account was the
  // last Co-author of before its credits go.
  Series.hasMany(SeriesAuthor, {
    as: 'credits',
    foreignKey: 'seriesId',
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  });
  SeriesAuthor.belongsTo(Series, { as: 'series', foreignKey: 'seriesId' });

  User.hasMany(SeriesAuthor, {
    as: 'seriesCredits',
    foreignKey: 'userId',
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  });
  SeriesAuthor.belongsTo(User, { as: 'user', foreignKey: 'userId' });

  Series.hasMany(Book, {
    as: 'books',
    // allowNull is restated here so Sequelize does not infer NOT NULL from the
    // association and quietly make SET NULL illegal.
    foreignKey: { name: 'seriesId', allowNull: true },
    // Not CASCADE, unlike the credits above: seriesId is optional, so a book can
    // stand alone. Dropping the series unlinks its books rather than
    // destroying records the user never asked to delete.
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  });
  Book.belongsTo(Series, { as: 'series', foreignKey: 'seriesId' });

  // A book's Co-authors (ADR-0005). Both sides cascade: a credit means nothing
  // without its book or its account. Deleting an account therefore drops its
  // credits — userRepository.remove deletes the books it was the last
  // Co-author of first, so no book is ever left with nobody credited.
  Book.hasMany(BookAuthor, {
    as: 'credits',
    foreignKey: 'bookId',
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  });
  BookAuthor.belongsTo(Book, { as: 'book', foreignKey: 'bookId' });

  User.hasMany(BookAuthor, {
    as: 'bookCredits',
    foreignKey: 'userId',
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  });
  BookAuthor.belongsTo(User, { as: 'user', foreignKey: 'userId' });

  // A Book's Cover (S1/S3, ADR-0007): one row, cascading with the Book —
  // deleting a Book removes its Cover with no application code.
  Book.hasOne(BookCover, {
    as: 'cover',
    foreignKey: 'bookId',
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  });
  BookCover.belongsTo(Book, { as: 'book', foreignKey: 'bookId' });

  Book.hasMany(Chapter, {
    as: 'chapters',
    foreignKey: 'bookId',
    // CASCADE rather than the SET NULL used for books.seriesId: bookId is NOT
    // NULL, because a chapter belonging to no book is not a state worth
    // representing — and MySQL forbids SET NULL on a NOT NULL column anyway.
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  });
  Chapter.belongsTo(Book, { as: 'book', foreignKey: 'bookId' });

  User.hasMany(Comment, {
    as: 'comments',
    // allowNull is restated so Sequelize does not infer NOT NULL from the
    // association and quietly make SET NULL illegal.
    foreignKey: { name: 'userId', allowNull: true },
    // SET NULL, unlike every other owner reference here: a comment is part of
    // a conversation other people replied to, so it outlives its owner's
    // account as a tombstone. userRepository.remove marks the account's
    // comments `deleted` in the same transaction as the delete; this then
    // nulls their owner. A comment with no owner is therefore never live.
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  });
  Comment.belongsTo(User, { as: 'user', foreignKey: 'userId' });

  Book.hasMany(Comment, {
    as: 'comments',
    foreignKey: 'bookId',
    // Like chapters: bookId is NOT NULL, because a comment on no book is not a
    // state worth representing.
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  });
  Comment.belongsTo(Book, { as: 'book', foreignKey: 'bookId' });

  // The self-association: a reply hangs off the comment it answers. Neither of
  // the shapes above fits it, and the deciding factor is MySQL's cascade depth
  // limit rather than a modelling preference. Measured on MySQL 8.0.46:
  //
  //   ON DELETE CASCADE   deleting a thread nested deeper than 15 fails with
  //                       ER_FK_DEPTH_EXCEEDED (errno 3008) — and so does
  //                       deleting the *book* that owns it, because the cascade
  //                       into comments then recurses through the replies.
  //   ON DELETE RESTRICT  that same book delete fails with errno 1451, the
  //                       cascade tripping over replies it may not remove.
  //   ON DELETE SET NULL  both stay working.
  //
  // The API never hard-deletes a comment — DELETE leaves a tombstone — so a
  // reply keeps its parent for as long as the book lasts. What SET NULL
  // protects now is the one hard delete left: the book's cascade into its
  // comments, whether the book goes directly or with its owner's account,
  // and a bulk DELETE FROM comments such as the test teardown. Both keep
  // working at any thread depth.
  Comment.hasMany(Comment, {
    as: 'replies',
    // allowNull is restated here so Sequelize does not infer NOT NULL from the
    // association and quietly make SET NULL illegal.
    foreignKey: { name: 'parentId', allowNull: true },
    onDelete: 'SET NULL',
    // Not CASCADE, unlike every other association above: MySQL will not
    // recurse an update through the table it is already updating, so a
    // self-referential ON UPDATE CASCADE quietly behaves like RESTRICT
    // (verified: errno 1451). Declaring RESTRICT states what actually happens,
    // and nothing is lost — id is a surrogate key that is never rewritten.
    onUpdate: 'RESTRICT',
  });
  Comment.belongsTo(Comment, { as: 'parent', foreignKey: 'parentId' });

  // A like points at exactly one of a book or a comment, so both foreign keys
  // are nullable — and both cascade, unlike the SET NULL that books.seriesId
  // and comments.parentId use. SET NULL would leave a like with neither target
  // set, which is the one state models/Like.ts exists to forbid; deleting the
  // thing that was liked should take the likes with it.
  //
  // There is no recursion to worry about here, unlike the comment replies: the
  // deepest chain is books -> comments -> likes, well inside InnoDB's cascade
  // limit of 15. Users reach likes by two paths (directly, and through their
  // books and comments), which MySQL allows.
  User.hasMany(Like, {
    as: 'likes',
    foreignKey: 'userId',
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  });
  Like.belongsTo(User, { as: 'user', foreignKey: 'userId' });

  Book.hasMany(Like, {
    as: 'likes',
    // allowNull is restated here so Sequelize does not infer NOT NULL from the
    // association: a like on a comment leaves this column empty.
    foreignKey: { name: 'bookId', allowNull: true },
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  });
  Like.belongsTo(Book, { as: 'book', foreignKey: 'bookId' });

  Comment.hasMany(Like, {
    as: 'likes',
    foreignKey: { name: 'commentId', allowNull: true },
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  });
  Like.belongsTo(Comment, { as: 'comment', foreignKey: 'commentId' });

  // CASCADE, matching every other user-owned association above: a session
  // belonging to a deleted user answers to nobody. There is no recursion
  // concern — users -> sessions is a single level.
  User.hasMany(Session, {
    as: 'sessions',
    foreignKey: 'userId',
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  });
  Session.belongsTo(User, { as: 'user', foreignKey: 'userId' });

  // CASCADE, for the same reason as sessions: a reset token belonging to a
  // deleted user answers to nobody.
  User.hasMany(PasswordResetToken, {
    as: 'passwordResetTokens',
    foreignKey: 'userId',
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  });
  PasswordResetToken.belongsTo(User, { as: 'user', foreignKey: 'userId' });

  // A notification belongs to its recipient and goes with them. Its links to a
  // book or a series only unlink when the work is deleted, like books.seriesId:
  // the snapshot beside them — title, actor — is the point of keeping the row,
  // and the "work deleted" notification itself names a work that is gone.
  User.hasMany(Notification, {
    as: 'notifications',
    foreignKey: 'userId',
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  });
  Notification.belongsTo(User, { as: 'user', foreignKey: 'userId' });

  Book.hasMany(Notification, {
    as: 'notifications',
    foreignKey: { name: 'bookId', allowNull: true },
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  });
  Notification.belongsTo(Book, { as: 'book', foreignKey: 'bookId' });

  Series.hasMany(Notification, {
    as: 'notifications',
    foreignKey: { name: 'seriesId', allowNull: true },
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  });
  Notification.belongsTo(Series, { as: 'series', foreignKey: 'seriesId' });

  return {
    User,
    UserAvatar,
    Series,
    SeriesAuthor,
    Book,
    BookCover,
    BookAuthor,
    Chapter,
    Genre,
    Comment,
    Like,
    Notification,
    Session,
    PasswordResetToken,
    Permission,
  };
}

export { User, toPublicUser } from './User.ts';
export { UserAvatar } from './UserAvatar.ts';
export { Series, toPublicSeries } from './Series.ts';
export { SeriesAuthor } from './SeriesAuthor.ts';
export { Book, toPublicBook } from './Book.ts';
export { BookCover } from './BookCover.ts';
export { BookAuthor } from './BookAuthor.ts';
export { Chapter, toChapterSummary, toPublicChapter } from './Chapter.ts';
export { Genre, toPublicGenre } from './Genre.ts';
export { Comment, toPublicComment } from './Comment.ts';
export { Like, toPublicLike } from './Like.ts';
export { Notification, toPublicNotification } from './Notification.ts';
export { Session } from './Session.ts';
export { PasswordResetToken } from './PasswordResetToken.ts';
export { Permission, toPublicPermission } from './Permission.ts';
