import type { MigrationFn } from 'umzug';
import { addDays, todayInIndia } from '@garba-partner/shared';
import type { SeederContext } from '../config/umzug.js';
import { Event, EventOrganizer } from '../models/index.js';

/**
 * Development events and organizers (fictional). Dates are relative to the day the seeder runs,
 * so the listing always has upcoming events. Created by the dev event manager from the
 * dev-admins seeder. Only runs when APP_ENV=development.
 */
const DEV_EVENT_MANAGER_ID = 'b2e0d4ef-0003-4000-8000-000000000003';
const AHMEDABAD = 'c1000000-0000-4000-8000-000000000001';
const VADODARA = 'c1000000-0000-4000-8000-000000000002';
const MUMBAI = 'c1000000-0000-4000-8000-000000000004';
const NAVRANGPURA = 'a2000000-0001-4000-8000-000000000001';
const ALKAPURI = 'a2000000-0002-4000-8000-000000000001';

const ORGANIZERS = [
  {
    id: 'e0c0a1b2-0001-4000-8000-000000000001',
    name: 'Rangtaali Events (Dev)',
    description: 'Fictional organizer for local development.',
    websiteUrl: 'https://example.com/rangtaali',
    instagramHandle: 'rangtaali.dev',
    contactName: 'Dev Contact',
    contactEmail: 'contact@rangtaali.example',
    contactPhone: '+91 90000 00001',
    notes: 'Development data only.',
    verified: true,
  },
  {
    id: 'e0c0a1b2-0002-4000-8000-000000000002',
    name: 'Dandiya Nights Collective (Dev)',
    description: 'Another fictional organizer.',
    websiteUrl: null,
    instagramHandle: null,
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    notes: null,
    verified: false,
  },
] as const;

const EVENTS = [
  {
    id: 'e0e0a1b2-0001-4000-8000-000000000001',
    slug: 'rangtaali-navratri-night-dev001',
    name: 'Rangtaali Navratri Night',
    organizerId: ORGANIZERS[0].id,
    cityId: AHMEDABAD,
    areaId: NAVRANGPURA,
    venueName: 'GMDC Ground',
    venueAddress: 'Helmet Circle, Ahmedabad',
    offsetDays: 2,
    startTime: '20:00',
    endTime: '01:00',
    ticketUrl: 'https://example.com/tickets/rangtaali',
    status: 'published' as const,
    verified: true,
  },
  {
    id: 'e0e0a1b2-0002-4000-8000-000000000002',
    slug: 'beginners-garba-workshop-dev002',
    name: 'Beginners Garba Workshop',
    organizerId: ORGANIZERS[1].id,
    cityId: VADODARA,
    areaId: ALKAPURI,
    venueName: 'Community Hall',
    venueAddress: 'Alkapuri Main Road, Vadodara',
    offsetDays: 4,
    startTime: '18:30',
    endTime: '21:00',
    ticketUrl: null,
    status: 'published' as const,
    verified: false,
  },
  {
    id: 'e0e0a1b2-0003-4000-8000-000000000003',
    slug: 'mumbai-dandiya-utsav-dev003',
    name: 'Mumbai Dandiya Utsav',
    organizerId: ORGANIZERS[0].id,
    cityId: MUMBAI,
    areaId: null,
    venueName: 'Seaside Grounds',
    venueAddress: 'Western Express Highway, Mumbai',
    offsetDays: 6,
    startTime: '19:30',
    endTime: '23:30',
    ticketUrl: 'https://example.com/tickets/mumbai',
    status: 'published' as const,
    verified: false,
  },
  {
    id: 'e0e0a1b2-0004-4000-8000-000000000004',
    slug: 'draft-sheri-garba-dev004',
    name: 'Sheri Garba (draft)',
    organizerId: ORGANIZERS[1].id,
    cityId: AHMEDABAD,
    areaId: null,
    venueName: 'Pol Chowk',
    venueAddress: 'Old City, Ahmedabad',
    offsetDays: 8,
    startTime: '21:00',
    endTime: '00:30',
    ticketUrl: null,
    status: 'draft' as const,
    verified: false,
  },
];

const devOnly = (appEnv: string) => {
  if (appEnv !== 'development') {
    throw new Error('Development seeders only run when APP_ENV=development');
  }
};

export const up: MigrationFn<SeederContext> = async ({ context: { sequelize, env } }) => {
  devOnly(env.APP_ENV);
  const now = new Date();
  const today = todayInIndia();

  await sequelize.transaction(async (transaction) => {
    for (const { verified, ...organizer } of ORGANIZERS) {
      await EventOrganizer.create(
        {
          ...organizer,
          isVerified: verified,
          verifiedAt: verified ? now : null,
          createdByAdminId: DEV_EVENT_MANAGER_ID,
          updatedByAdminId: DEV_EVENT_MANAGER_ID,
        },
        { transaction },
      );
    }
    for (const { offsetDays, verified, status, ...event } of EVENTS) {
      await Event.create(
        {
          ...event,
          description:
            'Fictional development event. Live music, traditional attire encouraged, all levels welcome.',
          eventDate: addDays(today, offsetDays),
          status,
          publishedAt: status === 'published' ? now : null,
          firstPublishedAt: status === 'published' ? now : null,
          isVerified: verified,
          verifiedAt: verified ? now : null,
          createdByAdminId: DEV_EVENT_MANAGER_ID,
          updatedByAdminId: DEV_EVENT_MANAGER_ID,
        },
        { transaction },
      );
    }
  });
};

export const down: MigrationFn<SeederContext> = async ({ context: { sequelize, env } }) => {
  devOnly(env.APP_ENV);
  await sequelize.transaction(async (transaction) => {
    await Event.destroy({ where: { id: EVENTS.map((event) => event.id) }, transaction });
    await EventOrganizer.destroy({
      where: { id: ORGANIZERS.map((organizer) => organizer.id) },
      transaction,
    });
  });
};
