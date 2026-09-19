# Development Rules

## General
- Stick to CommonJS (`require`) for Node.js backend.
- Do not suggest cloud deployment (Render, Vercel); the project is strictly local.
- Keep functions small and modular.

## Database
- Always use `habit_tracker_db` on `localhost:5432`.
- Write raw SQL queries using the `pg` library; do not introduce ORMs like Prisma or Sequelize without permission.

## Time & Dates
- Always use client-local time normalized to `YYYY-MM-DD` or zeroed-out `Date` objects (`setHours(0,0,0,0)`) for comparisons.
- Never use UTC fallback if it overrides local user intent.