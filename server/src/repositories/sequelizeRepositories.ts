import {
  createSequelizeBookRepository,
  type BookRepository,
} from './bookRepository.ts';
import {
  createSequelizeChapterRepository,
  type ChapterRepository,
} from './chapterRepository.ts';
import {
  createSequelizeCommentRepository,
  type CommentRepository,
} from './commentRepository.ts';
import {
  createSequelizeGenreRepository,
  type GenreRepository,
} from './genreRepository.ts';
import {
  createSequelizeLikeRepository,
  type LikeRepository,
} from './likeRepository.ts';
import {
  createSequelizeNotificationRepository,
  type NotificationRepository,
} from './notificationRepository.ts';
import {
  createSequelizePasswordResetRepository,
  type PasswordResetRepository,
} from './passwordResetRepository.ts';
import {
  createSequelizeSeriesRepository,
  type SeriesRepository,
} from './seriesRepository.ts';
import {
  createSequelizeSessionRepository,
  type SessionRepository,
} from './sessionRepository.ts';
import {
  createSequelizeUserRepository,
  type UserRepository,
} from './userRepository.ts';

// Every repository the routes use. Two adapters fill it: the Sequelize ones
// below, for index.ts and app.spec.ts, and the in-memory fakes the route test
// kit builds.
export interface Repositories {
  userRepository: UserRepository;
  seriesRepository: SeriesRepository;
  bookRepository: BookRepository;
  chapterRepository: ChapterRepository;
  genreRepository: GenreRepository;
  commentRepository: CommentRepository;
  likeRepository: LikeRepository;
  notificationRepository: NotificationRepository;
  sessionRepository: SessionRepository;
  passwordResetRepository: PasswordResetRepository;
}

// Needs initModels() to have run: each repository reads the models at call
// time, not here.
export function createSequelizeRepositories(): Repositories {
  return {
    userRepository: createSequelizeUserRepository(),
    seriesRepository: createSequelizeSeriesRepository(),
    bookRepository: createSequelizeBookRepository(),
    chapterRepository: createSequelizeChapterRepository(),
    genreRepository: createSequelizeGenreRepository(),
    commentRepository: createSequelizeCommentRepository(),
    likeRepository: createSequelizeLikeRepository(),
    notificationRepository: createSequelizeNotificationRepository(),
    sessionRepository: createSequelizeSessionRepository(),
    passwordResetRepository: createSequelizePasswordResetRepository(),
  };
}
