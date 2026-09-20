/**
 * Date and Frequency Helper Utilities
 * Strictly operates on local time zeroed out to midnight (00:00:00.000)
 */

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FULL_DAY_MAP = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6
};

/**
 * Normalizes any valid date input into a local Date instance zeroed to midnight.
 * Strictly uses local date components (getFullYear(), getMonth(), getDate()) to prevent UTC shift.
 * @param {Date|string|number} dateInput 
 * @returns {Date}
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
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  }
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/**
 * Parses frequency_value into standard format
 * @param {*} value 
 * @returns {*}
 */
function parseFrequencyValue(value) {
  if (value === null || value === undefined) return [];
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      // If it's a numeric string, parse integer
      const num = parseInt(value, 10);
      return isNaN(num) ? value : num;
    }
  }
  return value;
}

/**
 * Determines whether a habit is due on a specific target date based on its frequency rule.
 * 
 * @param {Object} habit 
 * @param {string} [habit.frequency_type] - 'daily' | 'specific_days' | 'interval'
 * @param {*} [habit.frequency_value] - e.g. [1, 3, 5] for Mon/Wed/Fri, or 2 for every 2 days
 * @param {Date|string} [habit.created_at] - Habit creation timestamp used as interval anchor
 * @param {Date|string} [targetDate] - Target date to evaluate against (defaults to today)
 * @returns {boolean}
 */
function isHabitDueToday(habit, targetDate = new Date()) {
  if (!habit) return false;

  const target = normalizeDate(targetDate);
  const freqType = (habit.frequency_type || habit.frequency || 'daily').toLowerCase();
  const freqValue = parseFrequencyValue(habit.frequency_value);

  switch (freqType) {
    case 'daily':
      return true;

    case 'specific_days': {
      let days = Array.isArray(freqValue) ? freqValue : [];
      // Normalize day values to integers 0-6
      const normalizedDays = days.map(day => {
        if (typeof day === 'string') {
          const lower = day.trim().toLowerCase();
          return FULL_DAY_MAP[lower] !== undefined ? FULL_DAY_MAP[lower] : parseInt(lower, 10);
        }
        return Number(day);
      }).filter(n => !isNaN(n) && n >= 0 && n <= 6);

      const targetDayOfWeek = target.getDay(); // 0 = Sunday, 1 = Monday, ...
      return normalizedDays.includes(targetDayOfWeek);
    }

    case 'interval': {
      let interval = 1;
      if (typeof freqValue === 'number') {
        interval = freqValue;
      } else if (freqValue && typeof freqValue === 'object') {
        interval = freqValue.interval_days || freqValue.interval || 1;
      } else if (typeof freqValue === 'string') {
        const parsed = parseInt(freqValue, 10);
        if (!isNaN(parsed)) interval = parsed;
      }

      if (interval <= 1) return true;

      const anchorDate = normalizeDate(habit.created_at || target);
      const diffMs = target.getTime() - anchorDate.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays < 0) return false; // Not yet started
      return diffDays % interval === 0;
    }

    case 'weekly':
      // Legacy compatibility: weekly habits default to due
      return true;

    case 'monthly':
      // Legacy compatibility: monthly habits default to due on the same day-of-month
      if (habit.created_at) {
        return new Date(habit.created_at).getDate() === target.getDate();
      }
      return true;

    default:
      return true;
  }
}

/**
 * Returns a user-friendly label for a habit's frequency setting.
 * @param {string} frequencyType 
 * @param {*} frequencyValue 
 * @returns {string}
 */
function formatFrequencyLabel(frequencyType, frequencyValue) {
  const type = (frequencyType || 'daily').toLowerCase();
  const val = parseFrequencyValue(frequencyValue);

  if (type === 'daily') {
    return 'Daily';
  }

  if (type === 'specific_days') {
    if (!Array.isArray(val) || val.length === 0) return 'Specific Days';
    const names = val
      .map(d => {
        const num = typeof d === 'string' && FULL_DAY_MAP[d.toLowerCase()] !== undefined
          ? FULL_DAY_MAP[d.toLowerCase()]
          : Number(d);
        return DAY_NAMES[num] || d;
      })
      .filter(Boolean);
    return names.join(', ');
  }

  if (type === 'interval') {
    const interval = typeof val === 'number' ? val : (val && (val.interval_days || val.interval)) || 1;
    return interval === 1 ? 'Every day' : `Every ${interval} days`;
  }

  return type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Returns YYYY-MM-DD string formatted strictly using local date components.
 * @param {Date|string|number} dateInput 
 * @returns {string}
 */
function getLocalDateStr(dateInput = new Date()) {
  if (!dateInput) return '';
  if (typeof dateInput === 'string') {
    const match = dateInput.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}`;
    }
  }
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calculates current and longest consecutive streaks respecting frequency rules.
 * A streak resets to 0 if a scheduled due date was missed. Rest days are skipped.
 * 
 * @param {Object} habit 
 * @param {Set<string>|Array<string>} checkInDates 
 * @param {Date|string} [today] 
 * @returns {{ currentStreak: number, longestStreak: number }}
 */
function calculateStreakMetrics(habit, checkInDates, today = new Date()) {
  const normToday = normalizeDate(today);
  const todayStr = getLocalDateStr(normToday);
  const createdAt = normalizeDate(habit.created_at || normToday);

  const datesSet = new Set();
  if (checkInDates) {
    const list = checkInDates instanceof Set ? Array.from(checkInDates) : checkInDates;
    list.forEach(item => {
      const s = getLocalDateStr(item);
      if (s) datesSet.add(s);
    });
  }

  const daysAgo365 = new Date(normToday);
  daysAgo365.setDate(daysAgo365.getDate() - 365);
  const minDate = createdAt < daysAgo365 ? createdAt : daysAgo365;

  // 1. Longest streak forward
  let longestStreak = 0;
  let tempStreak = 0;
  let curr = new Date(minDate);

  while (curr <= normToday) {
    const dStr = getLocalDateStr(curr);
    const isDue = isHabitDueToday(habit, curr);

    if (isDue) {
      if (datesSet.has(dStr)) {
        tempStreak++;
        if (tempStreak > longestStreak) longestStreak = tempStreak;
      } else {
        if (dStr !== todayStr) {
          tempStreak = 0;
        }
      }
    }
    curr.setDate(curr.getDate() + 1);
  }

  // 2. Current streak backward
  let currentStreak = 0;
  curr = new Date(normToday);
  let countingCurrent = true;

  while (curr >= minDate && countingCurrent) {
    const dStr = getLocalDateStr(curr);
    const isDue = isHabitDueToday(habit, curr);

    if (isDue) {
      if (datesSet.has(dStr)) {
        currentStreak++;
      } else {
        if (dStr !== todayStr) {
          countingCurrent = false;
        }
      }
    }
    curr.setDate(curr.getDate() - 1);
  }

  return { currentStreak, longestStreak };
}

module.exports = {
  normalizeDate,
  getLocalDateStr,
  parseFrequencyValue,
  isHabitDueToday,
  formatFrequencyLabel,
  calculateStreakMetrics,
  DAY_NAMES
};
