import type {
  ApiSuccess,
  InterestDto,
  MatchDto,
  PaginationMeta,
  SendInterestInput,
  SendInterestResultDto,
} from '@garba-partner/shared';
import { api } from '../../lib/api-client';

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

async function page<T>(path: string, cursor: string | null): Promise<Page<T>> {
  const params = new URLSearchParams({ limit: '20' });
  if (cursor) params.set('cursor', cursor);
  const envelope = await api<ApiSuccess<T[], PaginationMeta>>(`${path}?${params.toString()}`, {
    authenticated: true,
    envelope: true,
  });
  return { items: envelope.data, nextCursor: envelope.meta?.nextCursor ?? null };
}

export const sendInterest = (input: SendInterestInput) =>
  api<SendInterestResultDto>('/interests', { method: 'POST', body: input, authenticated: true });

export const fetchReceived = (cursor: string | null) =>
  page<InterestDto>('/interests/received', cursor);

export const fetchSent = (cursor: string | null) => page<InterestDto>('/interests/sent', cursor);

export const acceptInterest = (interestId: string) =>
  api<MatchDto>(`/interests/${interestId}/accept`, { method: 'POST', authenticated: true });

export const rejectInterest = (interestId: string) =>
  api<null>(`/interests/${interestId}/reject`, { method: 'POST', authenticated: true });

export const withdrawInterest = (interestId: string) =>
  api<null>(`/interests/${interestId}`, { method: 'DELETE', authenticated: true });

export const fetchMatches = (cursor: string | null) => page<MatchDto>('/matches', cursor);

export const fetchMatch = (matchId: string) =>
  api<MatchDto>(`/matches/${matchId}`, { authenticated: true });

export const unmatch = (matchId: string) =>
  api<null>(`/matches/${matchId}/unmatch`, { method: 'POST', authenticated: true });
