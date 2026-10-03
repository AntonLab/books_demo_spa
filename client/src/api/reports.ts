import { request } from './client';
import type { ListResponse, ReportPayload, ReportStatus } from 'shared';
import type { ReportRow, ReportStatistics } from '../types/api';

export interface ReportRange {
  from: string;
  to: string;
}

export interface ListReportsParams extends ReportRange {
  status?: ReportStatus;
  limit?: number;
  offset?: number;
}

// Built key by key rather than by iterating the params: the URL, and so the
// request a test asserts, does not depend on the order a caller wrote them in.
export const listReports = (
  params: ListReportsParams
): Promise<ListResponse<ReportRow>> => {
  const search = new URLSearchParams({ from: params.from, to: params.to });
  if (params.status !== undefined) search.set('status', params.status);
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  if (params.offset !== undefined) search.set('offset', String(params.offset));
  return request<ListResponse<ReportRow>>(`/reports?${search.toString()}`);
};

export const getReportStatistics = (
  range: ReportRange
): Promise<ReportStatistics> => {
  const search = new URLSearchParams({ from: range.from, to: range.to });
  return request<ReportStatistics>(`/reports/statistics?${search.toString()}`);
};

export const reportComment = (
  commentId: number,
  payload: ReportPayload
): Promise<{ id: number }> => {
  return request<{ id: number }>(`/comments/${commentId}/report`, {
    method: 'POST',
    body: payload,
  });
};

// The three Moderator actions answer 204, which request() maps to undefined.
const postAction =
  (action: 'take' | 'uphold' | 'dismiss') =>
  (commentId: number): Promise<void> =>
    request<void>(`/reports/${commentId}/${action}`, { method: 'POST' });

export const takeReport = postAction('take');
export const upholdReport = postAction('uphold');
export const dismissReport = postAction('dismiss');
