# Test Plan

## Frequency Logic
- Creating a "Daily" habit makes it appear on the dashboard today.
- Creating a "Specific Days" habit for tomorrow's weekday hides it from today's dashboard.
- Creating an "Interval" habit (every 2 days) shows it today, hides it tomorrow, and shows it the day after.

## Database
- Server boots and connects to local PostgreSQL without auth errors.
- Appending a habit successfully writes to the database (verified via `\dt` and `SELECT * FROM habits;`).