import {
  DataTypes,
  literal,
  Model,
  Op,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
  type Transaction,
} from 'sequelize';
import { GENRE_NAME_MAX_LENGTH, type PublicGenre } from 'shared';

// A category of the catalogue, from the list Admins and Superadmins keep
// (CONTEXT.md, ADR-0008). A Book or a Series points at one or at none; nothing
// here knows about either, and no Genre has an Owner.
export class Genre extends Model<
  InferAttributes<Genre>,
  InferCreationAttributes<Genre>
> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare parentId: CreationOptional<number | null>;
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
        type: DataTypes.STRING(GENRE_NAME_MAX_LENGTH),
        allowNull: false,
      },
      // The Genre this one is a Subgenre of; null at the top level. RESTRICT:
      // a parent with a Subgenre cannot be deleted.
      parentId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        references: { model: 'genres', key: 'id' },
        onDelete: 'RESTRICT',
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
        // check-then-write race. A name is unique among its siblings: IFNULL
        // folds every top-level Genre into one scope (a plain UNIQUE would let
        // NULL parents repeat). The column inherits the table's
        // utf8mb4_0900_ai_ci collation, so this index refuses "fantasy" beside
        // "Fantasy", and the repository maps its violation to a 409.
        {
          name: 'genres_parent_name',
          unique: true,
          fields: [literal('(IFNULL(`parentId`, 0))'), 'name'],
        },
      ],
    }
  );

  return Genre;
}

// Deletes Subgenres first: the self-foreign key is RESTRICT, and one bulk
// DELETE can remove a parent before its child.
export async function destroyAllGenres(
  transaction?: Transaction
): Promise<void> {
  await Genre.destroy({ where: { parentId: { [Op.ne]: null } }, transaction });
  await Genre.destroy({ where: {}, transaction });
}

export function toPublicGenre(
  genre: Genre,
  parent: Pick<Genre, 'id' | 'name'> | null
): PublicGenre {
  return {
    id: genre.id,
    name: genre.name,
    parent: parent && { id: parent.id, name: parent.name },
  };
}
