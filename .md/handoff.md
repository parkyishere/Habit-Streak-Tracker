You are continuing a session on the Habit Streak Tracker project.

## Summary of Feature Implementation: Habit Frequency Rules
We implemented advanced frequency rules (Daily, Specific Days, Interval Cycles) across the entire stack.

## Accomplishments
1. **Date & Schedule Helper (`utils/dateHelpers.js`)**:
   - `normalizeDate()` strictly zeroes out time components (`setHours(0,0,0,0)`) to ensure client-local timezone calculations avoid day overlap.
   - `isHabitDueToday()` evaluates habit scheduling rules:
     - `daily`: always returns `true`.
     - `specific_days`: evaluates weekday indices (0=Sun, 1=Mon, ..., 6=Sat) against target date's day of week.
     - `interval`: calculates day differential from `habit.created_at` to target date and evaluates `diffDays % interval === 0`.
   - `formatFrequencyLabel()` formats readable labels (e.g. "Mon, Wed, Fri", "Every 2 days").
2. **Database Migration (`config/db.js`)**:
   - Added automated idempotent column creation for `frequency_type` (VARCHAR) and `frequency_value` (JSONB) in `initDatabase()`.
3. **Backend Routes & Controller (`controllers/habitController.js`)**:
   - `getHabits`: Accepts optional `?date=YYYY-MM-DD` and queries whether each habit was checked in on that date (`is_completed_today`). Maps habits with `is_due_today` and `frequency_label`.
   - `createHabit`: Accepts `frequency_type` and `frequency_value`, persisting them into PostgreSQL as JSONB.
   - `updateHabit`: Supports modifying frequency settings in addition to title and description.
   - `getHabitHistory`: Injects `is_due_today` and `frequency_label`.
4. **Frontend UI (`public/dashboard.html`, `public/js/dashboard.js`, `public/css/style.css`)**:
   - Creation form includes dynamic frequency selector (Daily, Specific Days with clickable weekday chips, Interval input).
   - Edit Modal includes matching dynamic controls.
   - Added view filter tabs: "Due Today" (default) and "All Habits" with active count badges.
   - Rest-day habits visually recede when viewing "All Habits".
   - Check-in button reflects exact check-in completion state (`is_completed_today`) rather than legacy streak count.
   - Removed broken nested event listener and missing `API_URL` reference.

## Key decisions & gotchas
- Maintained PostgreSQL over SQLite for full DB feature parity on local port 5432.
- Weekdays are 0-indexed (0 = Sunday, 1 = Monday, ..., 6 = Saturday) matching JavaScript `Date.prototype.getDay()`.
- Time normalization ensures offline and machine-local day transitions are seamless.