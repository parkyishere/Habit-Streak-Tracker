const db = require('../config/db');

exports.recalculateStreak = (userId, habitId) => {
  // Fetch all completed check-ins sorted by date descending
  const checkIns = db.prepare(`
    SELECT check_in_date 
    FROM check_ins 
    WHERE habit_id = ? AND status = 1 
    ORDER BY check_in_date DESC
  `).all(habitId);

  if (checkIns.length === 0) {
    db.prepare(`
      UPDATE streaks 
      SET current_streak = 0, total_completed = 0, last_check_in_date = NULL 
      WHERE habit_id = ? AND user_id = ?
    `).run(habitId, userId);
    return { currentStreak: 0, longestStreak: 0, totalCompleted: 0 };
  }

  const dates = checkIns.map(c => new Date(c.check_in_date));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;

  // Check if today or yesterday was checked in to maintain current streak
  const latestDate = new Date(dates[0]);
  latestDate.setHours(0, 0, 0, 0);
  const diffDaysFromToday = Math.floor((today - latestDate) / (1000 * 60 * 60 * 24));

  if (diffDaysFromToday <= 1) {
    let checkDate = new Date(latestDate);
    
    for (const d of dates) {
      d.setHours(0, 0, 0, 0);
      const diff = Math.floor((checkDate - d) / (1000 * 60 * 60 * 24));
      
      if (diff === 0) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
  }

  // Calculate longest historical streak
  let prevDate = null;
  for (const d of dates) {
    d.setHours(0, 0, 0, 0);
    if (!prevDate) {
      tempStreak = 1;
    } else {
      const diff = Math.floor((prevDate - d) / (1000 * 60 * 60 * 24));
      if (diff === 1) {
        tempStreak++;
      } else {
        tempStreak = 1;
      }
    }
    if (tempStreak > longestStreak) {
      longestStreak = tempStreak;
    }
    prevDate = new Date(d);
  }

  const existingStreak = db.prepare('SELECT longest_streak FROM streaks WHERE habit_id = ?').get(habitId);
  const finalLongest = existingStreak ? Math.max(existingStreak.longest_streak, longestStreak) : longestStreak;
  const totalCompleted = checkIns.length;
  const lastCheckInDate = checkIns[0].check_in_date;

  // Update or Insert cached metrics into streaks table
  db.prepare(`
    INSERT INTO streaks (user_id, habit_id, current_streak, longest_streak, total_completed, last_check_in_date)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(habit_id) DO UPDATE SET
      current_streak = excluded.current_streak,
      longest_streak = excluded.longest_streak,
      total_completed = excluded.total_completed,
      last_check_in_date = excluded.last_check_in_date
  `).run(userId, habitId, currentStreak, finalLongest, totalCompleted, lastCheckInDate);

  return { currentStreak, longestStreak: finalLongest, totalCompleted };
};