import { request } from './client';
import type { ItemsResponse } from 'shared';
import type { PublicIllustration } from '../types/illustration';

export const listIllustrations = (
  chapterId: number
): Promise<ItemsResponse<PublicIllustration>> => {
  return request<ItemsResponse<PublicIllustration>>(
    `/chapters/${chapterId}/illustrations`
  );
};

// The body is a Blob (a File), so request() sends it as-is.
export const uploadIllustration = (
  chapterId: number,
  file: File
): Promise<PublicIllustration> => {
  return request<PublicIllustration>(`/chapters/${chapterId}/illustrations`, {
    method: 'POST',
    body: file,
  });
};

// null clears the caption.
export const updateIllustrationCaption = (
  id: number,
  caption: string | null
): Promise<PublicIllustration> => {
  return request<PublicIllustration>(`/illustrations/${id}`, {
    method: 'PATCH',
    body: { caption },
  });
};

// The chapter's whole order; see IllustrationRepository.reorder.
export const reorderIllustrations = (
  chapterId: number,
  illustrationIds: number[]
): Promise<ItemsResponse<PublicIllustration>> => {
  return request<ItemsResponse<PublicIllustration>>(
    `/chapters/${chapterId}/illustration-order`,
    { method: 'PUT', body: { illustrationIds } }
  );
};

export const deleteIllustration = (id: number): Promise<void> => {
  return request<void>(`/illustrations/${id}`, { method: 'DELETE' });
};
