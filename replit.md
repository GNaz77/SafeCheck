# EmailGuard - Email Verification Application

## Overview

EmailGuard is a web application that verifies email legitimacy and provides safety scores. It's built as a full-stack TypeScript application with a React frontend and Express backend, using PostgreSQL for data persistence. The application integrates with AbstractAPI's Email Reputation service to analyze email addresses and provide detailed verification results including syntax validation, MX records, disposable email detection, SMTP validation, spam trap detection, and domain age analysis.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build Tools**
- **React 18** with TypeScript for UI components
- **Vite** as the build tool and development server
- **Wouter** for client-side routing (lightweight alternative to React Router)
- **TanStack Query (React Query)** for server state management and data fetching

**UI Component System**
- **shadcn/ui** component library with Radix UI primitives
- **Tailwind CSS** for styling with custom theme variables
- **Framer Motion** for animations
- **Recharts** for data visualization (pie charts, progress indicators)

The frontend follows a component-based architecture with all UI components located in `client/src/components/ui/`. Path aliases are configured for clean imports (`@/` for client code, `@shared/` for shared types).

### Backend Architecture

**Server Framework**
- **Express.js** with TypeScript for the REST API
- **HTTP server** created using Node's built-in `http` module
- Custom middleware for JSON parsing, request logging, and error handling

**API Design**
- RESTful endpoint structure with `/api` prefix
- Single primary endpoint: `POST /api/verify-email` for email verification
- Response format includes calculated scores, status, and detailed verification metrics

**Development vs Production**
- Development mode uses Vite middleware for HMR and live reloading
- Production mode serves static files from `dist/public`
- Separate build scripts for client (Vite) and server (esbuild)

### Data Storage

**ORM & Database**
- **Drizzle ORM** for type-safe database queries
- **PostgreSQL** (via Neon serverless) as the database
- Schema defined in `shared/schema.ts` using Drizzle's schema builder

**Database Schema**
1. **users** table - User authentication (id, username, password)
2. **verificationHistory** table - Stores email verification results with fields:
   - email, score, status, syntaxValid, mxRecords, disposable
   - smtpValid, spamTrap, domainAge, riskLevel, createdAt

**Data Access Layer**
- Storage interface (`IStorage`) abstracts database operations
- `DbStorage` class implements the interface using Drizzle
- Supports user management and verification history tracking

### External Dependencies

**Third-Party APIs**
- **AbstractAPI Email Reputation API** - Core email verification service
  - Requires `ABSTRACTAPI_KEY` environment variable
  - Endpoint: `https://emailreputation.abstractapi.com/v1/`
  - Returns data used to calculate safety scores and risk levels

**Database Services**
- **Neon Serverless PostgreSQL** - Cloud-hosted database
  - Requires `DATABASE_URL` environment variable
  - Connection pooling via `@neondatabase/serverless`

**Authentication & Session Management**
- User authentication schema defined but not currently implemented in routes
- Session management dependencies included (express-session, connect-pg-simple)
- Prepared for future authentication features

**Development Tools**
- **Replit-specific plugins** for enhanced development experience:
  - `@replit/vite-plugin-runtime-error-modal` - Runtime error overlays
  - `@replit/vite-plugin-cartographer` - Code navigation
  - `@replit/vite-plugin-dev-banner` - Development environment banner
- Custom `vite-plugin-meta-images` for OpenGraph image management

**Build & Deployment**
- **esbuild** bundles server code with selective dependency bundling
- **Vite** handles client bundling with code splitting
- Allowlist approach for server dependencies to optimize cold start times