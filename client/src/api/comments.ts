import { request } from './client';
import type { CreateCommentPayload, ListResponse } from 'shared';
import type { CommentWithAuthor, PublicComment } from '../types/api';

const COMMENTS_PAGE_SIZE = 100;

export const listComments = (
  bookId: number
): Promise<ListResponse<CommentWithAuthor>> => {
  return request<ListResponse<CommentWithAuthor>>(
    `/comments?bookId=${bookId}&limit=${COMMENTS_PAGE_SIZE}`
  );
};

// `body` is the payload object, not a JSON string: request() stringifies it and
// sets Content-Type off whether it is undefined.
export const createComment = (
  payload: CreateCommentPayload
): Promise<PublicComment> => {
  return request<PublicComment>('/comments', { method: 'POST', body: payload });
};

export const updateComment = (
  id: number,
  text: string
): Promise<PublicComment> => {
  return request<PublicComment>(`/comments/${id}`, {
    method: 'PATCH',
    body: { text },
  });
};

export const restoreComment = (id: number): Promise<PublicComment> => {
  return request<PublicComment>(`/comments/${id}/restore`, { method: 'POST' });
};

// A Moderator's Remove has no function of its own: it is this call, and the
// server makes a Removed comment or an Owner delete by who calls.
// The server answers 204, which request() maps to undefined.
export const deleteComment = (id: number): Promise<void> => {
  return request<void>(`/comments/${id}`, { method: 'DELETE' });
};
