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
import type { Book } from './Book.ts';
import type { ReadingList } from './ReadingList.ts';
import type { Series } from './Series.ts';

export class ReadingListItem extends Model<
  InferAttributes<ReadingListItem>,
  InferCreationAttributes<ReadingListItem>
> {
  declare id: CreationOptional<number>;
  declare listId: ForeignKey<ReadingList['id']>;
  // Both nullable only so "exactly one" is expressible in two columns, as on
  // favorites; the validator below holds the invariant.
  declare bookId: CreationOptional<ForeignKey<Book['id']> | null>;
  declare seriesId: CreationOptional<ForeignKey<Series['id']> | null>;
  declare position: number;

  // Populated only by an eager `include`.
  declare book?: NonAttribute<Book>;
  declare series?: NonAttribute<Series>;
}

// A named function with an explicit `this`, so strict mode sees no implicit
// any. MySQL gets no CHECK for this (see .claude/rules/server/sequelize.md).
function exactlyOneTarget(this: ReadingListItem): void {
  if ((this.bookId == null) === (this.seriesId == null)) {
    throw new Error('Exactly one of bookId or seriesId must be set');
  }
}

export function initReadingListItemModel(
  sequelize: Sequelize
): typeof ReadingListItem {
  ReadingListItem.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      // INTEGER UNSIGNED to match the referenced ids (errno 3780 otherwise).
      listId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      bookId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      seriesId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      position: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    },
    {
      sequelize,
      tableName: 'reading_list_items',
      // An item has no dates: the list's updatedAt carries the change.
      timestamps: false,
      charset: 'utf8mb4',
      collate: 'utf8mb4_0900_ai_ci',
      validate: { exactlyOneTarget },
      indexes: [
        // Each foreign key to a work needs an index of its own, or the cascade
        // from Book or Series scans the table.
        { name: 'reading_list_items_book_id', fields: ['bookId'] },
        { name: 'reading_list_items_series_id', fields: ['seriesId'] },
        // A work appears once per list. NULLs are distinct in a unique index,
        // so the two pairs do not interfere; both lead with listId, which also
        // backs that foreign key.
        {
          name: 'reading_list_items_list_id_book_id',
          fields: ['listId', 'bookId'],
          unique: true,
        },
        {
          name: 'reading_list_items_list_id_series_id',
          fields: ['listId', 'seriesId'],
          unique: true,
        },
        // A list's items in reading order.
        {
          name: 'reading_list_items_list_id_position',
          fields: ['listId', 'position'],
        },
      ],
    }
  );

  return ReadingListItem;
}
