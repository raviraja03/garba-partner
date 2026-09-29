import type { AdminEventDetailDto, CreateEventInput } from '@garba-partner/shared';

/** Form state: every control holds a string (empty = not set). */
export interface EventFormValues {
  name: string;
  description: string;
  organizerId: string;
  cityId: string;
  areaId: string;
  venueName: string;
  venueAddress: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  ticketUrl: string;
}

export const EMPTY_EVENT_VALUES: EventFormValues = {
  name: '',
  description: '',
  organizerId: '',
  cityId: '',
  areaId: '',
  venueName: '',
  venueAddress: '',
  eventDate: '',
  startTime: '20:00',
  endTime: '23:30',
  ticketUrl: '',
};

export function eventToValues(event: AdminEventDetailDto): EventFormValues {
  return {
    name: event.name,
    description: event.description,
    organizerId: event.organizer.id,
    cityId: event.city.id,
    areaId: event.area?.id ?? '',
    venueName: event.venueName,
    venueAddress: event.venueAddress,
    eventDate: event.eventDate,
    startTime: event.startTime,
    endTime: event.endTime,
    ticketUrl: event.ticketUrl ?? '',
  };
}

export function valuesToInput(values: EventFormValues): CreateEventInput {
  return {
    ...values,
    areaId: values.areaId || null,
    ticketUrl: values.ticketUrl.trim() || null,
  };
}
