const pool = require('../config/db');
const features = require('../config/features');
const { isHabitDueToday, formatFrequencyLabel, normalizeDate, calculateStreakMetrics, getLocalDateStr, weeklyTargetEngine } = require('../utils/dateHelpers');
const javaBridge = require('../utils/javaBridge');

// Get All Habits for Logged-In User
exports.getHabits = async (req, res) => {
  const userId = req.user.id;
  const targetDateStr = req.query.date || getLocalDateStr(new Date());
  const targetDate = normalizeDate(targetDateStr);

  try {
    const { rows: habits } = await pool.query(`
      SELECT h.*, 
             c.name as category_name,
             COALESCE(NULLIF(h.color_hex, ''), c.color_hex, '#3B82F6') as category_color,
             c.icon_name as category_icon,
             COALESCE((
               SELECT ci.count FROM check_ins ci 
               WHERE ci.habit_id = h.id AND ci.check_in_date = $2
             ), 0) as today_count,
             EXISTS (
               SELECT 1 FROM check_ins ci 
               WHERE ci.habit_id = h.id AND ci.check_in_date = $2 AND ci.status = true
             ) as is_completed_today
      FROM habits h 
      LEFT JOIN categories c ON h.category_id = c.id
      WHERE h.user_id = $1
      ORDER BY h.id ASC
    `, [userId, targetDateStr]);
    
    const processedHabits = await Promise.all(habits.map(async habit => {
      const { rows: logs } = await pool.query('SELECT check_in_date FROM check_ins WHERE habit_id = $1 AND status = true', [habit.id]);
      const checkInDates = logs.map(l => getLocalDateStr(l.check_in_date));
      const isDue = isHabitDueToday(habit, targetDate, checkInDates);
      const { currentStreak, longestStreak, score } = calculateStreakMetrics(habit, checkInDates);

      await pool.query(`
        INSERT INTO streaks (user_id, habit_id, current_streak, longest_streak, score)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (habit_id) DO UPDATE SET
          current_streak = EXCLUDED.current_streak,
          longest_streak = EXCLUDED.longest_streak,
          score = EXCLUDED.score
      `, [userId, habit.id, currentStreak, longestStreak, score]);

      await pool.query('UPDATE habits SET score = $1 WHERE id = $2', [score, habit.id]);

      let weeklyProgress = null;
      if (features.EXPERIMENT_WEEKLY_TARGETS && habit.frequency_type === 'weekly_target' && weeklyTargetEngine) {
        weeklyProgress = weeklyTargetEngine.getWeeklyProgress(habit, checkInDates, targetDate);
      }

      const isQuant = Boolean(features.EXPERIMENT_QUANTIFIABLE_HABITS);
      const isCategories = Boolean(features.EXPERIMENT_CATEGORIES_TAGS);

      return {
        ...habit,
        category_id: isCategories ? habit.category_id : null,
        category_name: isCategories ? (habit.category_name || habit.tag || null) : null,
        tag: isCategories ? (habit.tag || '') : '',
        color_hex: isCategories ? (habit.color_hex || habit.category_color || null) : null,
        target_per_day: isQuant ? (habit.target_per_day || 1) : 1,
        unit: isQuant ? (habit.unit || '') : '',
        today_count: isQuant ? parseInt(habit.today_count || 0, 10) : (habit.is_completed_today ? 1 : 0),
        current_streak: currentStreak,
        longest_streak: longestStreak,
        score: Number(score) || 0.0,
        is_due_today: isDue,
        is_completed_today: Boolean(habit.is_completed_today),
        frequency_label: formatFrequencyLabel(habit.frequency_type || habit.frequency, habit.frequency_value, habit),
        weekly_progress: weeklyProgress
      };
    }));

    res.json({ success: true, habits: processedHabits });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Create Habit with Frequency
exports.createHabit = async (req, res) => {
  const { title, description, frequency, frequency_type, frequency_value, target_per_week, target_per_day, unit, category_id, tag, color_hex } = req.body;
  const userId = req.user.id;

  if (!title) {
    return res.status(400).json({ success: false, error: 'Title is required' });
  }

  try {
    const freqType = frequency_type || frequency || 'daily';
    let freqVal = frequency_value !== undefined ? frequency_value : [];
    let targetPerWeek = 7;

    if (features.EXPERIMENT_WEEKLY_TARGETS && freqType === 'weekly_target') {
      targetPerWeek = Math.min(7, Math.max(1, parseInt(target_per_week || frequency_value || 3, 10)));
      freqVal = targetPerWeek;
    }

    let targetPerDay = 1;
    let habitUnit = '';
    if (features.EXPERIMENT_QUANTIFIABLE_HABITS) {
      if (req.body.target_per_day !== undefined) {
        const parsedTarget = parseInt(req.body.target_per_day, 10);
        if (parsedTarget <= 0 || isNaN(parsedTarget)) {
          const valRes = await javaBridge.validateHabit({ name: title, target_per_day: req.body.target_per_day, unit });
          return res.status(400).json({
            success: false,
            error: valRes.error || 'Habit target must be greater than 0',
            errorCode: valRes.errorCode || 'INVALID_TARGET',
            exceptionClass: valRes.exceptionClass || 'InvalidTargetException'
          });
        }
        targetPerDay = parsedTarget;
      }
      habitUnit = typeof unit === 'string' ? unit.trim().slice(0, 50) : '';
    }

    let catId = null;
    let habitTag = '';
    let habitColor = '';
    if (features.EXPERIMENT_CATEGORIES_TAGS) {
      if (category_id) catId = parseInt(category_id, 10) || null;
      if (!catId && req.body.category_name) {
        const { rows: catRows } = await pool.query('SELECT id FROM categories WHERE LOWER(name) = LOWER($1)', [req.body.category_name.trim()]);
        if (catRows.length > 0) catId = catRows[0].id;
      }
      if (typeof tag === 'string') habitTag = tag.trim().slice(0, 50);
      if (color_hex && /^#[0-9A-Fa-f]{6}$/.test(color_hex)) habitColor = color_hex;
    }

    const freqValJson = typeof freqVal === 'string' ? freqVal : JSON.stringify(freqVal);
    
    // RETURNING * gives us the new row directly in PostgreSQL
    const { rows: newHabit } = await pool.query(
      `INSERT INTO habits (user_id, title, description, frequency, frequency_type, frequency_value, target_per_week, target_per_day, unit, category_id, tag, color_hex) 
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12) 
       RETURNING *`,
      [userId, title, description || '', freqType, freqType, freqValJson, targetPerWeek, targetPerDay, habitUnit, catId, habitTag, habitColor]
    );
    
    const habit = newHabit[0];

    // Fetch category info if assigned
    let categoryName = null;
    let categoryColor = habitColor || null;
    if (features.EXPERIMENT_CATEGORIES_TAGS && catId) {
      const { rows: catRows } = await pool.query('SELECT name, color_hex FROM categories WHERE id = $1', [catId]);
      if (catRows.length > 0) {
        categoryName = catRows[0].name;
        if (!categoryColor) categoryColor = catRows[0].color_hex;
      }
    }
    if (!categoryName && habitTag) categoryName = habitTag;

    habit.category_id = features.EXPERIMENT_CATEGORIES_TAGS ? catId : null;
    habit.category_name = features.EXPERIMENT_CATEGORIES_TAGS ? categoryName : null;
    habit.tag = features.EXPERIMENT_CATEGORIES_TAGS ? habitTag : '';
    habit.color_hex = features.EXPERIMENT_CATEGORIES_TAGS ? (habitColor || categoryColor || null) : null;
    habit.score = 0.0;
    habit.is_due_today = isHabitDueToday(habit);
    habit.is_completed_today = false;
    habit.today_count = 0;
    habit.target_per_day = targetPerDay;
    habit.unit = habitUnit;
    habit.frequency_label = formatFrequencyLabel(habit.frequency_type, habit.frequency_value, habit);

    if (features.EXPERIMENT_WEEKLY_TARGETS && habit.frequency_type === 'weekly_target' && weeklyTargetEngine) {
      habit.weekly_progress = weeklyTargetEngine.getWeeklyProgress(habit, [], new Date());
    }

    // Initialize streak cache record
    await pool.query('INSERT INTO streaks (user_id, habit_id, score) VALUES ($1, $2, 0.0)', [userId, habit.id]);

    res.status(201).json({ success: true, habit });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Update Habit Details
exports.updateHabit = async (req, res) => {
  const { habitId } = req.params;
  const { title, description, frequency, frequency_type, frequency_value, target_per_week, target_per_day, unit, category_id, tag, color_hex } = req.body;
  const userId = req.user.id;

  try {
    const freqType = frequency_type || frequency || 'daily';
    let freqVal = frequency_value !== undefined ? frequency_value : [];
    let targetPerWeek = 7;

    if (features.EXPERIMENT_WEEKLY_TARGETS && freqType === 'weekly_target') {
      targetPerWeek = Math.min(7, Math.max(1, parseInt(target_per_week || frequency_value || 3, 10)));
      freqVal = targetPerWeek;
    }

    let targetPerDay = undefined;
    let habitUnit = undefined;
    if (features.EXPERIMENT_QUANTIFIABLE_HABITS) {
      if (target_per_day !== undefined) {
        const parsedTarget = parseInt(target_per_day, 10);
        if (parsedTarget <= 0 || isNaN(parsedTarget)) {
          const valRes = await javaBridge.validateHabit({ name: title || 'Habit', target_per_day });
          return res.status(400).json({
            success: false,
            error: valRes.error || 'Habit target must be greater than 0',
            errorCode: valRes.errorCode || 'INVALID_TARGET',
            exceptionClass: valRes.exceptionClass || 'InvalidTargetException'
          });
        }
        targetPerDay = parsedTarget;
      }
      if (unit !== undefined) habitUnit = typeof unit === 'string' ? unit.trim().slice(0, 50) : '';
    }

    let catId = undefined;
    let habitTag = undefined;
    let habitColor = undefined;
    if (features.EXPERIMENT_CATEGORIES_TAGS) {
      if (category_id !== undefined) catId = category_id ? parseInt(category_id, 10) : null;
      if (!catId && req.body.category_name) {
        const { rows: catRows } = await pool.query('SELECT id FROM categories WHERE LOWER(name) = LOWER($1)', [req.body.category_name.trim()]);
        if (catRows.length > 0) catId = catRows[0].id;
      }
      if (tag !== undefined) habitTag = typeof tag === 'string' ? tag.trim().slice(0, 50) : '';
      if (color_hex !== undefined) habitColor = color_hex && /^#[0-9A-Fa-f]{6}$/.test(color_hex) ? color_hex : '';
    }

    const freqValJson = typeof freqVal === 'string' ? freqVal : JSON.stringify(freqVal);

    const result = await pool.query(
      `UPDATE habits 
       SET title = $1, description = $2, frequency = $3, frequency_type = $4, frequency_value = $5::jsonb, target_per_week = $6,
           target_per_day = COALESCE($7, target_per_day),
           unit = COALESCE($8, unit),
           category_id = CASE WHEN $9::boolean THEN $10::int ELSE category_id END,
           tag = COALESCE($11, tag),
           color_hex = COALESCE($12, color_hex)
       WHERE id = $13 AND user_id = $14 
       RETURNING *`,
      [
        title, description || '', freqType, freqType, freqValJson, targetPerWeek, targetPerDay, habitUnit,
        catId !== undefined, catId !== undefined ? catId : null,
        habitTag, habitColor, habitId, userId
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Habit not found or unauthorized' });
    }

    const updatedHabit = result.rows[0];

    // If target_per_day changed, update status on check-ins
    if (features.EXPERIMENT_QUANTIFIABLE_HABITS && targetPerDay !== undefined) {
      await pool.query('UPDATE check_ins SET status = (count >= $1) WHERE habit_id = $2', [targetPerDay, habitId]);
    }

    let categoryName = null;
    let categoryColor = updatedHabit.color_hex || null;
    if (features.EXPERIMENT_CATEGORIES_TAGS && updatedHabit.category_id) {
      const { rows: catRows } = await pool.query('SELECT name, color_hex FROM categories WHERE id = $1', [updatedHabit.category_id]);
      if (catRows.length > 0) {
        categoryName = catRows[0].name;
        if (!categoryColor) categoryColor = catRows[0].color_hex;
      }
    }
    if (!categoryName && updatedHabit.tag) categoryName = updatedHabit.tag;

    updatedHabit.category_id = features.EXPERIMENT_CATEGORIES_TAGS ? updatedHabit.category_id : null;
    updatedHabit.category_name = features.EXPERIMENT_CATEGORIES_TAGS ? categoryName : null;
    updatedHabit.tag = features.EXPERIMENT_CATEGORIES_TAGS ? (updatedHabit.tag || '') : '';
    updatedHabit.color_hex = features.EXPERIMENT_CATEGORIES_TAGS ? (categoryColor || null) : null;
    updatedHabit.score = parseFloat(updatedHabit.score) || 0.0;
    updatedHabit.is_due_today = isHabitDueToday(updatedHabit);
    updatedHabit.frequency_label = formatFrequencyLabel(updatedHabit.frequency_type, updatedHabit.frequency_value, updatedHabit);

    if (features.EXPERIMENT_WEEKLY_TARGETS && updatedHabit.frequency_type === 'weekly_target' && weeklyTargetEngine) {
      const { rows: logs } = await pool.query('SELECT check_in_date FROM check_ins WHERE habit_id = $1 AND status = true', [habitId]);
      const checkInDates = logs.map(l => getLocalDateStr(l.check_in_date));
      updatedHabit.weekly_progress = weeklyTargetEngine.getWeeklyProgress(updatedHabit, checkInDates, new Date());
    }

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
    const { rows: habitRows } = await pool.query(`
      SELECT h.*, 
             c.name as category_name,
             COALESCE(NULLIF(h.color_hex, ''), c.color_hex, '#3B82F6') as category_color,
             c.icon_name as category_icon
      FROM habits h 
      LEFT JOIN categories c ON h.category_id = c.id
      WHERE h.id = $1 AND h.user_id = $2
    `, [habitId, userId]);
    const habit = habitRows[0];

    if (!habit) {
      return res.status(404).json({ success: false, error: 'Habit not found' });
    }

    // Query 'check_ins' table
    const { rows: logs } = await pool.query('SELECT check_in_date FROM check_ins WHERE habit_id = $1 AND status = true', [habitId]);
    const dates = logs.map(log => getLocalDateStr(log.check_in_date));
    const { currentStreak, longestStreak, score } = calculateStreakMetrics(habit, dates);

    habit.is_due_today = isHabitDueToday(habit, new Date(), dates);
    habit.frequency_label = formatFrequencyLabel(habit.frequency_type || habit.frequency, habit.frequency_value, habit);

    let weeklyProgress = null;
    if (features.EXPERIMENT_WEEKLY_TARGETS && habit.frequency_type === 'weekly_target' && weeklyTargetEngine) {
      weeklyProgress = weeklyTargetEngine.getWeeklyProgress(habit, dates, new Date());
    }

    const { rows: todayCheckIn } = await pool.query(
      'SELECT count, status FROM check_ins WHERE habit_id = $1 AND check_in_date = $2',
      [habitId, getLocalDateStr(new Date())]
    );
    const todayCount = todayCheckIn[0] ? (todayCheckIn[0].count || 0) : 0;

    const isCategories = Boolean(features.EXPERIMENT_CATEGORIES_TAGS);

    res.json({
      success: true,
      habit: {
        ...habit,
        category_id: isCategories ? habit.category_id : null,
        category_name: isCategories ? (habit.category_name || habit.tag || null) : null,
        tag: isCategories ? (habit.tag || '') : '',
        color_hex: isCategories ? (habit.color_hex || habit.category_color || null) : null,
        score: Number(score) || 0.0,
        today_count: features.EXPERIMENT_QUANTIFIABLE_HABITS ? todayCount : (todayCheckIn[0]?.status ? 1 : 0),
        target_per_day: features.EXPERIMENT_QUANTIFIABLE_HABITS ? (habit.target_per_day || 1) : 1,
        unit: features.EXPERIMENT_QUANTIFIABLE_HABITS ? (habit.unit || '') : ''
      },
      checkInDates: dates,
      today_count: features.EXPERIMENT_QUANTIFIABLE_HABITS ? todayCount : (todayCheckIn[0]?.status ? 1 : 0),
      score: Number(score) || 0.0,
      current_streak: currentStreak,
      longest_streak: longestStreak,
      weekly_progress: weeklyProgress
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Check-in Toggle Handler
exports.toggleCheckIn = async (req, res) => {
  const { habitId } = req.params;
  const userId = req.user.id;
  const checkInDate = req.body && req.body.date ? getLocalDateStr(req.body.date) : getLocalDateStr(new Date());
  const requestedAction = req.body && req.body.action ? req.body.action : null;
  const customCount = req.body && req.body.count !== undefined ? parseInt(req.body.count, 10) : null;

  try {
    const { rows: habitRows } = await pool.query('SELECT * FROM habits WHERE id = $1 AND user_id = $2', [habitId, userId]);
    if (habitRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Habit not found' });
    }

    const habit = habitRows[0];
    const targetDate = normalizeDate(checkInDate);

    // Query 'check_ins' table
    const { rows: existingLogs } = await pool.query(
      'SELECT * FROM check_ins WHERE habit_id = $1 AND check_in_date = $2',
      [habitId, checkInDate]
    );
    const existingLog = existingLogs[0];

    // For non-weekly_target habits, enforce scheduled days check when checking in (unless decrementing/resetting)
    const isReducingAction = requestedAction === 'decrement' || requestedAction === 'reset';
    if (!existingLog && !isReducingAction && habit.frequency_type !== 'weekly_target') {
      if (!isHabitDueToday(habit, targetDate)) {
        return res.status(400).json({ success: false, error: 'Habit is not scheduled on this date' });
      }
    }

    let { rows: streakRows } = await pool.query('SELECT * FROM streaks WHERE habit_id = $1', [habitId]);
    let streakRecord = streakRows[0];

    if (!streakRecord) {
      await pool.query('INSERT INTO streaks (user_id, habit_id, score) VALUES ($1, $2, 0.0)', [userId, habitId]);
      streakRecord = { current_streak: 0, longest_streak: 0, score: 0.0 };
    }

    let newStreak = streakRecord.current_streak || 0;
    let newLongest = streakRecord.longest_streak || 0;
    let newScore = parseFloat(streakRecord.score) || 0.0;
    let newCount = 0;
    let isCompleted = false;

    if (features.EXPERIMENT_QUANTIFIABLE_HABITS && habit.target_per_day > 1) {
      // Quantifiable habit logic
      const action = requestedAction || 'increment';
      const currentCount = existingLog ? parseInt(existingLog.count || 0, 10) : 0;

      if (action === 'increment') {
        newCount = currentCount + 1;
      } else if (action === 'decrement') {
        newCount = Math.max(0, currentCount - 1);
      } else if (action === 'reset') {
        newCount = 0;
      } else if (action === 'set' && customCount !== null) {
        newCount = Math.max(0, customCount);
      } else if (action === 'toggle') {
        newCount = (currentCount >= habit.target_per_day) ? 0 : currentCount + 1;
      } else {
        newCount = currentCount + 1;
      }

      isCompleted = newCount >= habit.target_per_day;

      if (newCount <= 0) {
        if (existingLog) {
          await pool.query('DELETE FROM check_ins WHERE id = $1', [existingLog.id]);
        }
      } else {
        if (existingLog) {
          await pool.query('UPDATE check_ins SET count = $1, status = $2 WHERE id = $3', [newCount, isCompleted, existingLog.id]);
        } else {
          await pool.query('INSERT INTO check_ins (habit_id, check_in_date, count, status) VALUES ($1, $2, $3, $4)', [habitId, checkInDate, newCount, isCompleted]);
        }
      }
    } else {
      // Standard boolean toggle
      if (existingLog) {
        await pool.query('DELETE FROM check_ins WHERE id = $1', [existingLog.id]);
        newCount = 0;
        isCompleted = false;
      } else {
        await pool.query('INSERT INTO check_ins (habit_id, check_in_date, count, status) VALUES ($1, $2, 1, true)', [habitId, checkInDate]);
        newCount = 1;
        isCompleted = true;
      }
    }

    // Recalculate streak and score using calculateStreakMetrics
    const { rows: logs } = await pool.query('SELECT check_in_date FROM check_ins WHERE habit_id = $1 AND status = true', [habitId]);
    const checkInDates = logs.map(l => getLocalDateStr(l.check_in_date));
    ({ currentStreak: newStreak, longestStreak: newLongest, score: newScore } = calculateStreakMetrics(habit, checkInDates));

    // Update streak metrics and habit score
    await pool.query(`
      INSERT INTO streaks (user_id, habit_id, current_streak, longest_streak, score, last_check_in_date)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (habit_id) DO UPDATE SET
        current_streak = EXCLUDED.current_streak,
        longest_streak = EXCLUDED.longest_streak,
        score = EXCLUDED.score,
        last_check_in_date = EXCLUDED.last_check_in_date
    `, [userId, habitId, newStreak, newLongest, newScore, checkInDate]);

    await pool.query('UPDATE habits SET score = $1 WHERE id = $2', [newScore, habitId]);

    // Socket notification
    const io = req.app.get('io');
    if (io) {
      let actionText = '';
      if (features.EXPERIMENT_QUANTIFIABLE_HABITS && habit.target_per_day > 1) {
        actionText = isCompleted
          ? `completed daily target for "${habit.title}" (${newCount}/${habit.target_per_day} ${habit.unit || ''})`
          : `logged progress on "${habit.title}" (${newCount}/${habit.target_per_day} ${habit.unit || ''})`;
      } else {
        actionText = isCompleted ? `checked in "${habit.title}"` : `unchecked "${habit.title}"`;
      }
      io.emit('activity_feed', {
        username: req.user.email ? req.user.email.split('@')[0] : 'User',
        action: actionText,
        streak: newStreak,
        score: newScore
      });
    }

    res.json({
      success: true,
      today_count: newCount,
      target_per_day: habit.target_per_day || 1,
      unit: habit.unit || '',
      is_completed_today: isCompleted,
      current_streak: newStreak,
      longest_streak: newLongest,
      score: newScore
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Validate habit definition using Java Core
exports.validateWithJavaCore = async (req, res) => {
  try {
    const validation = await javaBridge.validateHabit(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error,
        errorCode: validation.errorCode,
        exceptionClass: validation.exceptionClass
      });
    }
    res.json({ success: true, ...validation });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Evaluate habit metrics using Java Core offline engine
exports.evaluateWithJavaCore = async (req, res) => {
  const { habitId } = req.params;
  const userId = req.user.id;

  try {
    const { rows } = await pool.query('SELECT * FROM habits WHERE id = $1 AND user_id = $2', [habitId, userId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Habit not found' });
    }
    const habit = rows[0];

    const { rows: logs } = await pool.query('SELECT check_in_date FROM check_ins WHERE habit_id = $1 AND status = true', [habitId]);
    const checkInDates = logs.map(l => getLocalDateStr(l.check_in_date));

    const evalResult = await javaBridge.evaluateHabit(
      {
        name: habit.title,
        current_streak: habit.current_streak,
        longest_streak: habit.longest_streak,
        score: parseFloat(habit.score) || 0.0,
        target_per_day: habit.target_per_day,
        unit: habit.unit,
        frequencyType: habit.frequency_type,
        createdAt: getLocalDateStr(habit.created_at)
      },
      checkInDates
    );

    res.json({ success: true, ...evalResult });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};