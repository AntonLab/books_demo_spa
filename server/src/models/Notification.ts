import {
  DataTypes,
  Model,
  type CreationOptional,
  type ForeignKey,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';
import type { Book } from './Book.ts';
import type { Chapter } from './Chapter.ts';
import type { Series } from './Series.ts';
import type { User } from './User.ts';
import type {
  ActorKind,
  CreditNotificationKind,
  NotificationKind,
  PublicNotification,
  WorkType,
} from 'shared';
import { ACTOR_KINDS, NOTIFICATION_KINDS, WORK_TYPES } from 'shared';

// A snapshot, not a view: everything a notification says is copied onto the
// row when it is raised, so it reads the same after the work is renamed or
// deleted and after the actor's account is gone. Only the link to the work is
// live, and it is nulled when the work goes.
export class Notification extends Model<
  InferAttributes<Notification>,
  InferCreationAttributes<Notification>
> {
  declare id: CreationOptional<number>;
  // The recipient.
  declare userId: ForeignKey<User['id']>;
  declare kind: NotificationKind;
  declare workType: WorkType;
  // Two links rather than one polymorphic id, like a like's two targets, so
  // each keeps a real foreign key. A credit notification sets the one workType
  // names; a New book sets both, the book as its work and its Series beside it.
  declare bookId: CreationOptional<ForeignKey<Book['id']> | null>;
  declare seriesId: CreationOptional<ForeignKey<Series['id']> | null>;
  declare workTitle: string;
  // Null only for an announcement, which nobody performed.
  declare actorKind: CreationOptional<ActorKind | null>;
  declare actorName: CreationOptional<string | null>;
  // A New chapter's first unread Chapter (live link, SET NULL) and its title
  // as it was; chapterCount is how many new Chapters the row gathers.
  declare chapterId: CreationOptional<ForeignKey<Chapter['id']> | null>;
  declare chapterTitle: CreationOptional<string | null>;
  declare chapterCount: CreationOptional<number | null>;
  // A New book's Series title as it was.
  declare seriesTitle: CreationOptional<string | null>;
  // null while unread. The list hides a row, and the expiry purge deletes it,
  // once this is older than NOTIFICATION_READ_TTL_MS.
  declare readAt: CreationOptional<Date | null>;
  // No updatedAt: marking a notification read is the only change it ever
  // takes, and readAt already records when.
  declare createdAt: CreationOptional<Date>;
}

export function initNotificationModel(
  sequelize: Sequelize
): typeof Notification {
  Notification.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      kind: {
        type: DataTypes.ENUM(...NOTIFICATION_KINDS),
        allowNull: false,
      },
      workType: {
        type: DataTypes.ENUM(...WORK_TYPES),
        allowNull: false,
      },
      bookId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      seriesId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      // The width of books.title and series.title, which it copies.
      workTitle: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      actorKind: {
        type: DataTypes.ENUM(...ACTOR_KINDS),
        allowNull: true,
      },
      // A first and a last name of up to 64 characters each, and the space.
      actorName: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      chapterId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      // The width of chapters.title and series.title, which they copy.
      chapterTitle: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      chapterCount: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      seriesTitle: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      readAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      // See User.ts: declaring the timestamp ourselves opts out of Sequelize's
      // implicit NOT NULL, so it is restated here.
      createdAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      tableName: 'notifications',
      timestamps: true,
      updatedAt: false,
      charset: 'utf8mb4',
      collate: 'utf8mb4_0900_ai_ci',
      indexes: [
        // Serves both reads the bell makes: one account's unread count, and
        // its list of live rows, which takes a filesort over that one
        // account's rows. It is also a leftmost prefix of userId's foreign
        // key, so InnoDB reuses it rather than adding a second index for the
        // constraint.
        {
          name: 'notifications_user_id_read_at',
          fields: ['userId', 'readAt'],
        },
        // The hourly expiry purge deletes by readAt alone, which the index
        // above cannot serve: its leading column is userId.
        {
          name: 'notifications_read_at',
          fields: ['readAt'],
        },
      ],
    }
  );

  return Notification;
}

export function toPublicNotification(
  notification: Notification
): PublicNotification {
  const base = {
    id: notification.id,
    readAt: notification.readAt ?? null,
    createdAt: notification.createdAt,
  };
  const bookWork = {
    type: 'book' as const,
    id: notification.bookId ?? null,
    title: notification.workTitle,
  };

  const { kind } = notification;
  switch (kind) {
    case 'new_chapter':
      return {
        ...base,
        kind,
        work: bookWork,
        chapter: {
          id: notification.chapterId ?? null,
          title: notification.chapterTitle ?? '',
        },
        chapterCount: notification.chapterCount ?? 1,
      };
    case 'new_book':
      return {
        ...base,
        kind,
        work: bookWork,
        series: {
          id: notification.seriesId ?? null,
          title: notification.seriesTitle ?? '',
        },
      };
    case 'co_author_added':
    case 'co_author_removed':
    case 'co_author_left':
    case 'co_author_account_deleted':
    case 'work_deleted':
      return toCreditNotification(notification, kind, base);
  }
}

function toCreditNotification(
  notification: Notification,
  kind: CreditNotificationKind,
  base: { id: number; readAt: Date | null; createdAt: Date }
): PublicNotification {
  // notify always writes one; a row without it was written some other way.
  if (notification.actorKind === null || notification.actorKind === undefined)
    throw new Error(`Notification ${notification.id} has no actor`);

  const workId =
    notification.workType === 'book'
      ? notification.bookId
      : notification.seriesId;
  return {
    ...base,
    kind,
    work: {
      type: notification.workType,
      id: workId ?? null,
      title: notification.workTitle,
    },
    actor: {
      kind: notification.actorKind,
      name: notification.actorName ?? null,
    },
  };
}
