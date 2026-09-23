# Project Memory

## Current Status
Java Backend Core & Node.js Integration completed and verified. The system includes an object-oriented Java package under `java-core/` with `Trackable`, `BaseHabit`, `BooleanHabit`, and `QuantifiableHabit`, custom domain exceptions (`InvalidTargetException`, `NegativeStreakException`, `HabitValidationException`), an offline scoring engine, and a secure `child_process` bridge in `utils/javaBridge.js`.

## Completed
- Local PostgreSQL migration
- Schema updates (`frequency_type` and `frequency_value` in `habits` table)
- Created `utils/dateHelpers.js` with `isHabitDueToday`, `normalizeDate`, and `formatFrequencyLabel`
- Integrated `is_due_today` and accurate `is_completed_today` in `controllers/habitController.js`
- Updated `POST /api/habits` and `PUT /api/habits/:habitId` to store and update frequency settings
- Added dynamic frontend controls for Daily, Specific Days (weekday chips), and Interval (repeat every N days)
- Added "Due Today" vs "All Habits" tab filtering and rest-day visual receding
- Cleaned up duplicate event listeners in `public/js/dashboard.js`
- Implemented Java Core package (`java-core/`):
  - `Trackable` interface (`isCompleted()`, `resetProgress()`, `getProgress()`, `getProgressPercentage()`)
  - `BaseHabit` abstract superclass managing names, streaks, and scores
  - `BooleanHabit` for binary daily check-ins
  - `QuantifiableHabit` for numeric targets with progress steppers and percentage tracking
  - Custom exceptions: `InvalidTargetException`, `NegativeStreakException`, `HabitValidationException`
  - Offline exponential scoring engine (`HabitScoringEngine`, `HabitScoringResult`) and CLI runner (`HabitEngineMain`)
  - Standalone zero-dependency JSON parser/serializer (`SimpleJson`)
- Created Node.js bridge (`utils/javaBridge.js`):
  - Automatic compilation (`compileJavaCore()`)
  - Child process execution via `spawn` with stdin/stdout streams
  - Input validation and exception mapping
- Added Express API endpoints (`POST /api/habits/validate-core`, `POST /api/habits/:habitId/evaluate-core`)
- Comprehensive test suite in `test_java_core.js` passing 10/10 tests cleanly
- Zero cloud dependencies, 100% offline compatibility, and strict no-emoji style adherence