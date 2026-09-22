(() => {
  const socket = typeof io !== 'undefined' ? io() : null;
  const token = localStorage.getItem('token');

  if (!token) {
    window.location.href = '/login.html';
    return;
  }

  const habitsList = document.getElementById('habits-list');
  const editModal = document.getElementById('edit-modal');
  const detailSection = document.getElementById('habit-detail-section');

  // Filter tab state
  let currentTab = 'due'; // 'due' | 'all'
  let currentCategoryFilter = 'all'; // 'all' | category name
  let currentSortOption = 'default'; // 'default' | 'score-desc' | 'streak-desc' | 'alpha-asc'
  let cachedHabits = [];
  let cachedCategories = [];
  let cachedTodos = [];
  let currentTodoFilter = 'active'; // 'active' | 'completed' | 'all'
  let currentViewMode = 'habits'; // 'habits' | 'todos' | 'both'
  let appFeatures = {
    EXPERIMENT_WEEKLY_TARGETS: false,
    EXPERIMENT_CATEGORIES_TAGS: false,
    EXPERIMENT_QUANTIFIABLE_HABITS: false,
    EXPERIMENT_KPI_DASHBOARD: true,
    EXPERIMENT_TODOS: true
  };

  async function loadFeatures() {
    try {
      const res = await fetch('/api/features');
      const data = await res.json();
      if (data.success && data.features) {
        appFeatures = data.features;
      }
    } catch (err) {
      console.warn('Could not load feature flags:', err);
    }
    await applyFeatureToggles();
  }

  async function loadWeeklyTargets() {
    try {
      if (appFeatures.EXPERIMENT_WEEKLY_TARGETS) {
        // Weekly targets progress is integrated into habits returned by /api/habits.
        // Re-render if habits are already loaded to update weekly target badges/bars.
        if (cachedHabits && cachedHabits.length > 0) {
          renderHabitsList();
        }
      }
    } catch (err) {
      console.warn('Could not load weekly targets:', err);
    }
  }

  async function loadCategories(force = false) {
    if (!force && cachedCategories && cachedCategories.length > 0) {
      populateCategoryDropdowns();
      return;
    }
    try {
      const res = await fetch('/api/categories', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.categories)) {
        cachedCategories = data.categories;
        populateCategoryDropdowns();
        renderCategoryFilterChips();
      }
    } catch (err) {
      console.warn('Could not load categories:', err);
    }
  }

  function populateCategoryDropdowns() {
    const createSelect = document.getElementById('habit-category');
    const editSelect = document.getElementById('edit-habit-category');

    const updateSelect = (selectEl, defaultPlaceholder) => {
      if (!selectEl) return;
      const currentVal = selectEl.value;
      selectEl.innerHTML = `<option value="">${defaultPlaceholder}</option>`;
      cachedCategories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.innerText = cat.name;
        opt.setAttribute('data-color', cat.color_hex || '#6366F1');
        selectEl.appendChild(opt);
      });
      if (currentVal && cachedCategories.some(c => String(c.id) === String(currentVal))) {
        selectEl.value = currentVal;
      }
    };

    updateSelect(createSelect, '-- Select Category --');
    updateSelect(editSelect, '-- None --');

    // Also populate any other matching category selects in the DOM
    document.querySelectorAll('.cat-select').forEach(sel => {
      if (sel !== createSelect && sel !== editSelect) {
        updateSelect(sel, '-- Select Category --');
      }
    });
  }

  async function openCreateModal() {
    if (!cachedCategories || cachedCategories.length === 0) {
      await loadCategories(true);
    } else {
      populateCategoryDropdowns();
    }
    const createModal = document.getElementById('create-modal') || document.getElementById('new-habit-modal');
    if (createModal) {
      createModal.classList.remove('hidden');
    }
  }

  function renderCategoryFilterChips() {
    const chipsContainer = document.getElementById('category-filter-chips');
    if (!chipsContainer) return;

    chipsContainer.innerHTML = `
      <button type="button" class="cat-menu-item ${currentCategoryFilter === 'all' ? 'active' : ''}" data-category="all" title="All Habits" aria-label="All Habits">
        <span class="cat-chip-dot all-dot"></span> All
      </button>
    `;

    cachedCategories.forEach(cat => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `cat-menu-item ${currentCategoryFilter.toLowerCase() === cat.name.toLowerCase() ? 'active' : ''}`;
      btn.setAttribute('data-category', cat.name);
      btn.innerHTML = `
        <span class="cat-chip-dot" style="background: ${cat.color_hex || '#6366F1'};"></span>
        ${escapeHtml(cat.name)}
      `;
      chipsContainer.appendChild(btn);
    });

    updateFilterSortUI();
  }

  function updateFilterSortUI() {
    const selectedCatText = document.getElementById('selected-category-text');
    if (selectedCatText) {
      selectedCatText.innerText = currentCategoryFilter === 'all' ? 'All' : currentCategoryFilter;
    }

    const selectedSortText = document.getElementById('selected-sort-text');
    if (selectedSortText) {
      const sortLabels = {
        'default': 'Default',
        'score-desc': 'Strength',
        'streak-desc': 'Streak',
        'alpha-asc': 'A to Z'
      };
      selectedSortText.innerText = sortLabels[currentSortOption] || 'Default';
    }

    let activeCount = 0;
    if (currentCategoryFilter !== 'all') activeCount++;
    if (currentSortOption !== 'default') activeCount++;

    const badgeEl = document.getElementById('active-filter-badge');
    const toggleBtn = document.getElementById('filter-sort-toggle-btn');
    if (badgeEl) {
      badgeEl.innerText = activeCount;
      badgeEl.classList.toggle('hidden', activeCount === 0);
    }
    if (toggleBtn) {
      toggleBtn.classList.toggle('active-filter', activeCount > 0);
    }
  }

  function applyFeatureToggles() {
    const selects = ['habit-frequency', 'edit-habit-frequency'];
    selects.forEach(id => {
      const selectEl = document.getElementById(id);
      if (!selectEl) return;
      let opt = selectEl.querySelector('option[value="weekly_target"]');
      if (appFeatures.EXPERIMENT_WEEKLY_TARGETS) {
        if (!opt) {
          opt = document.createElement('option');
          opt.value = 'weekly_target';
          opt.innerText = 'Flexible Weekly Target (X/week)';
          selectEl.appendChild(opt);
        }
      } else {
        if (opt) opt.remove();
      }
    });

    // Quantifiable Habits feature toggle
    const isQuant = Boolean(appFeatures.EXPERIMENT_QUANTIFIABLE_HABITS);
    const quantCreateRow = document.getElementById('quant-create-row');
    const editQuantRow = document.getElementById('edit-quant-row');
    if (quantCreateRow) quantCreateRow.classList.toggle('hidden', !isQuant);
    if (editQuantRow) editQuantRow.classList.toggle('hidden', !isQuant);

    // Categories & Filter/Sort feature toggle
    const isCats = Boolean(appFeatures.EXPERIMENT_CATEGORIES_TAGS);
    const catCreateRow = document.getElementById('category-create-row');
    const editCatRow = document.getElementById('edit-category-row');
    const filterSortContainer = document.getElementById('filter-sort-container');
    if (catCreateRow) catCreateRow.classList.toggle('hidden', !isCats);
    if (editCatRow) editCatRow.classList.toggle('hidden', !isCats);
    if (filterSortContainer) filterSortContainer.classList.toggle('hidden', !isCats);
    if (isCats) {
      loadCategories();
    }

    // Summary KPI Dashboard feature toggle
    const isKpi = appFeatures.EXPERIMENT_KPI_DASHBOARD !== false;
    const kpiContainer = document.getElementById('kpi-summary-container');
    const legacyStats = document.getElementById('stats-grid-legacy');
    if (kpiContainer) kpiContainer.classList.toggle('hidden', !isKpi);
    if (legacyStats) legacyStats.style.display = isKpi ? 'none' : 'grid';
  }

  function showToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = message;

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      toast.addEventListener('transitionend', () => toast.remove());
    }, 3500);
  }

  function getScoreTierInfo(score) {
    const s = Number(score) || 0;
    if (s >= 80) return { tierClass: 'tier-mastered', label: 'Mastered' };
    if (s >= 50) return { tierClass: 'tier-strong', label: 'Strong' };
    if (s >= 25) return { tierClass: 'tier-building', label: 'Building' };
    return { tierClass: 'tier-starting', label: 'Starting' };
  }

  if (socket) {
    socket.on('activity_feed', (data) => {
      const streakText = data.streak !== undefined ? ` Streak: ${data.streak}d.` : '';
      const scoreText = data.score !== undefined ? ` Strength: ${Number(data.score).toFixed(1)}%.` : '';
      showToast(`${data.username} ${data.action} habit!${streakText}${scoreText}`);
    });

    socket.on('todo_activity', (data) => {
      if (data && data.action) {
        if (data.action === 'created') {
          showToast(`${data.username} added task: "${data.title}"`);
        } else if (data.action === 'completed') {
          showToast(`${data.username} completed task: "${data.title}"`);
        }
        loadTodos();
      }
    });
  }

  async function loadStats() {
    try {
      const res = await fetch('/api/analytics', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.stats) {
        const habitsEl = document.getElementById('stat-habits');
        if (habitsEl) habitsEl.innerText = data.stats.totalHabits;
        const checkinsEl = document.getElementById('stat-checkins');
        if (checkinsEl) checkinsEl.innerText = data.stats.totalCheckIns;
        const streakEl = document.getElementById('stat-max-streak');
        if (streakEl) streakEl.innerText = `${data.stats.maxStreak} days`;
        const avgScoreEl = document.getElementById('stat-avg-score');
        if (avgScoreEl) {
          avgScoreEl.innerText = `${(data.stats.avgScore || 0).toFixed(1)}%`;
        }
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }

  async function loadKpiSummary() {
    try {
      const res = await fetch('/api/kpi-summary', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.kpis) {
        renderKpiWidgets(data.kpis);
      }
    } catch (err) {
      console.warn('Failed to load KPI summary:', err);
    }
  }

  function renderKpiWidgets(kpis) {
    if (!kpis) return;

    // 1. Today's Progress
    const completionRateEl = document.getElementById('kpi-completion-rate');
    if (completionRateEl && kpis.today) {
      completionRateEl.innerText = `${kpis.today.completion_rate}%`;
    }
    const completionFractionEl = document.getElementById('kpi-completion-fraction');
    if (completionFractionEl && kpis.today) {
      completionFractionEl.innerText = `${kpis.today.completed} / ${kpis.today.total_due}`;
    }
    const progressBarFill = document.getElementById('kpi-progress-bar-fill');
    if (progressBarFill && kpis.today) {
      progressBarFill.style.width = `${Math.min(100, Math.max(0, kpis.today.completion_rate))}%`;
    }
    const completionNoteEl = document.getElementById('kpi-completion-note');
    if (completionNoteEl && kpis.today) {
      if (kpis.today.total_due === 0) {
        completionNoteEl.innerText = 'No habits scheduled for today';
      } else if (kpis.today.pending === 0) {
        completionNoteEl.innerText = 'All daily habits completed!';
      } else {
        completionNoteEl.innerText = `${kpis.today.pending} habit${kpis.today.pending === 1 ? '' : 's'} pending today`;
      }
    }
    const completionBadgeEl = document.getElementById('kpi-completion-badge');
    if (completionBadgeEl && kpis.today) {
      if (kpis.today.total_due > 0 && kpis.today.pending === 0) {
        completionBadgeEl.innerText = 'Completed';
        completionBadgeEl.className = 'kpi-status-pill pill-completed';
      } else if (kpis.today.total_due === 0) {
        completionBadgeEl.innerText = 'Clear';
        completionBadgeEl.className = 'kpi-status-pill pill-neutral';
      } else {
        completionBadgeEl.innerText = 'In Progress';
        completionBadgeEl.className = 'kpi-status-pill pill-neutral';
      }
    }

    // 2. Active Streaks
    const activeStreaksEl = document.getElementById('kpi-active-streaks');
    if (activeStreaksEl && kpis.streaks) {
      activeStreaksEl.innerText = kpis.streaks.active_count;
    }
    const bestStreakEl = document.getElementById('kpi-best-streak');
    if (bestStreakEl && kpis.streaks) {
      bestStreakEl.innerText = `${kpis.streaks.best_streak}d`;
    }
    const totalStreakDaysEl = document.getElementById('kpi-total-streak-days');
    if (totalStreakDaysEl && kpis.streaks) {
      totalStreakDaysEl.innerText = `${kpis.streaks.total_streak_days}d`;
    }

    // 3. Habit Strength
    const avgScoreEl = document.getElementById('kpi-avg-score');
    if (avgScoreEl && kpis.score) {
      avgScoreEl.innerText = `${(Number(kpis.score.avg_score) || 0).toFixed(1)}%`;
    }
    const scoreTierBadgeEl = document.getElementById('kpi-score-tier-badge');
    if (scoreTierBadgeEl && kpis.score) {
      scoreTierBadgeEl.innerText = kpis.score.tier || 'Starting';
      scoreTierBadgeEl.className = `score-tier-badge ${kpis.score.tier_class || 'tier-starting'}`;
    }
    if (kpis.score && kpis.score.distribution) {
      const dotM = document.getElementById('kpi-dot-mastered');
      if (dotM) dotM.innerText = `${kpis.score.distribution.mastered || 0} M`;
      const dotS = document.getElementById('kpi-dot-strong');
      if (dotS) dotS.innerText = `${kpis.score.distribution.strong || 0} S`;
      const dotB = document.getElementById('kpi-dot-building');
      if (dotB) dotB.innerText = `${kpis.score.distribution.building || 0} B`;
      const dotSt = document.getElementById('kpi-dot-starting');
      if (dotSt) dotSt.innerText = `${kpis.score.distribution.starting || 0} St`;
    }

    // 4. Total Habits & Momentum
    const totalHabitsEl = document.getElementById('kpi-total-habits');
    if (totalHabitsEl && kpis.habits) {
      totalHabitsEl.innerText = kpis.habits.total;
    }
    const totalCheckinsEl = document.getElementById('kpi-total-checkins');
    if (totalCheckinsEl && kpis.habits) {
      totalCheckinsEl.innerText = kpis.habits.total_check_ins;
    }
  }

  function getLocalDateStr(dateInput = new Date()) {
    if (!dateInput) return '';
    if (typeof dateInput === 'string') {
      const match = dateInput.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        return `${match[1]}-${match[2]}-${match[3]}`;
      }
    }
    if (dateInput instanceof Date) {
      const year = dateInput.getFullYear();
      const month = String(dateInput.getMonth() + 1).padStart(2, '0');
      const day = String(dateInput.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function parseLocalDate(dateInput) {
    if (!dateInput) return new Date();
    if (dateInput instanceof Date) {
      return new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate(), 0, 0, 0, 0);
    }
    const match = String(dateInput).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10), 0, 0, 0, 0);
    }
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    }
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  }

  async function loadHabits() {
    try {
      const today = getLocalDateStr(new Date());
      const res = await fetch(`/api/habits?date=${today}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();

      if (data.success) {
        cachedHabits = data.habits || [];
        renderHabitsList();
      }
    } catch (err) {
      console.error('Failed to load habits:', err);
    }
  }

  function renderHabitsList() {
    if (!habitsList) return;
    habitsList.innerHTML = '';

    const dueHabits = cachedHabits.filter(h => h.is_due_today);
    const dueCountEl = document.getElementById('due-count');
    const allCountEl = document.getElementById('all-count');

    if (dueCountEl) dueCountEl.innerText = dueHabits.length;
    if (allCountEl) allCountEl.innerText = cachedHabits.length;

    let habitsToDisplay = currentTab === 'due' ? dueHabits : cachedHabits;

    // 1. Filter by Category
    if (appFeatures.EXPERIMENT_CATEGORIES_TAGS && currentCategoryFilter !== 'all') {
      const filterLower = currentCategoryFilter.toLowerCase();
      habitsToDisplay = habitsToDisplay.filter(h => {
        const catNameMatch = h.category_name && h.category_name.toLowerCase() === filterLower;
        const catIdMatch = String(h.category_id) === String(currentCategoryFilter);
        return catNameMatch || catIdMatch;
      });
    }

    // 2. Sort Habits
    if (currentSortOption === 'score-desc') {
      habitsToDisplay = [...habitsToDisplay].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
    } else if (currentSortOption === 'streak-desc') {
      habitsToDisplay = [...habitsToDisplay].sort((a, b) => (Number(b.current_streak) || 0) - (Number(a.current_streak) || 0));
    } else if (currentSortOption === 'alpha-asc') {
      habitsToDisplay = [...habitsToDisplay].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    }

    if (habitsToDisplay.length === 0) {
      if (appFeatures.EXPERIMENT_CATEGORIES_TAGS && currentCategoryFilter !== 'all') {
        habitsList.innerHTML = `
          <div class="empty-state">
            <h4>No habits found in "${escapeHtml(currentCategoryFilter)}"</h4>
            <p>Select "All" in the Filter &amp; Sort menu to view your full habit list or choose another category filter.</p>
          </div>
        `;
        return;
      }
      if (currentTab === 'due') {
        habitsList.innerHTML = `
          <div class="empty-state">
            <h4>You are all caught up for today!</h4>
            <p>No habits are scheduled due today. Enjoy your rest day or switch to "All Habits" to see your full schedule.</p>
          </div>
        `;
      } else {
        habitsList.innerHTML = `
          <div class="empty-state">
            <h4>No habits created yet</h4>
            <p>Use the form above to add your first daily, weekday, or interval habit.</p>
          </div>
        `;
      }
      return;
    }

    habitsToDisplay.forEach(habit => {
      const isCompleted = Boolean(habit.is_completed_today);
      const isDue = Boolean(habit.is_due_today);
      const isWeekly = habit.frequency_type === 'weekly_target';
      const isQuant = Boolean(appFeatures.EXPERIMENT_QUANTIFIABLE_HABITS) && (habit.target_per_day > 1);
      const todayCount = isQuant ? (habit.today_count || 0) : (isCompleted ? 1 : 0);
      const targetPerDay = isQuant ? habit.target_per_day : 1;
      const unitStr = isQuant && habit.unit ? habit.unit : '';

      const card = document.createElement('div');
      card.className = `habit-card ${!isDue && !isWeekly ? 'off-day' : ''}`;
      card.setAttribute('data-habit-id', habit.id);

      let dueBadge = '';
      if (isDue) {
        dueBadge = `<span class="badge due-today">Due Today</span>`;
      } else if (isWeekly) {
        dueBadge = `<span class="badge rest-day">Target Met</span>`;
      } else {
        dueBadge = `<span class="badge rest-day">Rest Day</span>`;
      }

      let quantBadge = '';
      if (isQuant) {
        quantBadge = `<span class="badge quant-badge">Target: ${targetPerDay} ${escapeHtml(unitStr)}/day</span>`;
      }

      let categoryBadgeHtml = '';
      if (appFeatures.EXPERIMENT_CATEGORIES_TAGS && habit.category_name) {
        const catColor = habit.color_hex || (habit.category_color_hex || '#6366F1');
        const catName = habit.category_name;
        categoryBadgeHtml = `<span class="cat-badge" style="border-color: ${catColor}40; background: ${catColor}18; color: #1e293b;">
          <span class="cat-badge-dot" style="background: ${catColor};"></span>${escapeHtml(catName)}
        </span>`;
      }

      const freqLabel = habit.frequency_label || habit.frequency || 'Daily';
      const freqBadgeClass = isWeekly ? 'badge weekly-target-badge' : 'badge frequency-badge';

      let quantProgressHtml = '';
      if (isQuant) {
        const percent = Math.min(100, Math.round((todayCount / targetPerDay) * 100));
        const goalBadge = isCompleted ? `<span class="quant-goal-met-badge">Target Reached</span>` : '';
        quantProgressHtml = `
          <div class="quant-progress-box">
            <div class="quant-progress-header">
              <span class="quant-progress-label">Daily Progress: ${goalBadge}</span>
              <span class="quant-progress-count">${todayCount} / ${targetPerDay} ${escapeHtml(unitStr)} (${percent}%)</span>
            </div>
            <div class="quant-progress-track" title="${todayCount} of ${targetPerDay} ${escapeHtml(unitStr)} completed today">
              <div class="quant-progress-fill ${isCompleted ? 'completed' : ''}" style="width: ${percent}%"></div>
            </div>
          </div>
        `;
      }

      let actionBtnHtml = '';
      if (!isDue && !isWeekly) {
        actionBtnHtml = `<button class="btn rest-day-btn" disabled>Rest Day</button>`;
      } else if (isQuant) {
        actionBtnHtml = `
          <div class="quant-action-group">
            <button class="btn success quant-inc-btn" data-id="${habit.id}" title="Tap to increment progress (+1)">
              + Log Progress (${todayCount}/${targetPerDay} ${escapeHtml(unitStr)})
            </button>
            <button class="btn secondary quant-dec-btn" data-id="${habit.id}" title="Decrease count (-1)" ${todayCount <= 0 ? 'disabled' : ''}>
              -
            </button>
            <button class="btn text-btn quant-reset-btn" data-id="${habit.id}" title="Reset today's count" ${todayCount <= 0 ? 'disabled' : ''}>
              Reset
            </button>
          </div>
        `;
      } else if (isCompleted) {
        actionBtnHtml = `<button class="btn danger checkin-btn" data-id="${habit.id}">Uncheck Today</button>`;
      } else if (isWeekly && habit.weekly_progress && habit.weekly_progress.target_met) {
        actionBtnHtml = `<button class="btn success checkin-btn" data-id="${habit.id}">+ Bonus Check In</button>`;
      } else {
        actionBtnHtml = `<button class="btn success checkin-btn" data-id="${habit.id}">Check In Today</button>`;
      }

      let weeklyProgressHtml = '';
      if (appFeatures.EXPERIMENT_WEEKLY_TARGETS && isWeekly && habit.weekly_progress) {
        const wp = habit.weekly_progress;
        const goalBadge = wp.target_met ? `<span class="weekly-goal-met-badge">Goal Met</span>` : '';
        weeklyProgressHtml = `
          <div class="weekly-progress-box">
            <div class="weekly-progress-header">
              <span class="weekly-progress-label">Weekly Target: ${goalBadge}</span>
              <span class="weekly-progress-count">${wp.completed} / ${wp.target} days (${wp.percent}%)</span>
            </div>
            <div class="weekly-progress-track" title="${wp.completed} of ${wp.target} days completed this week">
              <div class="weekly-progress-fill" style="width: ${wp.percent}%"></div>
            </div>
          </div>
        `;
      }

      const score = Number(habit.score) || 0;
      const { tierClass, label: tierLabel } = getScoreTierInfo(score);
      const scorePercentStr = score.toFixed(1);
      const streakLabel = isWeekly ? 'Weekly Streak' : 'Current Streak';
      const streakUnit = isWeekly ? 'weeks' : 'days';

      card.innerHTML = `
        <div class="habit-header">
          <div class="habit-clickable" data-id="${habit.id}">
            <h4>${escapeHtml(habit.title)}</h4>
            <div style="display: flex; gap: 6px; margin-top: 4px; flex-wrap: wrap; align-items: center;">
              ${dueBadge}
              ${categoryBadgeHtml}
              ${quantBadge}
              <span class="${freqBadgeClass}">${escapeHtml(freqLabel)}</span>
            </div>
          </div>
          <div class="dropdown">
            <button class="menu-btn" data-id="${habit.id}" aria-label="Habit options">&#8942;</button>
            <div class="dropdown-content hidden" id="dropdown-${habit.id}">
              <button class="edit-btn" data-id="${habit.id}">Edit</button>
              <button class="delete-btn danger-text" data-id="${habit.id}">Delete</button>
            </div>
          </div>
        </div>
        <p class="habit-desc">${escapeHtml(habit.description || 'No description provided')}</p>
        ${quantProgressHtml}
        ${weeklyProgressHtml}
        <div class="streak-badge">${streakLabel}: ${habit.current_streak || 0} ${streakUnit} | Best: ${habit.longest_streak || 0} ${streakUnit}</div>
        <div class="habit-score-container">
          <div class="score-meta">
            <span class="score-label">
              Strength: <strong class="score-num">${scorePercentStr}%</strong>
            </span>
            <span class="score-tier-badge ${tierClass}">${tierLabel}</span>
          </div>
          <div class="score-progress-track" title="Habit Strength: ${scorePercentStr}% (${tierLabel})">
            <div class="score-progress-fill ${tierClass}" style="width: ${Math.max(score, 3)}%"></div>
          </div>
        </div>
        ${actionBtnHtml}
      `;

      habitsList.appendChild(card);

      const activeId = detailSection ? detailSection.getAttribute('data-active-id') : null;
      if (detailSection && !detailSection.classList.contains('hidden') && String(activeId) === String(habit.id)) {
        card.insertAdjacentElement('afterend', detailSection);
      }
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function isHabitDueOnDate(habit, dateObj) {
    if (!habit) return true;
    const freqType = (habit.frequency_type || habit.frequency || 'daily').toLowerCase();
    let freqValue = habit.frequency_value;
    if (typeof freqValue === 'string') {
      try { freqValue = JSON.parse(freqValue); } catch { freqValue = parseInt(freqValue, 10) || freqValue; }
    }

    if (freqType === 'daily') return true;

    const targetDate = parseLocalDate(dateObj);

    if (freqType === 'specific_days') {
      const days = Array.isArray(freqValue) ? freqValue : [];
      const dayMap = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
      const normalizedDays = days.map(d => typeof d === 'string' ? (dayMap[d.toLowerCase()] ?? parseInt(d, 10)) : Number(d));
      return normalizedDays.includes(targetDate.getDay());
    }

    if (freqType === 'interval') {
      let interval = 1;
      if (typeof freqValue === 'number') interval = freqValue;
      else if (freqValue && typeof freqValue === 'object') interval = freqValue.interval_days || freqValue.interval || 1;
      if (interval <= 1) return true;

      const anchor = parseLocalDate(habit.created_at || targetDate);
      const diffMs = targetDate.getTime() - anchor.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays < 0) return false;
      return diffDays % interval === 0;
    }

    return true;
  }

  let activeHistoryData = null;

  function renderCalendar(checkInDates, habit = null, selectedYear = null) {
    const calendarContainer = document.getElementById('github-calendar');
    if (!calendarContainer) return;
    calendarContainer.innerHTML = '';

    const dateSet = new Set();
    if (checkInDates) {
      checkInDates.forEach(d => {
        const s = getLocalDateStr(d);
        if (s) dateSet.add(s);
      });
    }

    const today = new Date();
    const todayStr = getLocalDateStr(today);
    const targetYear = selectedYear ? parseInt(selectedYear, 10) : today.getFullYear();

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

    const wrapper = document.createElement('div');
    wrapper.className = 'heatmap-months-wrapper';

    let createdDateStr = null;
    if (habit && habit.created_at) {
      createdDateStr = getLocalDateStr(habit.created_at);
    }

    for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
      const year = targetYear;

      const monthBlock = document.createElement('div');
      monthBlock.className = 'heatmap-month-block';

      const monthTitle = document.createElement('div');
      monthTitle.className = 'heatmap-month-title';
      monthTitle.innerText = `${monthNames[monthIndex]} ${year}`;
      monthBlock.appendChild(monthTitle);

      const daysHeader = document.createElement('div');
      daysHeader.className = 'heatmap-days-header';
      dayLabels.forEach(lbl => {
        const span = document.createElement('span');
        span.innerText = lbl;
        daysHeader.appendChild(span);
      });
      monthBlock.appendChild(daysHeader);

      const daysGrid = document.createElement('div');
      daysGrid.className = 'heatmap-days-grid';

      const firstDay = new Date(year, monthIndex, 1).getDay();
      for (let pad = 0; pad < firstDay; pad++) {
        const padCell = document.createElement('div');
        padCell.className = 'calendar-day empty-cell';
        daysGrid.appendChild(padCell);
      }

      const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
      for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
        // Construct exact local YYYY-MM-DD date string directly from year, month, and day integers
        const monthStr = String(monthIndex + 1).padStart(2, '0');
        const dayStr = String(dayNum).padStart(2, '0');
        const dateStr = `${year}-${monthStr}-${dayStr}`;

        // Construct local date object explicitly with local integers (0:00:00 local time)
        const cellDate = new Date(year, monthIndex, dayNum, 0, 0, 0, 0);

        const square = document.createElement('div');
        square.className = 'calendar-day';
        square.setAttribute('data-date', dateStr);
        square.dataset.date = dateStr;
        square.innerText = dayNum;

        const isCompleted = dateSet.has(dateStr);
        const isDue = isHabitDueOnDate(habit, cellDate);
        const isPast = dateStr < todayStr;
        const isToday = (dateStr === todayStr);

        if (createdDateStr && dateStr < createdDateStr) {
          square.classList.add('pre-creation');
          square.title = `${dateStr}: Pre-creation`;
        } else if (isCompleted) {
          square.classList.add('active');
          square.title = `${dateStr}: Completed`;
        } else if (!isDue) {
          square.classList.add('rest-day');
          square.title = `${dateStr}: Rest day`;
        } else if (isPast) {
          square.classList.add('missed');
          square.title = `${dateStr}: Missed`;
        } else {
          square.title = `${dateStr}: No activity`;
        }

        if (isToday) {
          square.classList.add('today-cell');
        }

        daysGrid.appendChild(square);
      }

      monthBlock.appendChild(daysGrid);
      wrapper.appendChild(monthBlock);
    }

    calendarContainer.appendChild(wrapper);
  }

  async function toggleInlineHistory(habitId, clickedElement = null) {
    if (detailSection && !detailSection.classList.contains('hidden') && String(detailSection.getAttribute('data-active-id')) === String(habitId)) {
      detailSection.classList.add('hidden');
      detailSection.removeAttribute('data-active-id');
      return;
    }
    await openInlineHistory(habitId, clickedElement);
  }

  async function openInlineHistory(habitId, clickedElement = null) {
    try {
      const res = await fetch(`/api/habits/${habitId}/history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();

      if (data.success) {
        activeHistoryData = data;

        const createdYear = data.habit.created_at ? parseLocalDate(data.habit.created_at).getFullYear() : new Date().getFullYear();
        const currentYear = new Date().getFullYear();

        const yearSelect = document.getElementById('heatmap-year-select');
        let selectedYear = currentYear;

        if (yearSelect) {
          const prevVal = parseInt(yearSelect.value, 10);
          yearSelect.innerHTML = '';
          for (let y = currentYear; y >= createdYear; y--) {
            const opt = document.createElement('option');
            opt.value = y;
            opt.innerText = y;
            yearSelect.appendChild(opt);
          }
          if (prevVal && prevVal >= createdYear && prevVal <= currentYear) {
            selectedYear = prevVal;
          }
          yearSelect.value = selectedYear;
        }

        renderCalendar(data.checkInDates, data.habit, selectedYear);

        const scoreBadge = document.getElementById('detail-habit-score');
        if (scoreBadge) {
          const s = Number(data.score !== undefined ? data.score : (data.habit && data.habit.score) || 0);
          const info = getScoreTierInfo(s);
          scoreBadge.innerText = `Habit Strength: ${s.toFixed(1)}% (${info.label})`;
          scoreBadge.className = `score-tier-badge ${info.tierClass}`;
          scoreBadge.style.display = 'inline-block';
        }

        document.getElementById('detail-edit-btn').onclick = () => openEditModal(data.habit);
        document.getElementById('detail-delete-btn').onclick = () => deleteHabit(data.habit.id);

        detailSection.setAttribute('data-active-id', habitId);

        // Dynamically insert directly after this specific habit's card
        let card = clickedElement ? clickedElement.closest('.habit-card') : null;
        if (!card && habitsList) {
          card = habitsList.querySelector(`.habit-card[data-habit-id="${habitId}"]`);
        }
        if (card) {
          card.insertAdjacentElement('afterend', detailSection);
        }

        const wasHidden = detailSection.classList.contains('hidden');
        detailSection.classList.remove('hidden');
        if (wasHidden) {
          detailSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    } catch (err) {
      console.error('Error fetching habit history:', err);
    }
  }

  async function openEditModal(habit) {
    if (!cachedCategories || cachedCategories.length === 0) {
      await loadCategories(true);
    } else {
      populateCategoryDropdowns();
    }

    document.getElementById('edit-habit-id').value = habit.id;
    document.getElementById('edit-habit-title').value = habit.title;
    document.getElementById('edit-habit-desc').value = habit.description || '';

    const targetPerDayInput = document.getElementById('edit-habit-target-per-day');
    const unitInput = document.getElementById('edit-habit-unit');
    if (targetPerDayInput) targetPerDayInput.value = habit.target_per_day || 1;
    if (unitInput) unitInput.value = habit.unit || '';

    const freqType = habit.frequency_type || habit.frequency || 'daily';
    const freqSelect = document.getElementById('edit-habit-frequency');
    freqSelect.value = freqType;

    // Reset edit day chips
    document.querySelectorAll('input[name="edit-habit-days"]').forEach(cb => {
      cb.checked = false;
    });

    const daysContainer = document.getElementById('edit-freq-days-container');
    const intervalContainer = document.getElementById('edit-freq-interval-container');
    const weeklyContainer = document.getElementById('edit-freq-weekly-container');

    if (daysContainer) daysContainer.classList.add('hidden');
    if (intervalContainer) intervalContainer.classList.add('hidden');
    if (weeklyContainer) weeklyContainer.classList.add('hidden');

    if (freqType === 'specific_days') {
      if (daysContainer) daysContainer.classList.remove('hidden');
      const val = Array.isArray(habit.frequency_value) ? habit.frequency_value : [];
      val.forEach(d => {
        const cb = document.querySelector(`input[name="edit-habit-days"][value="${d}"]`);
        if (cb) cb.checked = true;
      });
    } else if (freqType === 'interval') {
      if (intervalContainer) intervalContainer.classList.remove('hidden');
      let intervalVal = 2;
      if (typeof habit.frequency_value === 'number') {
        intervalVal = habit.frequency_value;
      } else if (habit.frequency_value && typeof habit.frequency_value === 'object') {
        intervalVal = habit.frequency_value.interval_days || habit.frequency_value.interval || 2;
      }
      document.getElementById('edit-habit-interval-days').value = intervalVal;
    } else if (freqType === 'weekly_target') {
      if (weeklyContainer) weeklyContainer.classList.remove('hidden');
      const targetVal = habit.target_per_week || habit.frequency_value || 3;
      const targetInput = document.getElementById('edit-habit-target-per-week');
      if (targetInput) targetInput.value = targetVal;
    }

    if (appFeatures.EXPERIMENT_CATEGORIES_TAGS) {
      const editCatSelect = document.getElementById('edit-habit-category');
      const editColorInput = document.getElementById('edit-habit-color');
      if (editCatSelect) editCatSelect.value = habit.category_id || '';
      if (editColorInput) editColorInput.value = habit.color_hex || (habit.category_color_hex || '#6366F1');
    }

    editModal.classList.remove('hidden');
  }

  async function checkIn(habitId, dateStr = null, action = null) {
    try {
      const effectiveDate = dateStr || getLocalDateStr(new Date());
      const payload = {
        date: effectiveDate
      };
      if (action) {
        payload.action = action;
      }

      const res = await fetch(`/api/habits/${habitId}/checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        await loadHabits();
        await loadStats();
        await loadKpiSummary();

        // Refresh active calendar immediately if open for this habit
        const activeId = detailSection.getAttribute('data-active-id');
        if (!detailSection.classList.contains('hidden') && String(activeId) === String(habitId)) {
          await openInlineHistory(habitId);
        }
      } else {
        showToast(data.error || 'Check-in failed');
        console.error('Check-in failed:', data.error);
      }
    } catch (err) {
      console.error('Check-in error:', err);
    }
  }

  async function deleteHabit(habitId) {
    if (!confirm('Are you sure you want to delete this habit?')) return;
    try {
      const res = await fetch(`/api/habits/${habitId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        detailSection.classList.add('hidden');
        await loadHabits();
        await loadStats();
        await loadKpiSummary();
      }
    } catch (err) {
      console.error('Error deleting habit:', err);
    }
  }

  // --- Dynamic Frequency Form Listeners ---
  function setupFrequencySelectToggle(selectId, daysContainerId, intervalContainerId, weeklyContainerId) {
    const selectEl = document.getElementById(selectId);
    const daysEl = document.getElementById(daysContainerId);
    const intervalEl = document.getElementById(intervalContainerId);
    const weeklyEl = document.getElementById(weeklyContainerId);
    if (!selectEl) return;

    selectEl.addEventListener('change', () => {
      const val = selectEl.value;
      if (daysEl) daysEl.classList.toggle('hidden', val !== 'specific_days');
      if (intervalEl) intervalEl.classList.toggle('hidden', val !== 'interval');
      if (weeklyEl) weeklyEl.classList.toggle('hidden', val !== 'weekly_target');
    });
  }

  // --- Global Event Delegation ---
  document.addEventListener('click', (e) => {
    const target = e.target;

    if (target.classList.contains('menu-btn')) {
      const id = target.getAttribute('data-id');
      const dropdown = document.getElementById(`dropdown-${id}`);
      document.querySelectorAll('.dropdown-content').forEach(d => {
        if (d !== dropdown) d.classList.add('hidden');
      });
      if (dropdown) dropdown.classList.toggle('hidden');
      return;
    }

    if (!target.closest('.dropdown')) {
      document.querySelectorAll('.dropdown-content').forEach(d => d.classList.add('hidden'));
    }

    const clickableEl = target.closest('.habit-clickable');
    if (clickableEl) {
      const id = clickableEl.getAttribute('data-id');
      toggleInlineHistory(id, clickableEl);
      return;
    }

    if (target.classList.contains('checkin-btn')) {
      const id = target.getAttribute('data-id');
      const todayStr = getLocalDateStr(new Date());
      checkIn(id, todayStr);
      return;
    }

    const quantInc = target.closest('.quant-inc-btn');
    if (quantInc) {
      const id = quantInc.getAttribute('data-id');
      const todayStr = getLocalDateStr(new Date());
      checkIn(id, todayStr, 'increment');
      return;
    }

    const quantDec = target.closest('.quant-dec-btn');
    if (quantDec) {
      const id = quantDec.getAttribute('data-id');
      const todayStr = getLocalDateStr(new Date());
      checkIn(id, todayStr, 'decrement');
      return;
    }

    const quantReset = target.closest('.quant-reset-btn');
    if (quantReset) {
      const id = quantReset.getAttribute('data-id');
      const todayStr = getLocalDateStr(new Date());
      checkIn(id, todayStr, 'reset');
      return;
    }

    // Date-Click Logging Disabled: Calendar cells are view-only heatmap visualization.
    // Clicking individual calendar date cells no longer triggers check-in.

    if (!target.closest('#filter-sort-container')) {
      const menu = document.getElementById('filter-sort-menu');
      const btn = document.getElementById('filter-sort-toggle-btn');
      if (menu) menu.classList.add('hidden');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    }

    if (target.classList.contains('delete-btn')) {
      const id = target.getAttribute('data-id');
      deleteHabit(id);
      return;
    }

    if (target.classList.contains('edit-btn')) {
      const id = target.getAttribute('data-id');
      const habit = cachedHabits.find(h => String(h.id) === String(id));
      if (habit) {
        openEditModal(habit);
      }
    }
  });

  const closeDetailBtn = document.getElementById('close-detail-btn');
  if (closeDetailBtn) {
    closeDetailBtn.addEventListener('click', () => {
      if (detailSection) {
        detailSection.classList.add('hidden');
        detailSection.removeAttribute('data-active-id');
      }
    });
  }
  const closeEditBtn = document.getElementById('close-edit');
  if (closeEditBtn) {
    closeEditBtn.addEventListener('click', () => {
      if (editModal) editModal.classList.add('hidden');
    });
  }

  // ==========================================================================
  // To-Do List Operations (Habitica-Style One-Off Tasks)
  // ==========================================================================
  async function loadTodos() {
    try {
      const res = await fetch('/api/todos', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.todos)) {
        cachedTodos = data.todos;
        renderTodoList();
      }
    } catch (err) {
      console.warn('Could not load to-dos:', err);
    }
  }

  function formatDisplayDate(dateStr) {
    if (!dateStr) return '';
    try {
      const parts = String(dateStr).slice(0, 10).split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      }
    } catch (e) {}
    return String(dateStr).slice(0, 10);
  }

  function renderTodoList() {
    const listEl = document.getElementById('todos-list');
    const totalCount = cachedTodos.length;
    const completedCount = cachedTodos.filter(t => t.completed).length;
    const activeCount = totalCount - completedCount;

    // Update count badges
    const activeBadge = document.getElementById('todo-active-count');
    const completedBadge = document.getElementById('todo-completed-count');
    const allBadge = document.getElementById('todo-all-count');
    const navBadge = document.getElementById('todo-nav-badge');
    const summaryEl = document.getElementById('todo-completion-summary');

    if (activeBadge) activeBadge.innerText = activeCount;
    if (completedBadge) completedBadge.innerText = completedCount;
    if (allBadge) allBadge.innerText = totalCount;
    if (navBadge) {
      navBadge.innerText = activeCount;
      navBadge.style.display = activeCount > 0 ? 'inline-block' : 'none';
    }
    if (summaryEl) {
      summaryEl.innerText = `${completedCount} of ${totalCount} completed`;
    }

    if (!listEl) return;
    listEl.innerHTML = '';

    let displayedTodos = cachedTodos;
    if (currentTodoFilter === 'active') {
      displayedTodos = cachedTodos.filter(t => !t.completed);
    } else if (currentTodoFilter === 'completed') {
      displayedTodos = cachedTodos.filter(t => t.completed);
    }

    if (displayedTodos.length === 0) {
      const emptyMessages = {
        active: {
          title: 'No active tasks pending',
          desc: 'All clear. Add a new to-do task above or check back later.'
        },
        completed: {
          title: 'No completed tasks yet',
          desc: 'Check off tasks as you finish them to see them here.'
        },
        all: {
          title: 'No to-do tasks found',
          desc: 'Use the quick add bar above to create your first to-do.'
        }
      };
      const info = emptyMessages[currentTodoFilter] || emptyMessages.all;
      listEl.innerHTML = `
        <div class="todo-empty-state">
          <h4>${info.title}</h4>
          <p>${info.desc}</p>
        </div>
      `;
      return;
    }

    const todayStr = getLocalDateStr(new Date());

    displayedTodos.forEach(todo => {
      const card = document.createElement('div');
      card.className = `todo-item-card ${todo.completed ? 'completed' : ''}`;
      card.setAttribute('data-id', todo.id);

      // Due date badge calculation
      let dueBadgeHtml = '';
      if (todo.due_date) {
        const dueDateStr = getLocalDateStr(todo.due_date);
        if (todo.completed) {
          dueBadgeHtml = `<span class="todo-due-badge todo-due-completed">Completed (${formatDisplayDate(dueDateStr)})</span>`;
        } else if (dueDateStr < todayStr) {
          dueBadgeHtml = `<span class="todo-due-badge todo-due-overdue" title="Overdue">Overdue (${formatDisplayDate(dueDateStr)})</span>`;
        } else if (dueDateStr === todayStr) {
          dueBadgeHtml = `<span class="todo-due-badge todo-due-today" title="Due Today">Due Today</span>`;
        } else {
          dueBadgeHtml = `<span class="todo-due-badge todo-due-upcoming" title="Upcoming">Due ${formatDisplayDate(dueDateStr)}</span>`;
        }
      }

      const descHtml = todo.description && todo.description.trim()
        ? `<p class="todo-description">${escapeHtml(todo.description.trim())}</p>`
        : '';

      card.innerHTML = `
        <button type="button" class="todo-check-btn ${todo.completed ? 'checked' : ''}" data-id="${todo.id}" aria-label="${todo.completed ? 'Mark task as incomplete' : 'Mark task as complete'}" title="${todo.completed ? 'Mark task as incomplete' : 'Mark task as complete'}">
          <svg class="check-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </button>
        <div class="todo-content-col">
          <div class="todo-title-row">
            <span class="todo-title ${todo.completed ? 'completed-text' : ''}">${escapeHtml(todo.title)}</span>
            ${dueBadgeHtml}
          </div>
          ${descHtml}
        </div>
        <div class="todo-actions-col">
          <button type="button" class="todo-edit-btn" data-id="${todo.id}" title="Edit Task" aria-label="Edit Task">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
          </button>
          <button type="button" class="todo-delete-btn" data-id="${todo.id}" title="Delete Task" aria-label="Delete Task">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      `;

      listEl.appendChild(card);
    });
  }

  async function toggleTodoStatus(todoId) {
    const todo = cachedTodos.find(t => String(t.id) === String(todoId));
    if (!todo) return;

    // Optimistic UI toggle
    const prevStatus = todo.completed;
    todo.completed = !prevStatus;
    renderTodoList();

    try {
      const res = await fetch(`/api/todos/${todoId}/toggle`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success && data.todo) {
        Object.assign(todo, data.todo);
        renderTodoList();
        showToast(todo.completed ? `Task "${todo.title}" completed.` : `Task "${todo.title}" moved to active.`);
      } else {
        todo.completed = prevStatus;
        renderTodoList();
        showToast(data.error || 'Failed to update task status');
      }
    } catch (err) {
      console.error('Error toggling todo:', err);
      todo.completed = prevStatus;
      renderTodoList();
      showToast('Network error while toggling task status');
    }
  }

  async function createTodo(title, description = '', dueDate = null) {
    if (!title || !title.trim()) return false;
    try {
      const res = await fetch('/api/todos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description ? description.trim() : '',
          due_date: dueDate || null
        })
      });
      const data = await res.json();
      if (res.ok && data.success && data.todo) {
        cachedTodos.unshift(data.todo);
        renderTodoList();
        showToast(`Task "${data.todo.title}" created!`);
        return true;
      } else {
        alert(data.error || 'Failed to create to-do');
        return false;
      }
    } catch (err) {
      console.error('Error creating todo:', err);
      alert('Network error creating to-do task');
      return false;
    }
  }

  async function updateTodo(todoId, title, description = '', dueDate = null) {
    if (!title || !title.trim()) return false;
    try {
      const res = await fetch(`/api/todos/${todoId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description ? description.trim() : '',
          due_date: dueDate || null
        })
      });
      const data = await res.json();
      if (res.ok && data.success && data.todo) {
        const idx = cachedTodos.findIndex(t => String(t.id) === String(todoId));
        if (idx !== -1) {
          cachedTodos[idx] = data.todo;
        }
        renderTodoList();
        showToast(`Task "${data.todo.title}" updated!`);
        return true;
      } else {
        alert(data.error || 'Failed to update task');
        return false;
      }
    } catch (err) {
      console.error('Error updating todo:', err);
      alert('Network error updating task');
      return false;
    }
  }

  async function deleteTodo(todoId) {
    const todo = cachedTodos.find(t => String(t.id) === String(todoId));
    const title = todo ? todo.title : 'Task';

    try {
      const res = await fetch(`/api/todos/${todoId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        cachedTodos = cachedTodos.filter(t => String(t.id) !== String(todoId));
        renderTodoList();
        showToast(`Task "${title}" deleted.`);
      } else {
        alert(data.error || 'Failed to delete task');
      }
    } catch (err) {
      console.error('Error deleting todo:', err);
      alert('Network error deleting task');
    }
  }

  function openTodoModal(todo = null) {
    const modal = document.getElementById('todo-modal');
    if (!modal) return;

    const modalTitle = document.getElementById('todo-modal-title');
    const idInput = document.getElementById('todo-modal-id');
    const titleInput = document.getElementById('todo-modal-task-title');
    const descInput = document.getElementById('todo-modal-desc');
    const dueInput = document.getElementById('todo-modal-due');

    if (todo) {
      if (modalTitle) modalTitle.innerText = 'Edit To-Do Task';
      if (idInput) idInput.value = todo.id;
      if (titleInput) titleInput.value = todo.title || '';
      if (descInput) descInput.value = todo.description || '';
      if (dueInput) dueInput.value = todo.due_date ? getLocalDateStr(todo.due_date) : '';
    } else {
      if (modalTitle) modalTitle.innerText = 'Create To-Do Task';
      if (idInput) idInput.value = '';
      if (titleInput) titleInput.value = '';
      if (descInput) descInput.value = '';
      if (dueInput) dueInput.value = '';
    }

    modal.classList.remove('hidden');
    if (titleInput) titleInput.focus();
  }

  function closeTodoModal() {
    const modal = document.getElementById('todo-modal');
    if (modal) modal.classList.add('hidden');
  }

  function setViewMode(mode) {
    currentViewMode = mode;
    const btnHabits = document.getElementById('view-tab-habits');
    const btnTodos = document.getElementById('view-tab-todos');
    const btnBoth = document.getElementById('view-tab-both');
    const habitsSection = document.getElementById('habits-section');
    const todosSection = document.getElementById('todos-section');

    if (btnHabits) btnHabits.classList.toggle('active', mode === 'habits');
    if (btnTodos) btnTodos.classList.toggle('active', mode === 'todos');
    if (btnBoth) btnBoth.classList.toggle('active', mode === 'both');

    if (habitsSection) {
      habitsSection.classList.toggle('hidden', mode === 'todos');
    }
    if (todosSection) {
      todosSection.classList.toggle('hidden', mode === 'habits');
    }
  }

  function setupTodoListeners() {
    // Quick add form
    const quickForm = document.getElementById('todo-quick-form');
    if (quickForm) {
      quickForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const titleEl = document.getElementById('todo-quick-title');
        const dueEl = document.getElementById('todo-quick-due');
        const title = titleEl ? titleEl.value.trim() : '';
        const due = dueEl && dueEl.value ? dueEl.value : null;
        if (title) {
          const ok = await createTodo(title, '', due);
          if (ok) {
            if (titleEl) titleEl.value = '';
            if (dueEl) dueEl.value = '';
          }
        }
      });
    }

    // Modal form
    const modalForm = document.getElementById('todo-modal-form');
    if (modalForm) {
      modalForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('todo-modal-id').value;
        const title = document.getElementById('todo-modal-task-title').value.trim();
        const desc = document.getElementById('todo-modal-desc').value.trim();
        const due = document.getElementById('todo-modal-due').value;

        if (!title) return;
        let ok = false;
        if (id) {
          ok = await updateTodo(id, title, desc, due);
        } else {
          ok = await createTodo(title, desc, due);
        }
        if (ok) {
          closeTodoModal();
        }
      });
    }

    // Filter pills
    ['todo-tab-active', 'todo-tab-completed', 'todo-tab-all'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener('click', () => {
          const filter = btn.getAttribute('data-filter') || 'all';
          currentTodoFilter = filter;
          document.querySelectorAll('.todo-pill').forEach(p => p.classList.toggle('active', p === btn));
          renderTodoList();
        });
      }
    });

    // View switch buttons
    const tabHabits = document.getElementById('view-tab-habits');
    const tabTodos = document.getElementById('view-tab-todos');
    const tabBoth = document.getElementById('view-tab-both');
    if (tabHabits) tabHabits.addEventListener('click', () => setViewMode('habits'));
    if (tabTodos) tabTodos.addEventListener('click', () => setViewMode('todos'));
    if (tabBoth) tabBoth.addEventListener('click', () => setViewMode('both'));

    // Modal triggers
    const openTodoBtn = document.getElementById('open-todo-modal-btn');
    if (openTodoBtn) openTodoBtn.addEventListener('click', () => openTodoModal());
    const closeTodoBtn = document.getElementById('close-todo-modal');
    if (closeTodoBtn) closeTodoBtn.addEventListener('click', closeTodoModal);
    const cancelTodoBtn = document.getElementById('cancel-todo-modal-btn');
    if (cancelTodoBtn) cancelTodoBtn.addEventListener('click', closeTodoModal);

    // List delegation
    const todosListEl = document.getElementById('todos-list');
    if (todosListEl) {
      todosListEl.addEventListener('click', (e) => {
        const checkBtn = e.target.closest('.todo-check-btn');
        if (checkBtn) {
          const id = checkBtn.getAttribute('data-id');
          toggleTodoStatus(id);
          return;
        }
        const editBtn = e.target.closest('.todo-edit-btn');
        if (editBtn) {
          const id = editBtn.getAttribute('data-id');
          const todo = cachedTodos.find(t => String(t.id) === String(id));
          if (todo) openTodoModal(todo);
          return;
        }
        const deleteBtn = e.target.closest('.todo-delete-btn');
        if (deleteBtn) {
          const id = deleteBtn.getAttribute('data-id');
          deleteTodo(id);
          return;
        }
      });
    }
  }

  // --- Initial Setup on DOM Ready ---
  async function initDashboard() {
    await loadFeatures();
    await loadCategories();
    await loadStats();
    await loadKpiSummary();
    await loadHabits();
    await loadWeeklyTargets();
    await loadTodos();
    setupTodoListeners();

    // Toggle controls for create form and edit modal
    setupFrequencySelectToggle('habit-frequency', 'freq-days-container', 'freq-interval-container', 'freq-weekly-container');
    setupFrequencySelectToggle('edit-habit-frequency', 'edit-freq-days-container', 'edit-freq-interval-container', 'edit-freq-weekly-container');

    const yearSelect = document.getElementById('heatmap-year-select');
    if (yearSelect) {
      yearSelect.addEventListener('change', () => {
        if (activeHistoryData && activeHistoryData.habit) {
          renderCalendar(activeHistoryData.checkInDates, activeHistoryData.habit, parseInt(yearSelect.value, 10));
        }
      });
    }

    // Tab buttons
    const tabDue = document.getElementById('tab-due');
    const tabAll = document.getElementById('tab-all');

    if (tabDue && tabAll) {
      tabDue.addEventListener('click', () => {
        currentTab = 'due';
        tabDue.classList.add('active');
        tabAll.classList.remove('active');
        renderHabitsList();
      });

      tabAll.addEventListener('click', () => {
        currentTab = 'all';
        currentCategoryFilter = 'all';
        tabAll.classList.add('active');
        tabDue.classList.remove('active');
        renderCategoryFilterChips();
        updateFilterSortUI();
        renderHabitsList();
      });
    }

    // Create Habit Form Handler
    const habitForm = document.getElementById('habit-form');
    if (habitForm) {
      habitForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('habit-title').value.trim();
        const description = document.getElementById('habit-desc').value.trim();
        const frequencyType = document.getElementById('habit-frequency').value;

        let frequencyValue = [];
        let targetPerWeek = 7;

        if (frequencyType === 'specific_days') {
          const checkedDays = Array.from(document.querySelectorAll('input[name="habit-days"]:checked'))
            .map(cb => parseInt(cb.value, 10));
          if (checkedDays.length === 0) {
            alert('Please select at least one active day of the week.');
            return;
          }
          frequencyValue = checkedDays;
        } else if (frequencyType === 'interval') {
          const intervalDays = parseInt(document.getElementById('habit-interval-days').value, 10);
          if (isNaN(intervalDays) || intervalDays < 1) {
            alert('Please enter a valid interval in days (minimum 1).');
            return;
          }
          frequencyValue = intervalDays;
        } else if (frequencyType === 'weekly_target') {
          targetPerWeek = parseInt(document.getElementById('habit-target-per-week').value, 10) || 3;
          frequencyValue = targetPerWeek;
        }

        let targetPerDay = 1;
        let habitUnit = '';
        if (appFeatures.EXPERIMENT_QUANTIFIABLE_HABITS) {
          const tpd = parseInt(document.getElementById('habit-target-per-day').value, 10);
          if (!isNaN(tpd) && tpd >= 1) targetPerDay = tpd;
          habitUnit = document.getElementById('habit-unit').value.trim();
        }

        let categoryId = null;
        let colorHex = '';
        if (appFeatures.EXPERIMENT_CATEGORIES_TAGS) {
          const catSelect = document.getElementById('habit-category');
          if (catSelect && catSelect.value) categoryId = parseInt(catSelect.value, 10);
          const colorEl = document.getElementById('habit-color');
          if (colorEl) colorHex = colorEl.value.trim();
        }

        try {
          const res = await fetch('/api/habits', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
              title,
              description,
              frequency_type: frequencyType,
              frequency_value: frequencyValue,
              target_per_week: targetPerWeek,
              target_per_day: targetPerDay,
              unit: habitUnit,
              category_id: categoryId,
              color_hex: colorHex
            })
          });

          const data = await res.json();
          if (res.ok && data.success) {
            // Reset form
            document.getElementById('habit-title').value = '';
            document.getElementById('habit-desc').value = '';
            document.getElementById('habit-frequency').value = 'daily';
            document.getElementById('freq-days-container').classList.add('hidden');
            document.getElementById('freq-interval-container').classList.add('hidden');
            const weeklyContainer = document.getElementById('freq-weekly-container');
            if (weeklyContainer) weeklyContainer.classList.add('hidden');
            document.querySelectorAll('input[name="habit-days"]').forEach(cb => cb.checked = false);

            const targetPerDayEl = document.getElementById('habit-target-per-day');
            const habitUnitEl = document.getElementById('habit-unit');
            if (targetPerDayEl) targetPerDayEl.value = 1;
            if (habitUnitEl) habitUnitEl.value = '';

            const catSelectEl = document.getElementById('habit-category');
            const colorInputEl = document.getElementById('habit-color');
            if (catSelectEl) catSelectEl.value = '';
            if (colorInputEl) colorInputEl.value = '#6366F1';

            await loadHabits();
            await loadStats();
            await loadKpiSummary();
            showToast(`Habit "${title}" created successfully!`);
          } else {
            alert(data.error || 'Failed to create habit');
          }
        } catch (err) {
          console.error('Error adding habit:', err);
        }
      });
    }

    // Edit Habit Form Handler
    const editHabitForm = document.getElementById('edit-habit-form');
    if (editHabitForm) {
      editHabitForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const habitId = document.getElementById('edit-habit-id').value;
        const title = document.getElementById('edit-habit-title').value.trim();
        const description = document.getElementById('edit-habit-desc').value.trim();
        const frequencyType = document.getElementById('edit-habit-frequency').value;

        let frequencyValue = [];
        let targetPerWeek = 7;

        if (frequencyType === 'specific_days') {
          const checkedDays = Array.from(document.querySelectorAll('input[name="edit-habit-days"]:checked'))
            .map(cb => parseInt(cb.value, 10));
          if (checkedDays.length === 0) {
            alert('Please select at least one active day of the week.');
            return;
          }
          frequencyValue = checkedDays;
        } else if (frequencyType === 'interval') {
          const intervalDays = parseInt(document.getElementById('edit-habit-interval-days').value, 10);
          if (isNaN(intervalDays) || intervalDays < 1) {
            alert('Please enter a valid interval in days (minimum 1).');
            return;
          }
          frequencyValue = intervalDays;
        } else if (frequencyType === 'weekly_target') {
          targetPerWeek = parseInt(document.getElementById('edit-habit-target-per-week').value, 10) || 3;
          frequencyValue = targetPerWeek;
        }

        let editTargetPerDay = 1;
        let editHabitUnit = '';
        if (appFeatures.EXPERIMENT_QUANTIFIABLE_HABITS) {
          const tpd = parseInt(document.getElementById('edit-habit-target-per-day').value, 10);
          if (!isNaN(tpd) && tpd >= 1) editTargetPerDay = tpd;
          editHabitUnit = document.getElementById('edit-habit-unit').value.trim();
        }

        let editCategoryId = null;
        let editColorHex = '';
        if (appFeatures.EXPERIMENT_CATEGORIES_TAGS) {
          const editCatSelect = document.getElementById('edit-habit-category');
          if (editCatSelect && editCatSelect.value) editCategoryId = parseInt(editCatSelect.value, 10);
          const editColorEl = document.getElementById('edit-habit-color');
          if (editColorEl) editColorHex = editColorEl.value.trim();
        }

        try {
          const res = await fetch(`/api/habits/${habitId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
              title,
              description,
              frequency_type: frequencyType,
              frequency_value: frequencyValue,
              target_per_week: targetPerWeek,
              target_per_day: editTargetPerDay,
              unit: editHabitUnit,
              category_id: editCategoryId,
              color_hex: editColorHex
            })
          });

          const data = await res.json();
          if (res.ok && data.success) {
            editModal.classList.add('hidden');
            await loadHabits();
            await loadStats();
            await loadKpiSummary();

            // Refresh active details view if it matches this habit
            const activeId = detailSection.getAttribute('data-active-id');
            if (!detailSection.classList.contains('hidden') && String(activeId) === String(habitId)) {
              await openInlineHistory(habitId);
            }
            showToast(`Habit updated successfully!`);
          } else {
            alert(data.error || 'Failed to update habit');
          }
        } catch (err) {
          console.error('Error updating habit:', err);
        }
      });
    }

    // Filter & Sort Menu Toggle
    const filterSortToggleBtn = document.getElementById('filter-sort-toggle-btn');
    const filterSortMenu = document.getElementById('filter-sort-menu');
    if (filterSortToggleBtn && filterSortMenu) {
      filterSortToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = filterSortMenu.classList.toggle('hidden');
        filterSortToggleBtn.setAttribute('aria-expanded', String(!isHidden));
      });
    }

    // Category options click handler inside menu
    const categoryMenuGrid = document.getElementById('category-filter-chips');
    if (categoryMenuGrid) {
      categoryMenuGrid.addEventListener('click', (e) => {
        const item = e.target.closest('.cat-menu-item');
        if (!item) return;
        currentCategoryFilter = item.getAttribute('data-category') || 'all';
        categoryMenuGrid.querySelectorAll('.cat-menu-item').forEach(c => {
          c.classList.toggle('active', c === item);
        });
        updateFilterSortUI();
        renderHabitsList();
      });
    }

    // Sort options change handler
    const sortMenuOptions = document.getElementById('sort-menu-options');
    if (sortMenuOptions) {
      sortMenuOptions.addEventListener('change', (e) => {
        if (e.target && e.target.name === 'habit-sort') {
          currentSortOption = e.target.value;
          updateFilterSortUI();
          renderHabitsList();
        }
      });
    }

    // Reset Filter & Sort
    const resetFilterSortBtn = document.getElementById('reset-filter-sort-btn');
    if (resetFilterSortBtn) {
      resetFilterSortBtn.addEventListener('click', () => {
        currentCategoryFilter = 'all';
        currentSortOption = 'default';
        const defaultRadio = document.querySelector('input[name="habit-sort"][value="default"]');
        if (defaultRadio) defaultRadio.checked = true;
        renderCategoryFilterChips();
        renderHabitsList();
      });
    }

    // Apply & Close Button
    const applyFilterSortBtn = document.getElementById('apply-filter-sort-btn');
    if (applyFilterSortBtn && filterSortMenu) {
      applyFilterSortBtn.addEventListener('click', () => {
        filterSortMenu.classList.add('hidden');
        if (filterSortToggleBtn) filterSortToggleBtn.setAttribute('aria-expanded', 'false');
      });
    }

    // Category select listeners to sync color picker and lazily ensure categories are populated
    const habitCatSelect = document.getElementById('habit-category');
    if (habitCatSelect) {
      habitCatSelect.addEventListener('focus', async () => {
        if (habitCatSelect.options.length <= 1) {
          await loadCategories(true);
        }
      });
      habitCatSelect.addEventListener('click', async () => {
        if (habitCatSelect.options.length <= 1) {
          await loadCategories(true);
        }
      });
      habitCatSelect.addEventListener('change', () => {
        const selected = habitCatSelect.options[habitCatSelect.selectedIndex];
        const color = selected ? selected.getAttribute('data-color') : null;
        const colorInput = document.getElementById('habit-color');
        if (color && colorInput) colorInput.value = color;
      });
    }

    const editCatSelect = document.getElementById('edit-habit-category');
    if (editCatSelect) {
      editCatSelect.addEventListener('focus', async () => {
        if (editCatSelect.options.length <= 1) {
          await loadCategories(true);
        }
      });
      editCatSelect.addEventListener('click', async () => {
        if (editCatSelect.options.length <= 1) {
          await loadCategories(true);
        }
      });
      editCatSelect.addEventListener('change', () => {
        const selected = editCatSelect.options[editCatSelect.selectedIndex];
        const color = selected ? selected.getAttribute('data-color') : null;
        const colorInput = document.getElementById('edit-habit-color');
        if (color && colorInput) colorInput.value = color;
      });
    }

    // Attach openCreateModal to any modal open trigger buttons if present
    document.querySelectorAll('#open-create-modal, #new-habit-btn, #create-habit-btn, .open-create-modal').forEach(btn => {
      btn.addEventListener('click', openCreateModal);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboard);
  } else {
    initDashboard();
  }

  // Globally expose helpers for external callers, tests, and triggers
  window.loadWeeklyTargets = loadWeeklyTargets;
  window.loadCategories = loadCategories;
  window.openCreateModal = openCreateModal;
  window.populateCategoryDropdowns = populateCategoryDropdowns;
  window.loadKpiSummary = loadKpiSummary;
  window.renderKpiWidgets = renderKpiWidgets;
  window.loadTodos = loadTodos;
  window.renderTodoList = renderTodoList;
  window.toggleTodoStatus = toggleTodoStatus;
  window.createTodo = createTodo;
  window.updateTodo = updateTodo;
  window.deleteTodo = deleteTodo;
  window.openTodoModal = openTodoModal;
  window.closeTodoModal = closeTodoModal;
  window.setViewMode = setViewMode;
})();