import { Op } from 'sequelize';
import type { PublicIllustration } from 'shared';
import { BookAuthor } from '../models/BookAuthor.ts';
import { Chapter } from '../models/Chapter.ts';
import { Illustration, toPublicIllustration } from '../models/Illustration.ts';
import { IllustrationImage } from '../models/IllustrationImage.ts';
import { readableChapterScope, type Viewer } from './visibility.ts';

export interface IllustrationRepository {
  // null when the chapter is missing or the viewer may not read it (same 404).
  list(chapterId: number, viewer: Viewer): Promise<PublicIllustration[] | null>;
  // null when the illustration is missing or its chapter is not readable.
  getImageData(
    id: number,
    viewer: Viewer
  ): Promise<{ data: Buffer; updatedAt: Date } | null>;
  // The Co-author ids of the illustration's book; null when it is missing.
  findCoAuthorIds(id: number): Promise<number[] | null>;
}

// An Illustration is as readable as its Chapter: the same scope as
// chapterRepository.findById.
async function isChapterReadable(
  chapterId: number,
  viewer: Viewer
): Promise<boolean> {
  const scope = await readableChapterScope(viewer);
  const chapter = await Chapter.findOne({
    where: { [Op.and]: [{ id: chapterId }, scope.where] },
    include: [scope.include],
    attributes: ['id'],
  });
  return chapter !== null;
}

export function createSequelizeIllustrationRepository(): IllustrationRepository {
  return {
    async list(chapterId, viewer) {
      if (!(await isChapterReadable(chapterId, viewer))) return null;

      // The bytes live in illustration_images, so no SELECT here can fetch them.
      const rows = await Illustration.findAll({
        where: { chapterId },
        order: [
          ['position', 'ASC'],
          ['id', 'ASC'],
        ],
      });
      return rows.map(toPublicIllustration);
    },

    async getImageData(id, viewer) {
      const illustration = await Illustration.findByPk(id, {
        attributes: ['id', 'chapterId'],
      });
      if (!illustration) return null;
      if (!(await isChapterReadable(illustration.chapterId, viewer))) {
        return null;
      }

      const image = await IllustrationImage.findByPk(id);
      return image ? { data: image.data, updatedAt: image.updatedAt } : null;
    },

    async findCoAuthorIds(id) {
      const illustration = await Illustration.findByPk(id, {
        attributes: ['id', 'chapterId'],
      });
      if (!illustration) return null;

      const chapter = await Chapter.findByPk(illustration.chapterId, {
        attributes: ['id', 'bookId'],
      });
      if (!chapter) return null;

      const credits = await BookAuthor.findAll({
        where: { bookId: chapter.bookId },
        attributes: ['userId'],
      });
      return credits.map((credit) => credit.userId);
    },
  };
}
