const db = require('../config/db');

exports.getStats = (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Overall Completion Summary
    const overall = db.prepare(`
      SELECT 
        COUNT(DISTINCT h.id) as total_habits,
        COALESCE(SUM(s.total_completed), 0) as total_check_ins,
        COALESCE(MAX(s.longest_streak), 0) as max_streak
      FROM habits h
      LEFT JOIN streaks s ON h.id = s.habit_id
      WHERE h.user_id = ? AND h.is_archived = 0
    `).get(userId);

    // 2. Category Wise Breakdown
    const categoryStats = db.prepare(`
      SELECT 
        c.name as category_name,
        c.color_hex,
        COUNT(h.id) as habit_count
      FROM habits h
      JOIN categories c ON h.category_id = c.id
      WHERE h.user_id = ? AND h.is_archived = 0
      GROUP BY c.id
    `).all(userId);

    // 3. Past 30 Days Check-In Heatmap Data
    const heatmap = db.prepare(`
      SELECT ci.check_in_date, COUNT(ci.id) as count
      FROM check_ins ci
      JOIN habits h ON ci.habit_id = h.id
      WHERE h.user_id = ? AND ci.check_in_date >= date('now', '-30 days')
      GROUP BY ci.check_in_date
      ORDER BY ci.check_in_date ASC
    `).all(userId);

    res.json({
      success: true,
      stats: {
        totalHabits: overall.total_habits,
        totalCheckIns: overall.total_check_ins,
        maxStreak: overall.max_streak,
        categories: categoryStats,
        heatmap
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};