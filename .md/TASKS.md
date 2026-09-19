# Tasks

## Phase 1: Environment & Schema (Completed)
- [x] Install PostgreSQL 18 locally
- [x] Create `habit_tracker_db`
- [x] Add `frequency_type` and `frequency_value` to `habits` table

## Phase 2: Backend Logic (Completed)
- [x] Write `isHabitDueToday` helper function
- [x] Integrate helper into backend codebase (`utils/dateHelpers.js`)
- [x] Update `POST /api/habits` to handle frequency data
- [x] Update `GET /api/habits` to filter/tag today's habits (`is_due_today`, `is_completed_today`)

## Phase 3: Frontend UI (Completed)
- [x] Add frequency dropdown to habit creation form (Daily, Specific Days, Interval)
- [x] Add dynamic UI for weekday selection / interval inputs
- [x] Bind form submission to updated POST payload
- [x] Add view tabs for "Due Today" vs "All Habits" with rest-day card styling
- [x] Update Edit Habit modal with matching frequency controls