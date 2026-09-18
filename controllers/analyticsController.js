const pool = require('../config/db');

exports.getStats = async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Overall Completion Summary
    const { rows: overallRows } = await pool.query(`
      SELECT 
        COUNT(DISTINCT h.id) as total_habits,
        COALESCE(SUM(s.total_completed), 0) as total_check_ins,
        COALESCE(MAX(s.longest_streak), 0) as max_streak
      FROM habits h
      LEFT JOIN streaks s ON h.id = s.habit_id
      WHERE h.user_id = $1 AND h.is_archived = FALSE
    `, [userId]);
    const overall = overallRows[0];

    // 2. Category Wise Breakdown
    const { rows: categoryStats } = await pool.query(`
      SELECT 
        c.name as category_name,
        c.color_hex,
        COUNT(h.id) as habit_count
      FROM habits h
      JOIN categories c ON h.category_id = c.id
      WHERE h.user_id = $1 AND h.is_archived = FALSE
      GROUP BY c.id, c.name, c.color_hex
    `, [userId]);

    // 3. Past 30 Days Check-In Heatmap Data
    const { rows: heatmap } = await pool.query(`
      SELECT ci.check_in_date, COUNT(ci.id) as count
      FROM check_ins ci
      JOIN habits h ON ci.habit_id = h.id
      WHERE h.user_id = $1 AND ci.check_in_date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY ci.check_in_date
      ORDER BY ci.check_in_date ASC
    `, [userId]);

    res.json({
      success: true,
      stats: {
        totalHabits: parseInt(overall.total_habits, 10),
        totalCheckIns: parseInt(overall.total_check_ins, 10),
        maxStreak: parseInt(overall.max_streak, 10),
        categories: categoryStats,
        heatmap
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};