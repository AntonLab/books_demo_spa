import {
  DataTypes,
  Model,
  type CreationOptional,
  type ForeignKey,
  type InferAttributes,
  type InferCreationAttributes,
  type NonAttribute,
  type Sequelize,
} from 'sequelize';
import {
  REPORT_EXPLANATION_MAX_LENGTH,
  REPORT_REASONS,
  REPORT_STATUSES,
  type ReportReason,
  type ReportStatus,
} from 'shared';
import type { Comment } from './Comment.ts';
import type { User } from './User.ts';

export class Report extends Model<
  InferAttributes<Report>,
  InferCreationAttributes<Report>
> {
  declare id: CreationOptional<number>;
  declare commentId: ForeignKey<Comment['id']>;
  // Null for a System report, and after the reporter's Account is deleted.
  declare reporterId: CreationOptional<ForeignKey<User['id']> | null>;
  declare isSystem: CreationOptional<boolean>;
  // The Comment's Owner when the Report was made; null once that Account is
  // deleted.
  declare reportedAccountId: ForeignKey<User['id']> | null;
  declare reason: ReportReason;
  declare explanation: CreationOptional<string | null>;
  declare status: CreationOptional<ReportStatus>;
  declare moderatorId: CreationOptional<ForeignKey<User['id']> | null>;
  // The Comment's text at the moment a Moderator dismissed the Report.
  declare settledText: CreationOptional<string | null>;
  declare takenAt: CreationOptional<Date | null>;
  declare settledAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Populated only by an eager `include`, under the aliases declared in
  // models/index.ts.
  declare comment?: NonAttribute<Comment>;
  declare reporter?: NonAttribute<User>;
  declare reportedAccount?: NonAttribute<User>;
  declare moderator?: NonAttribute<User>;
}

export function initReportModel(sequelize: Sequelize): typeof Report {
  Report.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      // INTEGER UNSIGNED like the ids they reference, or MySQL rejects the
      // foreign key with errno 3780. The Account references are nullable: an
      // Account's delete nulls them and the Report stays.
      commentId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      reporterId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      isSystem: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      reportedAccountId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      reason: { type: DataTypes.ENUM(...REPORT_REASONS), allowNull: false },
      explanation: {
        type: DataTypes.STRING(REPORT_EXPLANATION_MAX_LENGTH),
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM(...REPORT_STATUSES),
        allowNull: false,
        defaultValue: 'new',
      },
      moderatorId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      // Same type as comments.text, which it copies.
      settledText: { type: DataTypes.TEXT, allowNull: true },
      takenAt: { type: DataTypes.DATE, allowNull: true },
      settledAt: { type: DataTypes.DATE, allowNull: true },
      // See User.ts: declaring the timestamps ourselves opts out of Sequelize's
      // implicit NOT NULL, so it is restated here.
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      tableName: 'reports',
      timestamps: true,
      charset: 'utf8mb4',
      collate: 'utf8mb4_0900_ai_ci',
      indexes: [
        // One Report per Comment and reporter. NULLs are distinct in a unique
        // index, so System reports (no reporter) coexist; the index leads with
        // commentId, which also backs that foreign key.
        {
          name: 'reports_comment_id_reporter_id',
          fields: ['commentId', 'reporterId'],
          unique: true,
        },
        // Each other foreign key leads an index, or the SET NULL from Users
        // scans the table.
        {
          name: 'reports_reported_account_id_status',
          fields: ['reportedAccountId', 'status'],
        },
        { name: 'reports_reporter_id', fields: ['reporterId'] },
        { name: 'reports_moderator_id', fields: ['moderatorId'] },
        // The list's range and order; the statistics' settled-in-range read.
        { name: 'reports_created_at', fields: ['createdAt'] },
        { name: 'reports_status_settled_at', fields: ['status', 'settledAt'] },
      ],
    }
  );

  return Report;
}
