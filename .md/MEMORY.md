# Project Memory

## Current Status
Habit Frequency Rules fully implemented across backend (`utils/dateHelpers.js`, `controllers/habitController.js`), database migrations (`config/db.js`), and frontend dashboard (`dashboard.html`, `dashboard.js`, `style.css`).

## Completed
- Local PostgreSQL migration
- Schema updates (`frequency_type` and `frequency_value` in `habits` table)
- Created `utils/dateHelpers.js` with `isHabitDueToday`, `normalizeDate`, and `formatFrequencyLabel`
- Integrated `is_due_today` and accurate `is_completed_today` in `controllers/habitController.js`
- Updated `POST /api/habits` and `PUT /api/habits/:habitId` to store and update frequency settings
- Added dynamic frontend controls for Daily, Specific Days (weekday chips), and Interval (repeat every N days)
- Added "Due Today" vs "All Habits" tab filtering and rest-day visual receding
- Cleaned up duplicate event listeners in `public/js/dashboard.js`
- Ran integration test suite validating all frequency rules, check-ins, and updates

## Current Task
Feature complete and verified.