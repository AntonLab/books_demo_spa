import type { Sequelize } from 'sequelize';
import { initBookModel, Book } from './Book.ts';
import { initChapterModel, Chapter } from './Chapter.ts';
import { initCommentModel, Comment } from './Comment.ts';
import { initLikeModel, Like } from './Like.ts';
import { initSeriesModel, Series } from './Series.ts';
import { initUserModel, User } from './User.ts';

export interface Models {
  User: typeof User;
  Series: typeof Series;
  Book: typeof Book;
  Chapter: typeof Chapter;
  Comment: typeof Comment;
  Like: typeof Like;
}

export function initModels(sequelize: Sequelize): Models {
  initUserModel(sequelize);
  initSeriesModel(sequelize);
  initBookModel(sequelize);
  initChapterModel(sequelize);
  initCommentModel(sequelize);
  initLikeModel(sequelize);

  // Associations are declared after every model is initialised, so the target
  // is always a registered model no matter what order the files load in.
  User.hasMany(Series, {
    as: 'series',
    foreignKey: 'userId',
    // Deleting a user takes their series with them; nothing else references
    // them, and an orphaned series has no owner to answer for it.
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  });
  Series.belongsTo(User, { as: 'user', foreignKey: 'userId' });

  User.hasMany(Book, {
    as: 'books',
    foreignKey: 'userId',
    // Same reasoning as series: a book with no owner answers to nobody.
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  });
  Book.belongsTo(User, { as: 'user', foreignKey: 'userId' });

  Series.hasMany(Book, {
    as: 'books',
    // allowNull is restated here so Sequelize does not infer NOT NULL from the
    // association and quietly make SET NULL illegal.
    foreignKey: { name: 'seriesId', allowNull: true },
    // Not CASCADE, unlike the two above: seriesId is optional, so a book can
    // stand alone. Dropping the series unlinks its books rather than
    // destroying records the user never asked to delete.
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  });
  Book.belongsTo(Series, { as: 'series', foreignKey: 'seriesId' });

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
    foreignKey: 'userId',
    // Same reasoning as series and books: a comment with no author answers to
    // nobody. This reaches further than it looks — deleting a user removes
    // comments other people may have replied to, which is exactly the case the
    // SET NULL below has to survive.
    onDelete: 'CASCADE',
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
  //   ON DELETE SET NULL  both stay working; a deleted comment leaves its
  //                       direct replies behind as top-level comments.
  //
  // So SET NULL, on the same reasoning that gave books.seriesId its: unlinking
  // beats destroying records nobody asked to delete. Removing a whole subtree
  // is an application-level operation (walk it, then delete in one statement
  // inside a transaction), not something to hand to InnoDB.
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

  return { User, Series, Book, Chapter, Comment, Like };
}

export { User, toPublicUser } from './User.ts';
export { Series, toPublicSeries } from './Series.ts';
export { Book, toPublicBook } from './Book.ts';
export { Chapter, toChapterSummary, toPublicChapter } from './Chapter.ts';
export { Comment, toPublicComment } from './Comment.ts';
export { Like, toPublicLike } from './Like.ts';
