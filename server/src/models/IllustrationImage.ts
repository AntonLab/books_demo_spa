import {
  DataTypes,
  Model,
  type CreationOptional,
  type ForeignKey,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';
import type { Illustration } from './Illustration.ts';

// An Illustration's picture (ADR-0007), kept out of illustrations so no
// chapter query can drag the bytes along. illustrationId is the primary key:
// one picture per Illustration, last write wins.
export class IllustrationImage extends Model<
  InferAttributes<IllustrationImage>,
  InferCreationAttributes<IllustrationImage>
> {
  declare illustrationId: ForeignKey<Illustration['id']>;
  declare data: Buffer;
  declare updatedAt: CreationOptional<Date>;
}

export function initIllustrationImageModel(
  sequelize: Sequelize
): typeof IllustrationImage {
  IllustrationImage.init(
    {
      // INTEGER UNSIGNED to match illustrations.id (errno 3780 otherwise). No
      // autoIncrement: this column *is* the link to its Illustration.
      illustrationId: {
        type: DataTypes.INTEGER.UNSIGNED,
        primaryKey: true,
      },
      // Always re-encoded WebP, like a Cover, so no content-type column.
      data: {
        type: DataTypes.BLOB('medium'),
        allowNull: false,
      },
      // Millisecond precision, like book_covers.updatedAt.
      updatedAt: { type: DataTypes.DATE(3), allowNull: false },
    },
    {
      sequelize,
      tableName: 'illustration_images',
      timestamps: true,
      createdAt: false,
      charset: 'utf8mb4',
      collate: 'utf8mb4_0900_ai_ci',
    }
  );

  return IllustrationImage;
}
