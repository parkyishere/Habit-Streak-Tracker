const pool = require('../config/db');
const { isHabitDueToday, formatFrequencyLabel, normalizeDate, calculateStreakMetrics, getLocalDateStr } = require('../utils/dateHelpers');

// Get All Habits for Logged-In User
exports.getHabits = async (req, res) => {
  const userId = req.user.id;
  const targetDateStr = req.query.date || new Date().toISOString().split('T')[0];
  const targetDate = normalizeDate(targetDateStr);

  try {
    const { rows: habits } = await pool.query(`
      SELECT h.*, 
             EXISTS (
               SELECT 1 FROM check_ins ci 
               WHERE ci.habit_id = h.id AND ci.check_in_date = $2 AND ci.status = true
             ) as is_completed_today
      FROM habits h 
      WHERE h.user_id = $1
      ORDER BY h.id ASC
    `, [userId, targetDateStr]);
    
    const processedHabits = await Promise.all(habits.map(async habit => {
      const isDue = isHabitDueToday(habit, targetDate);
      const { rows: logs } = await pool.query('SELECT check_in_date FROM check_ins WHERE habit_id = $1 AND status = true', [habit.id]);
      const checkInDates = logs.map(l => l.check_in_date);
      const { currentStreak, longestStreak } = calculateStreakMetrics(habit, checkInDates);

      await pool.query(`
        INSERT INTO streaks (user_id, habit_id, current_streak, longest_streak)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (habit_id) DO UPDATE SET
          current_streak = EXCLUDED.current_streak,
          longest_streak = EXCLUDED.longest_streak
      `, [userId, habit.id, currentStreak, longestStreak]);

      return {
        ...habit,
        current_streak: currentStreak,
        longest_streak: longestStreak,
        is_due_today: isDue,
        is_completed_today: Boolean(habit.is_completed_today),
        frequency_label: formatFrequencyLabel(habit.frequency_type || habit.frequency, habit.frequency_value)
      };
    }));

    res.json({ success: true, habits: processedHabits });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Create Habit with Frequency
exports.createHabit = async (req, res) => {
  const { title, description, frequency, frequency_type, frequency_value } = req.body;
  const userId = req.user.id;

  if (!title) {
    return res.status(400).json({ success: false, error: 'Title is required' });
  }

  try {
    const freqType = frequency_type || frequency || 'daily';
    let freqVal = frequency_value !== undefined ? frequency_value : [];
    const freqValJson = typeof freqVal === 'string' ? freqVal : JSON.stringify(freqVal);
    
    // RETURNING * gives us the new row directly in PostgreSQL
    const { rows: newHabit } = await pool.query(
      `INSERT INTO habits (user_id, title, description, frequency, frequency_type, frequency_value) 
       VALUES ($1, $2, $3, $4, $5, $6::jsonb) 
       RETURNING *`,
      [userId, title, description || '', freqType, freqType, freqValJson]
    );
    
    const habit = newHabit[0];
    habit.is_due_today = isHabitDueToday(habit);
    habit.is_completed_today = false;
    habit.frequency_label = formatFrequencyLabel(habit.frequency_type, habit.frequency_value);

    // Initialize streak cache record
    await pool.query('INSERT INTO streaks (user_id, habit_id) VALUES ($1, $2)', [userId, habit.id]);

    res.status(201).json({ success: true, habit });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Update Habit Details
exports.updateHabit = async (req, res) => {
  const { habitId } = req.params;
  const { title, description, frequency, frequency_type, frequency_value } = req.body;
  const userId = req.user.id;

  try {
    const freqType = frequency_type || frequency || 'daily';
    let freqVal = frequency_value !== undefined ? frequency_value : [];
    const freqValJson = typeof freqVal === 'string' ? freqVal : JSON.stringify(freqVal);

    const result = await pool.query(
      `UPDATE habits 
       SET title = $1, description = $2, frequency = $3, frequency_type = $4, frequency_value = $5::jsonb 
       WHERE id = $6 AND user_id = $7 
       RETURNING *`,
      [title, description || '', freqType, freqType, freqValJson, habitId, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Habit not found or unauthorized' });
    }

    const updatedHabit = result.rows[0];
    updatedHabit.is_due_today = isHabitDueToday(updatedHabit);
    updatedHabit.frequency_label = formatFrequencyLabel(updatedHabit.frequency_type, updatedHabit.frequency_value);

    res.json({ success: true, message: 'Habit updated successfully', habit: updatedHabit });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Delete Habit
exports.deleteHabit = async (req, res) => {
  const { habitId } = req.params;
  const userId = req.user.id;

  try {
    const result = await pool.query('DELETE FROM habits WHERE id = $1 AND user_id = $2', [habitId, userId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Habit not found or unauthorized' });
    }

    res.json({ success: true, message: 'Habit deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Get Habit History for GitHub Grid
exports.getHabitHistory = async (req, res) => {
  const { habitId } = req.params;
  const userId = req.user.id;

  try {
    const { rows: habitRows } = await pool.query('SELECT * FROM habits WHERE id = $1 AND user_id = $2', [habitId, userId]);
    const habit = habitRows[0];

    if (!habit) {
      return res.status(404).json({ success: false, error: 'Habit not found' });
    }

    habit.is_due_today = isHabitDueToday(habit);
    habit.frequency_label = formatFrequencyLabel(habit.frequency_type || habit.frequency, habit.frequency_value);

    // Query 'check_ins' table
    const { rows: logs } = await pool.query('SELECT check_in_date FROM check_ins WHERE habit_id = $1 AND status = true', [habitId]);
    const dates = logs.map(log => log.check_in_date);

    res.json({ success: true, habit, checkInDates: dates });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Check-in Toggle Handler
exports.toggleCheckIn = async (req, res) => {
  const { habitId } = req.params;
  const userId = req.user.id;
  const checkInDate = getLocalDateStr(new Date());

  try {
    const { rows: habitRows } = await pool.query('SELECT * FROM habits WHERE id = $1 AND user_id = $2', [habitId, userId]);
    if (habitRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Habit not found' });
    }

    const habit = habitRows[0];
    const targetDate = normalizeDate(checkInDate);

    if (!isHabitDueToday(habit, targetDate)) {
      return res.status(400).json({ success: false, error: 'Habit is not scheduled on this date' });
    }

    // Query 'check_ins' table
    const { rows: existingLogs } = await pool.query(
      'SELECT * FROM check_ins WHERE habit_id = $1 AND check_in_date = $2',
      [habitId, checkInDate]
    );
    const existingLog = existingLogs[0];

    let { rows: streakRows } = await pool.query('SELECT * FROM streaks WHERE habit_id = $1', [habitId]);
    let streakRecord = streakRows[0];

    if (!streakRecord) {
      await pool.query('INSERT INTO streaks (user_id, habit_id) VALUES ($1, $2)', [userId, habitId]);
      streakRecord = { current_streak: 0, longest_streak: 0 };
    }

    let newStreak = streakRecord.current_streak || 0;
    let newLongest = streakRecord.longest_streak || 0;

    if (existingLog) {
      // Uncheck
      await pool.query('DELETE FROM check_ins WHERE id = $1', [existingLog.id]);
    } else {
      // Check in
      await pool.query('INSERT INTO check_ins (habit_id, check_in_date) VALUES ($1, $2)', [habitId, checkInDate]);
    }

    // Recalculate streak using calculateStreakMetrics
    const { rows: logs } = await pool.query('SELECT check_in_date FROM check_ins WHERE habit_id = $1 AND status = true', [habitId]);
    const checkInDates = logs.map(l => l.check_in_date);
    ({ currentStreak: newStreak, longestStreak: newLongest } = calculateStreakMetrics(habit, checkInDates));

    // Update streak metrics
    await pool.query(`
      INSERT INTO streaks (user_id, habit_id, current_streak, longest_streak, last_check_in_date)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (habit_id) DO UPDATE SET
        current_streak = EXCLUDED.current_streak,
        longest_streak = EXCLUDED.longest_streak,
        last_check_in_date = EXCLUDED.last_check_in_date
    `, [userId, habitId, newStreak, newLongest, checkInDate]);

    // Socket notification
    const io = req.app.get('io');
    if (io) {
      io.emit('activity_feed', {
        username: req.user.email ? req.user.email.split('@')[0] : 'User',
        action: existingLog ? 'unchecked' : 'checked in',
        streak: newStreak
      });
    }

    res.json({ success: true, current_streak: newStreak, longest_streak: newLongest });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};