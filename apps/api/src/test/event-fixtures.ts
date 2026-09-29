import type { Express } from 'express';
import request from 'supertest';
import {
  addDays,
  todayInIndia,
  type AdminEventDetailDto,
  type AdminOrganizerDto,
  type CreateEventInput,
  type CreateOrganizerInput,
} from '@garba-partner/shared';

/** Reference data seeded by migration (docs/database/schema.md). */
export const AHMEDABAD = 'c1000000-0000-4000-8000-000000000001';
export const VADODARA = 'c1000000-0000-4000-8000-000000000002';
export const NAVRANGPURA = 'a2000000-0001-4000-8000-000000000001';
export const ALKAPURI = 'a2000000-0002-4000-8000-000000000001';

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** An IST date `days` from today. */
export const inDays = (days: number) => addDays(todayInIndia(), days);

let organizerCounter = 0;

export function organizerInput(
  overrides: Partial<CreateOrganizerInput> = {},
): CreateOrganizerInput {
  organizerCounter += 1;
  return {
    name: `Test Garba Organizer ${String(organizerCounter)}`,
    description: 'Community Navratri nights since 2010.',
    websiteUrl: 'https://garba.example.com',
    instagramHandle: 'garba.nights',
    contactName: 'Private Contact Person',
    contactEmail: 'private.contact@organizer.test',
    contactPhone: '+91 98765 11111',
    notes: 'Internal: agreed to verification call.',
    ...overrides,
  };
}

export function eventInput(
  organizerId: string,
  overrides: Partial<CreateEventInput> = {},
): CreateEventInput {
  return {
    name: 'Navratri Night at the Riverfront',
    description: 'Nine nights of live garba with a traditional orchestra. All levels welcome.',
    organizerId,
    cityId: AHMEDABAD,
    areaId: NAVRANGPURA,
    venueName: 'Riverfront Event Ground',
    venueAddress: 'Sabarmati Riverfront, Ahmedabad',
    eventDate: inDays(5),
    startTime: '20:00',
    endTime: '23:30',
    ticketUrl: 'https://tickets.example.com/navratri',
    ...overrides,
  };
}

export async function createOrganizer(
  app: Express,
  token: string,
  overrides: Partial<CreateOrganizerInput> = {},
): Promise<AdminOrganizerDto> {
  const res = await request(app)
    .post('/api/v1/admin/organizers')
    .set(bearer(token))
    .send(organizerInput(overrides));
  if (res.status !== 201) throw new Error(`create organizer failed: ${String(res.status)}`);
  return (res.body as { data: AdminOrganizerDto }).data;
}

export async function createEvent(
  app: Express,
  token: string,
  organizerId: string,
  overrides: Partial<CreateEventInput> = {},
): Promise<AdminEventDetailDto> {
  const res = await request(app)
    .post('/api/v1/admin/events')
    .set(bearer(token))
    .send(eventInput(organizerId, overrides));
  if (res.status !== 201) {
    throw new Error(`create event failed: ${String(res.status)} ${JSON.stringify(res.body)}`);
  }
  return (res.body as { data: AdminEventDetailDto }).data;
}

export async function publishEvent(app: Express, token: string, eventId: string): Promise<void> {
  const res = await request(app).post(`/api/v1/admin/events/${eventId}/publish`).set(bearer(token));
  if (res.status !== 200) throw new Error(`publish failed: ${String(res.status)}`);
}
