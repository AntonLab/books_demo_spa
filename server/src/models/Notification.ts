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
import type { Series } from './Series.ts';
import type { User } from './User.ts';
import type {
  ActorKind,
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
  // each keeps a real foreign key. The one workType names is set while that
  // work exists; the other is always null.
  declare bookId: CreationOptional<ForeignKey<Book['id']> | null>;
  declare seriesId: CreationOptional<ForeignKey<Series['id']> | null>;
  declare workTitle: string;
  declare actorKind: ActorKind;
  declare actorName: CreationOptional<string | null>;
  declare isRead: CreationOptional<boolean>;
  // No updatedAt: marking a notification read is the only change it ever
  // takes, and nothing reads when that happened.
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
        allowNull: false,
      },
      // A first and a last name of up to 64 characters each, and the space.
      actorName: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      isRead: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
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
        // its list, which takes a filesort over that one account's rows. It
        // is also a leftmost prefix of userId's foreign key, so InnoDB reuses
        // it rather than adding a second index for the constraint.
        {
          name: 'notifications_user_id_is_read',
          fields: ['userId', 'isRead'],
        },
      ],
    }
  );

  return Notification;
}

export function toPublicNotification(
  notification: Notification
): PublicNotification {
  const workId =
    notification.workType === 'book'
      ? notification.bookId
      : notification.seriesId;

  return {
    id: notification.id,
    kind: notification.kind,
    work: {
      type: notification.workType,
      id: workId ?? null,
      title: notification.workTitle,
    },
    actor: {
      kind: notification.actorKind,
      name: notification.actorName ?? null,
    },
    isRead: notification.isRead,
    createdAt: notification.createdAt,
  };
}
