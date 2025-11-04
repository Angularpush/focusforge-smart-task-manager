# FocusForge Database Migrations

This directory contains PostgreSQL migration scripts for setting up the FocusForge database schema.

## Migration Files

1. **001_create_users_table.sql** - Creates the main users table with authentication and profile information
2. **002_create_sessions_table.sql** - Creates table for tracking focus sessions and study patterns
3. **003_create_subjects_table.sql** - Creates table for managing subjects/courses with user-specific customizations

## Running Migrations

### With Docker Compose (Recommended)

When starting services with Docker Compose, migrations are automatically executed:

```bash
cd backend
docker-compose up -d postgres
```

The PostgreSQL container will automatically run all `.sql` files in the `migrations/` directory on startup.

### Manual Migration

If you need to run migrations manually:

```bash
# Set environment variables
export POSTGRES_URL="postgresql://focusforge:dev_password_123@localhost:5432/focusforge"

# Run migrations using psql
psql $POSTGRES_URL -f migrations/001_create_users_table.sql
psql $POSTGRES_URL -f migrations/002_create_sessions_table.sql
psql $POSTGRES_URL -f migrations/003_create_subjects_table.sql
```

### Using Migration Tools

For production, consider using a migration tool like [node-pg-migrate](https://salsita.github.io/node-pg-migrate/) or [Knex.js](https://knexjs.org/):

```bash
# Install migration tool
npm install -g node-pg-migrate

# Create new migration
node-pg-migrate create add_new_table --migrations-dir ./migrations

# Run migrations
node-pg-migrate up --database-url $POSTGRES_URL
```

## Database Schema Overview

### Users Table
- Stores user authentication data (Firebase UID, email)
- Academic profile information (level, major, study goals)
- User preferences and settings

### Sessions Table
- Tracks focus/study sessions with detailed metrics
- Includes session duration, quality ratings, interruptions
- Links to tasks and provides analytics data

### Subjects Table
- User-defined subjects/courses
- Customizable properties (colors, difficulty, priority weights)
- Academic information (course codes, instructors, credits)

## Environment Variables

Required environment variables for database connections:

```bash
POSTGRES_URL=postgresql://focusforge:dev_password_123@localhost:5432/focusforge
POSTGRES_USER=focusforge
POSTGRES_PASSWORD=dev_password_123
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=focusforge
```

## Development Data

The migration scripts include optional development data that will only be inserted in development environments. In production, users create their own subjects and data through the application interface.

## Rollback

Each migration file should include corresponding rollback logic for reverting changes if needed. Current migrations can be rolled back by:

```sql
-- Drop tables in reverse order
DROP TABLE IF EXISTS subjects;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
```

Note: This will delete all data. Use with caution in development only.