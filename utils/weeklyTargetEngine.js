/**
 * Isolated Weekly Target Engine
 * Encapsulates all logic for Flexible Weekly Targets ('X times per week')
 * Modular and fully decoupled from daily/interval frequency logic.
 */

function normalizeDate(dateInput = new Date()) {
  if (!dateInput) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  }
  if (typeof dateInput === 'string') {
    const match = dateInput.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10), 0, 0, 0, 0);
    }
  }
  if (dateInput instanceof Date) {
    return new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate(), 0, 0, 0, 0);
  }
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  }
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function getLocalDateStr(dateInput = new Date()) {
  const d = normalizeDate(dateInput);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns Monday and Sunday boundaries of the week containing dateInput.
 * ISO standard: Monday is day 1, Sunday is day 7.
 * @param {Date|string} dateInput 
 * @returns {{ monday: Date, sunday: Date, mondayStr: string, sundayStr: string }}
 */
function getWeekBounds(dateInput = new Date()) {
  const d = normalizeDate(dateInput);
  const day = d.getDay(); // 0 is Sunday, 1 is Monday ... 6 is Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    monday,
    sunday,
    mondayStr: getLocalDateStr(monday),
    sundayStr: getLocalDateStr(sunday)
  };
}

/**
 * Extracts target_per_week integer (1 to 7) from habit record
 * @param {Object} habit 
 * @returns {number}
 */
function getTargetPerWeek(habit) {
  if (!habit) return 3;

  if (habit.target_per_week && Number(habit.target_per_week) > 0) {
    return Math.min(7, Math.max(1, parseInt(habit.target_per_week, 10)));
  }

  let val = habit.frequency_value;
  if (typeof val === 'string') {
    try { val = JSON.parse(val); } catch { val = parseInt(val, 10); }
  }

  if (typeof val === 'number' && val > 0) {
    return Math.min(7, Math.max(1, val));
  }

  if (val && typeof val === 'object' && val.target) {
    return Math.min(7, Math.max(1, parseInt(val.target, 10)));
  }

  return 3; // Default 3x per week
}

/**
 * Returns check-ins within the target date's calendar week
 * @param {Array<string>|Set<string>} checkInDates 
 * @param {Date|string} targetDate 
 * @returns {Array<string>}
 */
function getWeeklyCheckIns(checkInDates, targetDate = new Date()) {
  const bounds = getWeekBounds(targetDate);
  const dateSet = new Set(Array.from(checkInDates || []).map(d => getLocalDateStr(d)));

  const matchedDates = [];
  const curr = new Date(bounds.monday);
  while (curr <= bounds.sunday) {
    const dStr = getLocalDateStr(curr);
    if (dateSet.has(dStr)) {
      matchedDates.push(dStr);
    }
    curr.setDate(curr.getDate() + 1);
  }

  return matchedDates;
}

/**
 * Returns progress summary for current week
 * @param {Object} habit 
 * @param {Array<string>|Set<string>} checkInDates 
 * @param {Date|string} targetDate 
 * @returns {{ target: number, completed: number, target_met: boolean, percent: number, remaining: number }}
 */
function getWeeklyProgress(habit, checkInDates, targetDate = new Date()) {
  const target = getTargetPerWeek(habit);
  const weeklyLogs = getWeeklyCheckIns(checkInDates, targetDate);
  const completed = weeklyLogs.length;
  const target_met = completed >= target;
  const percent = Math.min(100, Math.round((completed / target) * 100));
  const remaining = Math.max(0, target - completed);

  return {
    target,
    completed,
    target_met,
    percent,
    remaining,
    dates: weeklyLogs
  };
}

/**
 * Determines whether a weekly target habit is due on targetDate.
 * - If target is already met for this week, returns false (Goal Met).
 * - Otherwise returns true (due).
 * @param {Object} habit 
 * @param {Date|string} targetDate 
 * @param {Array<string>|Set<string>} [checkInDates] 
 * @returns {boolean}
 */
function isWeeklyTargetDueToday(habit, targetDate = new Date(), checkInDates = []) {
  const progress = getWeeklyProgress(habit, checkInDates, targetDate);
  return !progress.target_met;
}

/**
 * Computes weekly streak metrics and exponential habit score for weekly targets
 * @param {Object} habit 
 * @param {Array<string>|Set<string>} checkInDates 
 * @param {Date|string} today 
 * @returns {{ currentStreak: number, longestStreak: number, score: number }}
 */
function calculateWeeklyStreakMetrics(habit, checkInDates, today = new Date()) {
  const normToday = normalizeDate(today);
  const target = getTargetPerWeek(habit);
  const datesSet = new Set(Array.from(checkInDates || []).map(d => getLocalDateStr(d)));

  // Group check-ins by Monday week identifier
  const weekMap = new Map();
  datesSet.forEach(dStr => {
    const bounds = getWeekBounds(dStr);
    const mStr = bounds.mondayStr;
    weekMap.set(mStr, (weekMap.get(mStr) || 0) + 1);
  });

  const currentWeekBounds = getWeekBounds(normToday);
  const currentWeekMonday = currentWeekBounds.monday;

  // Determine starting week (up to 52 weeks ago or habit creation)
  const createdAt = normalizeDate(habit.created_at || normToday);
  const createdBounds = getWeekBounds(createdAt);
  const weeksAgo52 = new Date(currentWeekMonday);
  weeksAgo52.setDate(weeksAgo52.getDate() - (52 * 7));
  const startMonday = createdBounds.monday < weeksAgo52 ? createdBounds.monday : weeksAgo52;

  // 1. Longest streak forward across all calendar weeks
  let longestStreak = 0;
  let tempStreak = 0;
  let currMonday = new Date(startMonday);

  // Score exponential parameters
  const DECAY_FACTOR = 0.92;
  const GAIN_FACTOR = 0.08;
  let score = 0.0;

  while (currMonday <= currentWeekMonday) {
    const mStr = getLocalDateStr(currMonday);
    const count = weekMap.get(mStr) || 0;
    const isCurrentWeek = mStr === currentWeekBounds.mondayStr;

    if (count >= target) {
      tempStreak++;
      if (tempStreak > longestStreak) longestStreak = tempStreak;
      // Exponential score gain
      score = score * (1 - GAIN_FACTOR) + 100.0 * GAIN_FACTOR;
    } else {
      if (isCurrentWeek) {
        // Current week in progress: prorate progress into score without penalizing as a missed week
        const proratedGain = (count / target) * 100.0;
        score = score * (1 - GAIN_FACTOR * 0.5) + proratedGain * (GAIN_FACTOR * 0.5);
      } else {
        tempStreak = 0;
        // Past week missed: apply decay
        score = score * DECAY_FACTOR;
      }
    }

    currMonday.setDate(currMonday.getDate() + 7);
  }

  // 2. Current streak backward
  let currentStreak = 0;
  const currentWeekCount = weekMap.get(currentWeekBounds.mondayStr) || 0;
  const currentWeekMet = currentWeekCount >= target;

  if (currentWeekMet) {
    currentStreak = 1;
  }

  // Check previous weeks consecutive
  let checkMonday = new Date(currentWeekMonday);
  checkMonday.setDate(checkMonday.getDate() - 7);

  while (checkMonday >= startMonday) {
    const mStr = getLocalDateStr(checkMonday);
    const count = weekMap.get(mStr) || 0;
    if (count >= target) {
      currentStreak++;
    } else {
      break;
    }
    checkMonday.setDate(checkMonday.getDate() - 7);
  }

  if (currentStreak > longestStreak) longestStreak = currentStreak;

  const roundedScore = Math.min(100.0, Math.max(0.0, Math.round(score * 10) / 10));

  return {
    currentStreak,
    longestStreak,
    score: roundedScore
  };
}

/**
 * Returns formatted label for weekly target
 * @param {number|Object} target 
 * @returns {string}
 */
function formatWeeklyTargetLabel(target) {
  const num = typeof target === 'number' ? target : getTargetPerWeek(target);
  return `${num}x / week`;
}

module.exports = {
  normalizeDate,
  getLocalDateStr,
  getWeekBounds,
  getTargetPerWeek,
  getWeeklyCheckIns,
  getWeeklyProgress,
  isWeeklyTargetDueToday,
  calculateWeeklyStreakMetrics,
  formatWeeklyTargetLabel
};
