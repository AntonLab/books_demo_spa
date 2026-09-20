import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';
import type { PublicGenre } from '../types/genre.ts';

// A category of the catalogue, from the list Admins and Superadmins keep
// (CONTEXT.md, ADR-0008). A Book or a Series points at one or at none; nothing
// here knows about either, and no Genre has an Owner.
export class Genre extends Model<
  InferAttributes<Genre>,
  InferCreationAttributes<Genre>
> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initGenreModel(sequelize: Sequelize): typeof Genre {
  Genre.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      // VARCHAR(50) rather than TEXT: the name is short, and only a bounded
      // column can carry the unique index below. Under utf8mb4 a 50-character
      // index entry is 200 bytes, well inside InnoDB's 3072-byte key limit.
      name: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      // See User.ts: declaring the timestamps ourselves opts out of Sequelize's
      // implicit NOT NULL, so it is restated here.
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      tableName: 'genres',
      timestamps: true,
      charset: 'utf8mb4',
      collate: 'utf8mb4_0900_ai_ci',
      indexes: [
        // Uniqueness belongs in the schema, never a findOne first — that is a
        // check-then-write race. The column inherits the table's
        // utf8mb4_0900_ai_ci collation, so this index refuses "fantasy" beside
        // "Fantasy" (M1), and the repository maps its violation to a 409.
        {
          name: 'genres_name',
          unique: true,
          fields: ['name'],
        },
      ],
    }
  );

  return Genre;
}

export function toPublicGenre(genre: Genre): PublicGenre {
  return {
    id: genre.id,
    name: genre.name,
  };
}
