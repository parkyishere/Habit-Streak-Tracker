(() => {
  const socket = io("http://localhost:5000");
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
  let cachedHabits = [];

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

  socket.on('activity_feed', (data) => {
    showToast(`${data.username} ${data.action} habit! Current streak: ${data.streak} days`);
  });

  async function loadStats() {
    try {
      const res = await fetch('/api/analytics', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        document.getElementById('stat-habits').innerText = data.stats.totalHabits;
        document.getElementById('stat-checkins').innerText = data.stats.totalCheckIns;
        document.getElementById('stat-max-streak').innerText = `${data.stats.maxStreak} days`;
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }

  async function loadHabits() {
    try {
      const today = new Date().toISOString().split('T')[0];
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

    const habitsToDisplay = currentTab === 'due' ? dueHabits : cachedHabits;

    if (habitsToDisplay.length === 0) {
      if (currentTab === 'due') {
        habitsList.innerHTML = `
          <div class="empty-state">
            <h4>🎉 You're all caught up for today!</h4>
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
      const card = document.createElement('div');
      card.className = `habit-card ${!isDue ? 'off-day' : ''}`;

      const dueBadge = isDue
        ? `<span class="badge due-today">Due Today</span>`
        : `<span class="badge rest-day">Rest Day</span>`;

      const freqLabel = habit.frequency_label || habit.frequency || 'Daily';

      let checkinBtnText = 'Check In Today';
      if (isCompleted) {
        checkinBtnText = 'Uncheck Today';
      } else if (!isDue) {
        checkinBtnText = 'Check In (Rest Day)';
      }

      card.innerHTML = `
        <div class="habit-header">
          <div class="habit-clickable" data-id="${habit.id}">
            <h4>${escapeHtml(habit.title)}</h4>
            <div style="display: flex; gap: 6px; margin-top: 4px; flex-wrap: wrap;">
              ${dueBadge}
              <span class="badge frequency-badge">${escapeHtml(freqLabel)}</span>
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
        <div class="streak-badge">Current Streak: ${habit.current_streak || 0} days | Best: ${habit.longest_streak || 0} days</div>
        <button class="btn ${isCompleted ? 'danger' : 'success'} checkin-btn" data-id="${habit.id}">
          ${checkinBtnText}
        </button>
      `;

      habitsList.appendChild(card);
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

    if (freqType === 'specific_days') {
      const days = Array.isArray(freqValue) ? freqValue : [];
      const dayMap = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
      const normalizedDays = days.map(d => typeof d === 'string' ? (dayMap[d.toLowerCase()] ?? parseInt(d, 10)) : Number(d));
      return normalizedDays.includes(dateObj.getDay());
    }

    if (freqType === 'interval') {
      let interval = 1;
      if (typeof freqValue === 'number') interval = freqValue;
      else if (freqValue && typeof freqValue === 'object') interval = freqValue.interval_days || freqValue.interval || 1;
      if (interval <= 1) return true;

      const anchor = new Date(habit.created_at || dateObj);
      anchor.setHours(0, 0, 0, 0);
      const target = new Date(dateObj);
      target.setHours(0, 0, 0, 0);
      const diffDays = Math.round((target - anchor) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) return false;
      return diffDays % interval === 0;
    }

    return true;
  }

  function renderCalendar(checkInDates, habit = null) {
    const calendarContainer = document.getElementById('github-calendar');
    if (!calendarContainer) return;
    calendarContainer.innerHTML = '';

    const dateSet = new Set();
    if (checkInDates) {
      checkInDates.forEach(d => {
        const s = typeof d === 'string' ? d.split('T')[0] : new Date(d).toISOString().split('T')[0];
        dateSet.add(s);
      });
    }

    const today = new Date();
    const months = [];
    for (let m = 11; m >= 0; m--) {
      months.push(new Date(today.getFullYear(), today.getMonth() - m, 1));
    }

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

    const wrapper = document.createElement('div');
    wrapper.className = 'heatmap-months-wrapper';

    months.forEach(monthDate => {
      const year = monthDate.getFullYear();
      const monthIndex = monthDate.getMonth();

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
        const d = new Date(year, monthIndex, dayNum);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;

        const square = document.createElement('div');
        square.className = 'calendar-day';
        square.setAttribute('data-date', dateStr);

        const isCompleted = dateSet.has(dateStr);
        const isDue = isHabitDueOnDate(habit, d);

        if (isCompleted) {
          square.classList.add('active');
          square.title = `${dateStr}: Completed`;
        } else if (!isDue) {
          square.classList.add('rest-day');
          square.title = `${dateStr}: Rest day`;
        } else {
          square.title = `${dateStr}: No activity`;
        }

        daysGrid.appendChild(square);
      }

      monthBlock.appendChild(daysGrid);
      wrapper.appendChild(monthBlock);
    });

    calendarContainer.appendChild(wrapper);
  }

  async function openInlineHistory(habitId) {
    try {
      const res = await fetch(`/api/habits/${habitId}/history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();

      if (data.success) {
        renderCalendar(data.checkInDates, data.habit);

        document.getElementById('detail-edit-btn').onclick = () => openEditModal(data.habit);
        document.getElementById('detail-delete-btn').onclick = () => deleteHabit(data.habit.id);

        detailSection.setAttribute('data-active-id', habitId);
        detailSection.classList.remove('hidden');
        detailSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    } catch (err) {
      console.error('Error fetching habit history:', err);
    }
  }

  function openEditModal(habit) {
    document.getElementById('edit-habit-id').value = habit.id;
    document.getElementById('edit-habit-title').value = habit.title;
    document.getElementById('edit-habit-desc').value = habit.description || '';

    const freqType = habit.frequency_type || habit.frequency || 'daily';
    const freqSelect = document.getElementById('edit-habit-frequency');
    freqSelect.value = freqType;

    // Reset edit day chips
    document.querySelectorAll('input[name="edit-habit-days"]').forEach(cb => {
      cb.checked = false;
    });

    const daysContainer = document.getElementById('edit-freq-days-container');
    const intervalContainer = document.getElementById('edit-freq-interval-container');

    if (freqType === 'specific_days') {
      daysContainer.classList.remove('hidden');
      intervalContainer.classList.add('hidden');
      const val = Array.isArray(habit.frequency_value) ? habit.frequency_value : [];
      val.forEach(d => {
        const cb = document.querySelector(`input[name="edit-habit-days"][value="${d}"]`);
        if (cb) cb.checked = true;
      });
    } else if (freqType === 'interval') {
      daysContainer.classList.add('hidden');
      intervalContainer.classList.remove('hidden');
      let intervalVal = 2;
      if (typeof habit.frequency_value === 'number') {
        intervalVal = habit.frequency_value;
      } else if (habit.frequency_value && typeof habit.frequency_value === 'object') {
        intervalVal = habit.frequency_value.interval_days || habit.frequency_value.interval || 2;
      }
      document.getElementById('edit-habit-interval-days').value = intervalVal;
    } else {
      daysContainer.classList.add('hidden');
      intervalContainer.classList.add('hidden');
    }

    editModal.classList.remove('hidden');
  }

  async function checkIn(habitId) {
    try {
      const res = await fetch(`/api/habits/${habitId}/checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      const data = await res.json();
      if (res.ok && data.success) {
        await loadHabits();
        await loadStats();

        // Refresh active calendar immediately if open for this habit
        const activeId = detailSection.getAttribute('data-active-id');
        if (!detailSection.classList.contains('hidden') && activeId == habitId) {
          openInlineHistory(habitId);
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
      }
    } catch (err) {
      console.error('Error deleting habit:', err);
    }
  }

  // --- Dynamic Frequency Form Listeners ---
  function setupFrequencySelectToggle(selectId, daysContainerId, intervalContainerId) {
    const selectEl = document.getElementById(selectId);
    const daysEl = document.getElementById(daysContainerId);
    const intervalEl = document.getElementById(intervalContainerId);
    if (!selectEl || !daysEl || !intervalEl) return;

    selectEl.addEventListener('change', () => {
      const val = selectEl.value;
      if (val === 'specific_days') {
        daysEl.classList.remove('hidden');
        intervalEl.classList.add('hidden');
      } else if (val === 'interval') {
        intervalEl.classList.remove('hidden');
        daysEl.classList.add('hidden');
      } else {
        daysEl.classList.add('hidden');
        intervalEl.classList.add('hidden');
      }
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

    if (target.closest('.habit-clickable')) {
      const id = target.closest('.habit-clickable').getAttribute('data-id');
      openInlineHistory(id);
      return;
    }

    if (target.classList.contains('checkin-btn')) {
      const id = target.getAttribute('data-id');
      checkIn(id);
      return;
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

  document.getElementById('close-detail-btn').addEventListener('click', () => detailSection.classList.add('hidden'));
  document.getElementById('close-edit').addEventListener('click', () => editModal.classList.add('hidden'));

  // --- Initial Setup on DOM Ready ---
  document.addEventListener('DOMContentLoaded', () => {
    loadStats();
    loadHabits();

    // Toggle controls for create form and edit modal
    setupFrequencySelectToggle('habit-frequency', 'freq-days-container', 'freq-interval-container');
    setupFrequencySelectToggle('edit-habit-frequency', 'edit-freq-days-container', 'edit-freq-interval-container');

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
        tabAll.classList.add('active');
        tabDue.classList.remove('active');
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
              frequency_value: frequencyValue
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
            document.querySelectorAll('input[name="habit-days"]').forEach(cb => cb.checked = false);

            await loadHabits();
            await loadStats();
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
              frequency_value: frequencyValue
            })
          });

          const data = await res.json();
          if (res.ok && data.success) {
            editModal.classList.add('hidden');
            await loadHabits();
            await loadStats();

            // Refresh active details view if it matches this habit
            const activeId = detailSection.getAttribute('data-active-id');
            if (!detailSection.classList.contains('hidden') && activeId == habitId) {
              openInlineHistory(habitId);
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
  });
})();