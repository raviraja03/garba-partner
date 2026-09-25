# Garba Partner — Development Rules

## Architecture

Never change the approved monorepo architecture without explicit approval.

apps/

* web
* admin
* api

packages/

* config
* shared

## Technology

Web:
React + Vite + TypeScript + Tailwind CSS

Admin:
React + Vite + TypeScript + Tailwind CSS

API:
Node.js + Express + TypeScript

Database:
PostgreSQL

ORM:
Sequelize / sequelize-typescript

Realtime:
Socket.IO

Storage:
Cloudinary

## Development Rules

1. Use TypeScript strictly.
2. Avoid `any` unless absolutely necessary.
3. Follow existing project patterns.
4. Do not duplicate shared types/constants.
5. Put shared types/constants inside packages/shared.
6. Keep secrets in environment variables.
7. Never commit .env.
8. Use migrations for database changes.
9. Never modify production data through ad-hoc scripts.
10. Validate all API input.
11. Use proper authorization for every protected endpoint.
12. Add tests for important business logic.
13. Do not break existing functionality.
14. Do not remove existing functionality without approval.
15. Do not install unnecessary dependencies.
16. Prefer simple MVP implementations over premature abstraction.
17. Keep controllers thin.
18. Put business logic inside services.
19. Use repositories/data-access patterns only when they provide clear value.
20. Keep database queries optimized and indexed.

## Security Rules

1. Never store raw Aadhaar information unnecessarily.
2. Never expose phone numbers publicly.
3. Never expose exact user locations.
4. Never log OTPs.
5. Never expose JWT secrets.
6. Never trust client-side authorization.
7. Validate uploaded files.
8. Rate-limit sensitive endpoints.
9. Prevent IDOR.
10. Verify payment webhooks server-side.
11. Respect block/suspension rules everywhere.
12. Identity verification must never be presented as a guarantee of safety.

## Safety

The platform is 18+.

Users must be able to:

* block users
* report users
* report messages
* access safety information

Suspended or blocked users must not bypass restrictions through other APIs.

## Database

Every schema change must use a migration.

Use:

* UUID primary keys
* foreign keys
* indexes
* unique constraints
* transactions where necessary

## API

Use versioned APIs:

/api/v1/...

Use consistent response format.

Example:

{
"success": true,
"message": "Success",
"data": {}
}

Errors must not expose stack traces or sensitive information in production.

## Documentation

Every completed feature must update relevant documentation.

Documentation should include:

* purpose
* architecture
* API endpoints
* request/response examples
* database changes
* security considerations
* edge cases
* testing instructions

## Phase Completion

A phase is NOT complete until:

1. Implementation is complete.
2. TypeScript passes.
3. Lint passes.
4. Tests pass.
5. Build passes.
6. Documentation is updated.
7. README is updated if required.
8. No obvious security issue remains.
9. No unrelated files are changed.
10. A final summary is provided containing:

* files changed
* features implemented
* database changes
* APIs added
* tests added
* documentation updated
* known limitations
* next recommended phase

Never claim something was tested if it was not actually tested.
