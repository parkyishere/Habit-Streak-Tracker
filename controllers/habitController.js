const db = require('../config/db');

// Get All Habits for Logged-In User
exports.getHabits = (req, res) => {
  const userId = req.user.id;
  try {
    const habits = db.prepare(`
      SELECT h.*, 
             COALESCE(s.current_streak, 0) as current_streak, 
             COALESCE(s.longest_streak, 0) as longest_streak 
      FROM habits h 
      LEFT JOIN streaks s ON h.id = s.habit_id 
      WHERE h.user_id = ?
    `).all(userId);
    res.json({ success: true, habits });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Create Habit with Frequency
exports.createHabit = (req, res) => {
  const { title, description, frequency } = req.body;
  const userId = req.user.id;

  if (!title) {
    return res.status(400).json({ success: false, error: 'Title is required' });
  }

  try {
    const freqValue = frequency || 'daily';
    const stmt = db.prepare(
      'INSERT INTO habits (user_id, title, description, frequency) VALUES (?, ?, ?, ?)'
    );
    const result = stmt.run(userId, title, description || '', freqValue);
    const habitId = result.lastInsertRowid;

    // Initialize streak cache record
    db.prepare('INSERT INTO streaks (user_id, habit_id) VALUES (?, ?)').run(userId, habitId);

    const habit = db.prepare('SELECT * FROM habits WHERE id = ?').get(habitId);
    res.status(201).json({ success: true, habit });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Update Habit Details
exports.updateHabit = (req, res) => {
  const { habitId } = req.params;
  const { title, description, frequency } = req.body;
  const userId = req.user.id;

  try {
    const stmt = db.prepare(
      'UPDATE habits SET title = ?, description = ?, frequency = ? WHERE id = ? AND user_id = ?'
    );
    const result = stmt.run(title, description, frequency || 'daily', habitId, userId);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Habit not found or unauthorized' });
    }

    res.json({ success: true, message: 'Habit updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Delete Habit
exports.deleteHabit = (req, res) => {
  const { habitId } = req.params;
  const userId = req.user.id;

  try {
    const stmt = db.prepare('DELETE FROM habits WHERE id = ? AND user_id = ?');
    const result = stmt.run(habitId, userId);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Habit not found or unauthorized' });
    }

    res.json({ success: true, message: 'Habit deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Get Habit History for GitHub Grid
exports.getHabitHistory = (req, res) => {
  const { habitId } = req.params;
  const userId = req.user.id;

  try {
    const habit = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(habitId, userId);
    if (!habit) {
      return res.status(404).json({ success: false, error: 'Habit not found' });
    }

    // Query 'check_ins' table
    const logs = db.prepare('SELECT check_in_date FROM check_ins WHERE habit_id = ? AND status = 1').all(habitId);
    const dates = logs.map(log => log.check_in_date);

    res.json({ success: true, habit, checkInDates: dates });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Check-in Toggle Handler
exports.toggleCheckIn = (req, res) => {
  const { habitId } = req.params;
  const { date } = req.body;
  const userId = req.user.id;
  const checkInDate = date || new Date().toISOString().split('T')[0];

  try {
    const habit = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(habitId, userId);
    if (!habit) {
      return res.status(404).json({ success: false, error: 'Habit not found' });
    }

    // Query 'check_ins' table
    const existingLog = db.prepare(
      'SELECT * FROM check_ins WHERE habit_id = ? AND check_in_date = ?'
    ).get(habitId, checkInDate);

    let streakRecord = db.prepare('SELECT * FROM streaks WHERE habit_id = ?').get(habitId);
    if (!streakRecord) {
      db.prepare('INSERT INTO streaks (user_id, habit_id) VALUES (?, ?)').run(userId, habitId);
      streakRecord = { current_streak: 0, longest_streak: 0 };
    }

    let newStreak = streakRecord.current_streak || 0;
    let newLongest = streakRecord.longest_streak || 0;

    if (existingLog) {
      // Uncheck
      db.prepare('DELETE FROM check_ins WHERE id = ?').run(existingLog.id);
      newStreak = Math.max(0, newStreak - 1);
    } else {
      // Check in
      db.prepare('INSERT INTO check_ins (habit_id, check_in_date) VALUES (?, ?)').run(habitId, checkInDate);
      newStreak += 1;
      newLongest = Math.max(newStreak, newLongest);
    }

    // Update streak metrics
    db.prepare(`
      UPDATE streaks 
      SET current_streak = ?, longest_streak = ?, last_check_in_date = ? 
      WHERE habit_id = ?
    `).run(newStreak, newLongest, checkInDate, habitId);

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