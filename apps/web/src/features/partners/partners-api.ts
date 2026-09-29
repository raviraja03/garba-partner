import type {
  ApiSuccess,
  GarbaLevel,
  MyAttendanceDto,
  MyEventAttendanceDto,
  PaginationMeta,
  PartnerDto,
  ReportCreatedDto,
  ReportReason,
  SetAttendanceInput,
} from '@garba-partner/shared';
import { api } from '../../lib/api-client';

/** Discover filters (kept in the URL). Empty values = not filtered. */
export interface PartnerFilters {
  eventId: string;
  cityId: string;
  minAge: string;
  maxAge: string;
  garbaLevels: GarbaLevel[];
  date: string;
  verifiedOnly: boolean;
}

export interface PartnerPage {
  items: PartnerDto[];
  nextCursor: string | null;
}

export async function fetchPartners(
  filters: PartnerFilters,
  cursor: string | null,
): Promise<PartnerPage> {
  const params = new URLSearchParams();
  if (filters.eventId) params.set('eventId', filters.eventId);
  if (filters.cityId) params.set('cityId', filters.cityId);
  if (filters.minAge) params.set('minAge', filters.minAge);
  if (filters.maxAge) params.set('maxAge', filters.maxAge);
  if (filters.garbaLevels.length > 0) params.set('garbaLevels', filters.garbaLevels.join(','));
  if (filters.date) params.set('date', filters.date);
  if (filters.verifiedOnly) params.set('verifiedOnly', 'true');
  params.set('limit', '20');
  if (cursor) params.set('cursor', cursor);
  const envelope = await api<ApiSuccess<PartnerDto[], PaginationMeta>>(
    `/partners?${params.toString()}`,
    { authenticated: true, envelope: true },
  );
  return { items: envelope.data, nextCursor: envelope.meta?.nextCursor ?? null };
}

export const fetchPartner = (userId: string) =>
  api<PartnerDto>(`/partners/${userId}`, { authenticated: true });

// --- Attendance -------------------------------------------------------------------------------

export const fetchMyAttendance = (eventId: string) =>
  api<MyAttendanceDto | null>(`/events/${eventId}/attendance`, { authenticated: true });

export const saveAttendance = (eventId: string, input: SetAttendanceInput) =>
  api<MyAttendanceDto>(`/events/${eventId}/attendance`, {
    method: 'PUT',
    body: input,
    authenticated: true,
  });

export const clearAttendance = (eventId: string) =>
  api<null>(`/events/${eventId}/attendance`, { method: 'DELETE', authenticated: true });

export const fetchMyEvents = () =>
  api<MyEventAttendanceDto[]>('/me/attendance', { authenticated: true });

// --- Safety -----------------------------------------------------------------------------------

export const blockMember = (userId: string) =>
  api<{ userId: string; blocked: true }>('/blocks', {
    method: 'POST',
    body: { userId },
    authenticated: true,
  });

export const reportMember = (input: {
  reportedUserId: string;
  reason: ReportReason;
  details?: string;
  messageId?: string;
  alsoBlock: boolean;
}) => api<ReportCreatedDto>('/reports', { method: 'POST', body: input, authenticated: true });
