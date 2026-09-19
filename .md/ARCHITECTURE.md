# Architecture

## Frontend
HTML, CSS, Vanilla JavaScript

## Backend
Node.js + Express.js

## Database
PostgreSQL 18 (Local instance on port 5432)

## Deployment
Local only (localhost:5000)

## Architecture Flow
User -> Browser UI -> Express API -> local pg pool -> PostgreSQL 18

## Folder Structure
/
├── config/       (Database connections and seed scripts)
├── public/       (Frontend HTML/JS/CSS assets)
├── routes/       (Express API endpoints)
├── utils/        (Helper functions, e.g., dateHelpers.js)
├── server.js     (Application entry point)
└── .env          (Environment variables)

## Rules
- UI components should not contain database logic.
- Database operations belong in routes or services.
- Timezone handling must strictly zero-out time components to avoid yesterday/today overlap.