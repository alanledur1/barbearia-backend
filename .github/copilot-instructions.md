# AI Coding Agent Instructions for Barbearia Backend

## Architecture Overview
This is a Node.js/Express backend for barbershop management using TypeScript, Prisma ORM, and PostgreSQL. Follows a layered architecture: Routes → Controllers → Services → Prisma DB.

Key components:
- **Models**: Admin, Client, Service, Appointment (see `prisma/schema.prisma`)
- **Authentication**: JWT for admins; separate client login without JWT
- **Notifications**: Email (nodemailer) and WhatsApp (whatsapp-web.js)
- **Scheduling**: Appointment reminders via node-cron

## Data Flow
API requests flow: Routes (`src/routes/`) → Controllers (`src/controllers/`) → Services (`src/services/`) → Prisma client (`src/prisma/db.ts`).

Example: POST /api/auth/register → `AuthController.register()` → `AuthService.register()` → `prisma.admin.create()`

## Critical Workflows
- **Development**: `npm run dev` (ts-node-dev auto-restart)
- **Build**: `npm run build` (compiles to `dist/`)
- **Database**: `npx prisma migrate dev --name <name>` for migrations; `npx prisma generate` after schema changes; `npx prisma studio` for GUI
- **Seed**: `npm run seed` to populate initial data
- **Deploy**: `npm run deploy` (migrate + seed + build)

## Project Conventions
- **Error Handling**: Controllers catch errors, return JSON with status codes. Use `src/middlewares/error.middleware.ts` for Zod/JWT errors.
- **Validation**: Use Zod schemas in `src/schemas/` (e.g., `admin.schemas.ts`). Controllers validate req.body with Zod before calling services.
- **Authentication**: Protect admin routes with `authMiddleware` from `src/middlewares/auth.middleware.ts`. Extends `req.user` with adminId/email.
- **Password Hashing**: Use `bcryptjs.hash(password, 10)` in services (avoid native bcrypt to prevent build issues).
- **File Naming**: Inconsistent (e.g., `auth.controller.ts` vs `clientController.ts`); prefer camelCase for new files.
- **Imports**: Use relative paths; import services as classes (e.g., `new AuthService()` in controllers).
- **Database Queries**: Use Prisma client; select fields to exclude passwords (e.g., `select: { id: true, name: true, ... }`).
- **Notifications**: Use `src/services/whatsappService.ts` for WhatsApp; `src/notifications/email.service.ts` for email.

## Integration Points
- **WhatsApp**: Via whatsapp-web.js; requires QR code scan for setup (see `src/services/whatsappService.ts`)
- **Email**: Via nodemailer with Resend API (set RESEND_API_KEY in .env)
- **Scheduling**: `src/schedulers/appointmentReminder.ts` runs daily to send reminders

## Examples
- **Adding a new endpoint**: Create route in `src/routes/`, controller in `src/controllers/`, service in `src/services/`, update Prisma schema if needed.
- **Validating input**: `const schema = z.object({ name: z.string() }); const validated = schema.parse(req.body);`
- **Auth-protected route**: `router.get('/protected', authMiddleware, controller.method);`

Reference: `README.md` for setup; `package.json` for scripts; `prisma/schema.prisma` for models.