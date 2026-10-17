import {
  DataTypes,
  Model,
  type CreationOptional,
  type ForeignKey,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';
import { ILLUSTRATION_CAPTION_MAX_LENGTH } from 'shared';
import type { Chapter } from './Chapter.ts';

// A picture placed in a Chapter. The bytes live in illustration_images.
export class Illustration extends Model<
  InferAttributes<Illustration>,
  InferCreationAttributes<Illustration>
> {
  declare id: CreationOptional<number>;
  declare chapterId: ForeignKey<Chapter['id']>;
  // 1-based and gapped after a delete, like chapters.position.
  declare position: number;
  declare caption: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initIllustrationModel(
  sequelize: Sequelize
): typeof Illustration {
  Illustration.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      // INTEGER UNSIGNED to match chapters.id (errno 3780 otherwise).
      chapterId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      // No default: a row inserted without a place should fail loudly.
      position: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      caption: {
        type: DataTypes.STRING(ILLUSTRATION_CAPTION_MAX_LENGTH),
        allowNull: true,
      },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      // Millisecond precision, like chapters.updatedAt.
      updatedAt: { type: DataTypes.DATE(3), allowNull: false },
    },
    {
      sequelize,
      tableName: 'illustrations',
      timestamps: true,
      charset: 'utf8mb4',
      collate: 'utf8mb4_0900_ai_ci',
      indexes: [
        // Serves the per-chapter list in position order and doubles as the FK
        // index. Not unique: a reorder rewrites every position in one UPDATE.
        {
          name: 'illustrations_chapter_id_position',
          fields: ['chapterId', 'position'],
        },
      ],
    }
  );

  return Illustration;
}
