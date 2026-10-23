import { request, toQueryString } from './client';
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

// The object lists the keys one by one rather than spreading the params:
// toQueryString keeps the order given, so the URL, and so the request a test
// asserts, does not depend on the order a caller wrote them in.
export const listReports = (
  params: ListReportsParams
): Promise<ListResponse<ReportRow>> => {
  const query = toQueryString({
    from: params.from,
    to: params.to,
    status: params.status,
    limit: params.limit,
    offset: params.offset,
  });
  return request<ListResponse<ReportRow>>(`/reports${query}`);
};

export const getReportStatistics = (
  range: ReportRange
): Promise<ReportStatistics> => {
  const query = toQueryString({ from: range.from, to: range.to });
  return request<ReportStatistics>(`/reports/statistics${query}`);
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
