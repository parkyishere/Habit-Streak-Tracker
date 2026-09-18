const pool = require('../config/db');

// Get All Habits for Logged-In User
exports.getHabits = async (req, res) => {
  const userId = req.user.id;
  try {
    const { rows: habits } = await pool.query(`
      SELECT h.*, 
             COALESCE(s.current_streak, 0) as current_streak, 
             COALESCE(s.longest_streak, 0) as longest_streak 
      FROM habits h 
      LEFT JOIN streaks s ON h.id = s.habit_id 
      WHERE h.user_id = $1
    `, [userId]);
    
    res.json({ success: true, habits });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Create Habit with Frequency
exports.createHabit = async (req, res) => {
  const { title, description, frequency } = req.body;
  const userId = req.user.id;

  if (!title) {
    return res.status(400).json({ success: false, error: 'Title is required' });
  }

  try {
    const freqValue = frequency || 'daily';
    
    // RETURNING id gives us the new ID directly in PostgreSQL
    const { rows: newHabit } = await pool.query(
      'INSERT INTO habits (user_id, title, description, frequency) VALUES ($1, $2, $3, $4) RETURNING *',
      [userId, title, description || '', freqValue]
    );
    
    const habit = newHabit[0];

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
  const { title, description, frequency } = req.body;
  const userId = req.user.id;

  try {
    const result = await pool.query(
      'UPDATE habits SET title = $1, description = $2, frequency = $3 WHERE id = $4 AND user_id = $5',
      [title, description, frequency || 'daily', habitId, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Habit not found or unauthorized' });
    }

    res.json({ success: true, message: 'Habit updated successfully' });
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
  const { date } = req.body;
  const userId = req.user.id;
  const checkInDate = date || new Date().toISOString().split('T')[0];

  try {
    const { rows: habitRows } = await pool.query('SELECT * FROM habits WHERE id = $1 AND user_id = $2', [habitId, userId]);
    if (habitRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Habit not found' });
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
      newStreak = Math.max(0, newStreak - 1);
    } else {
      // Check in
      await pool.query('INSERT INTO check_ins (habit_id, check_in_date) VALUES ($1, $2)', [habitId, checkInDate]);
      newStreak += 1;
      newLongest = Math.max(newStreak, newLongest);
    }

    // Update streak metrics
    await pool.query(`
      UPDATE streaks 
      SET current_streak = $1, longest_streak = $2, last_check_in_date = $3 
      WHERE habit_id = $4
    `, [newStreak, newLongest, checkInDate, habitId]);

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