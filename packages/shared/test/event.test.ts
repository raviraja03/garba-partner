import { describe, expect, it } from 'vitest';
import {
  createEventSchema,
  createOrganizerSchema,
  eventIdOrSlugSchema,
  eventListQuerySchema,
  isHttpsUrl,
  updateEventSchema,
} from '../src/schemas/event.schema.js';
import { containsPhoneOrEmail } from '../src/utils/text.js';

const validEvent = {
  name: '  Navratri   Night  ',
  description: 'Live orchestra.\r\n\r\n\r\n\r\nAll levels welcome.',
  organizerId: '0e4b0c1a-5555-4000-8000-000000000001',
  cityId: 'c1000000-0000-4000-8000-000000000001',
  venueName: 'Riverfront Ground',
  venueAddress: 'Sabarmati Riverfront, Ahmedabad',
  eventDate: '2026-10-12',
  startTime: '20:00',
  endTime: '01:00',
};

describe('isHttpsUrl', () => {
  it.each([
    'https://tickets.example.com',
    'https://tickets.example.com/navratri?day=1#passes',
    'https://sub.domain.co.in:8443/path',
  ])('accepts %s', (url) => {
    expect(isHttpsUrl(url)).toBe(true);
  });

  it.each([
    'http://tickets.example.com',
    'javascript:alert(1)',
    'https://user:pass@example.com',
    'https://localhost/admin',
    'https://example.com/"onmouseover="x',
    'https://exa mple.com',
    'ftp://example.com',
    `https://example.com/${'a'.repeat(500)}`,
  ])('rejects %s', (url) => {
    expect(isHttpsUrl(url)).toBe(false);
  });
});

describe('containsPhoneOrEmail', () => {
  it('detects phone numbers and emails but allows links and pincodes', () => {
    expect(containsPhoneOrEmail('Call 98765 43210')).toBe(true);
    expect(containsPhoneOrEmail('mail owner@example.com')).toBe(true);
    expect(containsPhoneOrEmail('Passes at https://tickets.example.com')).toBe(false);
    expect(containsPhoneOrEmail('Ahmedabad 380009')).toBe(false);
  });
});

describe('createEventSchema', () => {
  it('normalises text and accepts after-midnight end times', () => {
    const result = createEventSchema.safeParse(validEvent);
    expect(result.success).toBe(true);
    expect(result.data?.name).toBe('Navratri Night');
    expect(result.data?.description).toBe('Live orchestra.\n\nAll levels welcome.');
  });

  it('rejects equal start and end times on the endTime field', () => {
    const result = createEventSchema.safeParse({ ...validEvent, endTime: '20:00' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['endTime']);
  });

  it('rejects invalid times, dates and links', () => {
    for (const overrides of [
      { startTime: '24:00' },
      { startTime: '8:00' },
      { eventDate: '2026-02-30' },
      { ticketUrl: 'http://x.example.com' },
    ]) {
      expect(createEventSchema.safeParse({ ...validEvent, ...overrides }).success).toBe(false);
    }
  });

  it('turns an empty ticket link into null', () => {
    expect(createEventSchema.safeParse({ ...validEvent, ticketUrl: '  ' }).data?.ticketUrl).toBe(
      null,
    );
  });

  it('is strict: status, verification and slug cannot be set', () => {
    for (const key of ['status', 'isVerified', 'slug', 'imagePublicId']) {
      expect(createEventSchema.safeParse({ ...validEvent, [key]: 'x' }).success).toBe(false);
    }
  });

  it('rejects contact details in the public description', () => {
    const result = createEventSchema.safeParse({
      ...validEvent,
      description: 'For passes call 98765 43210 today.',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateEventSchema', () => {
  it('requires at least one field', () => {
    expect(updateEventSchema.safeParse({}).success).toBe(false);
    expect(updateEventSchema.safeParse({ name: 'New name' }).success).toBe(true);
  });
});

describe('createOrganizerSchema', () => {
  it('normalises private contact fields and clears empty values', () => {
    const result = createOrganizerSchema.safeParse({
      name: 'Garba Club',
      contactEmail: '  Owner@Example.COM ',
      contactPhone: '+91  98765  43210',
      instagramHandle: '@Garba.Club',
      websiteUrl: '',
    });
    expect(result.data).toMatchObject({
      contactEmail: 'owner@example.com',
      contactPhone: '+91 98765 43210',
      instagramHandle: 'garba.club',
      websiteUrl: null,
    });
  });
});

describe('event query and params', () => {
  it('validates list queries', () => {
    expect(eventListQuerySchema.safeParse({ from: '2026-10-01', to: '2026-10-05' }).success).toBe(
      true,
    );
    expect(eventListQuerySchema.safeParse({ from: '2026-10-05', to: '2026-10-01' }).success).toBe(
      false,
    );
    expect(eventListQuerySchema.safeParse({ limit: '20' }).data?.limit).toBe(20);
    expect(eventListQuerySchema.safeParse({ status: 'draft' }).success).toBe(false);
  });

  it('accepts event UUIDs and slugs only', () => {
    expect(eventIdOrSlugSchema.safeParse('navratri-night-k3v9qa').success).toBe(true);
    expect(eventIdOrSlugSchema.safeParse('0e4b0c1a-5555-4000-8000-000000000001').success).toBe(
      true,
    );
    expect(eventIdOrSlugSchema.safeParse('Bad Slug').success).toBe(false);
    expect(eventIdOrSlugSchema.safeParse('../etc').success).toBe(false);
  });
});
