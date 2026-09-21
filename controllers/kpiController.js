const pool = require('../config/db');
const features = require('../config/features');
const {
  isHabitDueToday,
  calculateStreakMetrics,
  getLocalDateStr,
  normalizeDate,
  getHabitScoreTier
} = require('../utils/dateHelpers');

/**
 * Controller to calculate and return lightweight KPI summary metrics
 * for the authenticated user (Habitify inspired).
 */
exports.getKpiSummary = async (req, res) => {
  // Feature flag isolation check
  if (!features.EXPERIMENT_KPI_DASHBOARD) {
    return res.json({
      success: true,
      enabled: false,
      kpis: null,
      message: 'KPI Dashboard experiment is currently disabled'
    });
  }

  const userId = req.user.id;
  const targetDateStr = req.query.date || getLocalDateStr(new Date());
  const targetDate = normalizeDate(targetDateStr);

  try {
    // 1. Fetch all active habits for this user with check-in status for targetDate
    const { rows: habits } = await pool.query(`
      SELECT h.*, 
             COALESCE((
               SELECT ci.count FROM check_ins ci 
               WHERE ci.habit_id = h.id AND ci.check_in_date = $2
             ), 0) as today_count,
             EXISTS (
               SELECT 1 FROM check_ins ci 
               WHERE ci.habit_id = h.id AND ci.check_in_date = $2 AND ci.status = true
             ) as is_completed_today
      FROM habits h
      WHERE h.user_id = $1 AND h.is_archived = FALSE
      ORDER BY h.id ASC
    `, [userId, targetDateStr]);

    // 2. Fetch total check-ins overall across all user habits
    const { rows: checkInCountRows } = await pool.query(`
      SELECT COUNT(ci.id)::int as total_check_ins
      FROM check_ins ci
      JOIN habits h ON ci.habit_id = h.id
      WHERE h.user_id = $1 AND ci.status = true
    `, [userId]);
    const totalCheckIns = checkInCountRows[0] ? parseInt(checkInCountRows[0].total_check_ins, 10) : 0;

    // 3. Batch fetch all check-in dates for all user habits to avoid N+1 queries
    const habitIds = habits.map(h => h.id);
    const checkInsByHabit = {};
    if (habitIds.length > 0) {
      const { rows: allLogs } = await pool.query(`
        SELECT habit_id, check_in_date 
        FROM check_ins 
        WHERE habit_id = ANY($1::int[]) AND status = true
        ORDER BY check_in_date ASC
      `, [habitIds]);

      for (const log of allLogs) {
        if (!checkInsByHabit[log.habit_id]) {
          checkInsByHabit[log.habit_id] = [];
        }
        checkInsByHabit[log.habit_id].push(getLocalDateStr(log.check_in_date));
      }
    }

    let dueTodayCount = 0;
    let completedTodayCount = 0;
    let activeStreaksCount = 0;
    let bestStreak = 0;
    let totalStreakDays = 0;
    let scoreSum = 0;

    const distribution = {
      mastered: 0,
      strong: 0,
      building: 0,
      starting: 0
    };

    // 4. Process each habit to compute accurate metrics
    for (const habit of habits) {
      const checkInDates = checkInsByHabit[habit.id] || [];

      const isDue = isHabitDueToday(habit, targetDate, checkInDates);
      const isCompleted = Boolean(habit.is_completed_today);
      const { currentStreak, longestStreak, score } = calculateStreakMetrics(habit, checkInDates, targetDate);

      if (isDue) {
        dueTodayCount++;
        if (isCompleted) {
          completedTodayCount++;
        }
      } else if (isCompleted) {
        // Count non-scheduled completed check-ins towards completed
        completedTodayCount++;
      }

      if (currentStreak > 0) {
        activeStreaksCount++;
      }

      totalStreakDays += currentStreak;
      if (longestStreak > bestStreak) {
        bestStreak = longestStreak;
      }

      const scoreNum = Number(score) || 0.0;
      scoreSum += scoreNum;

      if (scoreNum >= 80) distribution.mastered++;
      else if (scoreNum >= 50) distribution.strong++;
      else if (scoreNum >= 25) distribution.building++;
      else distribution.starting++;
    }

    const totalHabits = habits.length;
    const pendingCount = Math.max(0, dueTodayCount - completedTodayCount);
    const completionRate = dueTodayCount > 0
      ? Math.min(100.0, Number(((completedTodayCount / dueTodayCount) * 100).toFixed(1)))
      : (totalHabits > 0 && completedTodayCount > 0 ? 100.0 : 0.0);

    const avgScore = totalHabits > 0
      ? Number((scoreSum / totalHabits).toFixed(1))
      : 0.0;

    const tierInfo = getHabitScoreTier(avgScore);

    res.json({
      success: true,
      enabled: true,
      kpis: {
        today: {
          total_due: dueTodayCount,
          completed: completedTodayCount,
          pending: pendingCount,
          completion_rate: completionRate
        },
        streaks: {
          active_count: activeStreaksCount,
          best_streak: bestStreak,
          total_streak_days: totalStreakDays
        },
        score: {
          avg_score: avgScore,
          tier: tierInfo.label,
          tier_class: `tier-${tierInfo.tier}`,
          color: tierInfo.color,
          distribution
        },
        habits: {
          total: totalHabits,
          total_check_ins: totalCheckIns
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
