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
import type { ReadingListItem } from './ReadingListItem.ts';
import type { User } from './User.ts';

export class ReadingList extends Model<
  InferAttributes<ReadingList>,
  InferCreationAttributes<ReadingList>
> {
  declare id: CreationOptional<number>;
  declare userId: ForeignKey<User['id']>;
  declare title: string;
  declare description: string;
  declare tags: string[];
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Populated only by an eager `include`, under the aliases declared in
  // models/index.ts.
  declare owner?: NonAttribute<User>;
  declare items?: NonAttribute<ReadingListItem[]>;
}

export function initReadingListModel(sequelize: Sequelize): typeof ReadingList {
  ReadingList.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      // INTEGER UNSIGNED like the id it references, or MySQL rejects the
      // foreign key with errno 3780.
      userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      title: { type: DataTypes.STRING(200), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: false },
      // JSON, as on Series: MySQL has no array type, and a JSON column cannot
      // carry a literal DEFAULT.
      tags: { type: DataTypes.JSON, allowNull: false },
      // Millisecond precision: lists are ordered by updatedAt, and two edits
      // inside one second must rarely tie. Declaring the timestamps opts out
      // of Sequelize's implicit NOT NULL.
      createdAt: { type: DataTypes.DATE(3), allowNull: false },
      updatedAt: { type: DataTypes.DATE(3), allowNull: false },
    },
    {
      sequelize,
      tableName: 'reading_lists',
      timestamps: true,
      charset: 'utf8mb4',
      collate: 'utf8mb4_0900_ai_ci',
      indexes: [
        // An owner's lists, newest change first. Its leftmost column is also
        // the index the userId foreign key needs.
        {
          name: 'reading_lists_user_id_updated_at',
          fields: ['userId', 'updatedAt'],
        },
      ],
    }
  );

  return ReadingList;
}
