import {
  col,
  fn,
  ForeignKeyConstraintError,
  Op,
  where as sequelizeWhere,
} from 'sequelize';
import type { WhereOptions } from 'sequelize';
import { Series, toPublicSeries } from '../models/Series.ts';
import { NotFoundError } from '../types/errors.ts';
import type {
  CreateSeriesInput,
  ListSeriesQuery,
  PublicSeries,
  UpdateSeriesInput,
} from '../types/series.ts';
import { containsPattern } from './likePattern.ts';

export interface SeriesListResult {
  items: PublicSeries[];
  total: number;
}

export interface SeriesRepository {
  create(input: CreateSeriesInput): Promise<PublicSeries>;
  list(query: ListSeriesQuery): Promise<SeriesListResult>;
  findById(id: number): Promise<PublicSeries | null>;
  update(id: number, input: UpdateSeriesInput): Promise<PublicSeries | null>;
  remove(id: number): Promise<boolean>;
}

// A rejected FK on `series.userId` means the referenced user does not exist.
// Reporting that as a 404 on the user is more useful than the generic 500 an
// unmapped SequelizeForeignKeyConstraintError would produce.
function asMissingUser(error: unknown, userId: number): never {
  if (error instanceof ForeignKeyConstraintError) {
    throw new NotFoundError('User', userId);
  }
  throw error;
}

function buildWhere(query: ListSeriesQuery): WhereOptions {
  const clauses: WhereOptions[] = [];

  if (query.userId !== undefined) {
    clauses.push({ userId: query.userId });
  }

  if (query.tag) {
    // MySQL cannot index into a plain JSON array with `=`, so membership goes
    // through JSON_CONTAINS. The tag is passed as an argument to fn(), which
    // Sequelize escapes as a literal — it is never concatenated into the SQL.
    clauses.push(
      sequelizeWhere(
        fn('JSON_CONTAINS', col('tags'), JSON.stringify(query.tag)),
        Op.eq,
        1
      )
    );
  }

  if (query.q) {
    clauses.push({ description: { [Op.like]: containsPattern(query.q) } });
  }

  return clauses.length > 0 ? { [Op.and]: clauses } : {};
}

export function createSequelizeSeriesRepository(): SeriesRepository {
  return {
    async create(input) {
      try {
        const series = await Series.create(input);
        return toPublicSeries(series);
      } catch (error) {
        asMissingUser(error, input.userId);
      }
    },

    async list(query) {
      const { rows, count } = await Series.findAndCountAll({
        where: buildWhere(query),
        limit: query.limit,
        offset: query.offset,
        order: [['id', 'ASC']],
      });

      return { items: rows.map(toPublicSeries), total: count };
    },

    async findById(id) {
      const series = await Series.findByPk(id);
      return series ? toPublicSeries(series) : null;
    },

    async update(id, input) {
      const series = await Series.findByPk(id);
      if (!series) return null;

      await series.update(input);
      return toPublicSeries(series);
    },

    async remove(id) {
      const deleted = await Series.destroy({ where: { id } });
      return deleted > 0;
    },
  };
}
