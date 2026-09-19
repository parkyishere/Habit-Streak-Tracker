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
      const res = await fetch('/api/habits', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();

      if (data.success) {
        habitsList.innerHTML = '';
        if (data.habits.length === 0) {
          habitsList.innerHTML = '<p class="empty-state">No habits created yet. Add one above!</p>';
          return;
        }

        data.habits.forEach(habit => {
          const isCheckedToday = habit.current_streak > 0;
          const card = document.createElement('div');
          card.className = 'habit-card';
          card.innerHTML = `
            <div class="habit-header">
              <div class="habit-clickable" data-id="${habit.id}">
                <h4>${habit.title}</h4>
                <span class="badge">${habit.frequency || 'daily'}</span>
              </div>
              <div class="dropdown">
                <button class="menu-btn" data-id="${habit.id}">&#8942;</button>
                <div class="dropdown-content hidden" id="dropdown-${habit.id}">
                  <button class="edit-btn" data-id="${habit.id}" data-title="${habit.title}" data-desc="${habit.description || ''}" data-freq="${habit.frequency || 'daily'}">Edit</button>
                  <button class="delete-btn danger-text" data-id="${habit.id}">Delete</button>
                </div>
              </div>
            </div>
            <p class="habit-desc">${habit.description || 'No description provided'}</p>
            <div class="streak-badge">Current Streak: ${habit.current_streak || 0} days | Best: ${habit.longest_streak || 0} days</div>
            <button class="btn ${isCheckedToday ? 'danger' : 'success'} checkin-btn" data-id="${habit.id}">
              ${isCheckedToday ? 'Uncheck Today' : 'Check In Today'}
            </button>
          `;

          habitsList.appendChild(card);
        });
      }
    } catch (err) {
      console.error('Failed to load habits:', err);
    }
  }

  function renderCalendar(checkInDates) {
    const calendarContainer = document.getElementById('github-calendar');
    calendarContainer.innerHTML = '';
    const dateSet = new Set(checkInDates);

    const today = new Date();
    for (let i = 364; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];

      const square = document.createElement('div');
      square.className = 'calendar-day';
      square.title = `${dateStr}: ${dateSet.has(dateStr) ? 'Completed' : 'No activity'}`;

      if (dateSet.has(dateStr)) {
        square.classList.add('active');
      }

      calendarContainer.appendChild(square);
    }
  }

  async function openInlineHistory(habitId) {
    try {
      const res = await fetch(`/api/habits/${habitId}/history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();

      if (data.success) {
        document.getElementById('detail-title').innerText = data.habit.title;
        document.getElementById('detail-desc').innerText = data.habit.description || 'No description provided';
        document.getElementById('detail-frequency').innerText = data.habit.frequency || 'daily';

        renderCalendar(data.checkInDates);

        document.getElementById('detail-edit-btn').onclick = () => {
          document.getElementById('edit-habit-id').value = data.habit.id;
          document.getElementById('edit-habit-title').value = data.habit.title;
          document.getElementById('edit-habit-desc').value = data.habit.description || '';
          document.getElementById('edit-habit-frequency').value = data.habit.frequency || 'daily';
          editModal.classList.remove('hidden');
        };

        document.getElementById('detail-delete-btn').onclick = () => deleteHabit(data.habit.id);

        detailSection.setAttribute('data-active-id', habitId);
        detailSection.classList.remove('hidden');
        detailSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    } catch (err) {
      console.error('Error fetching habit history:', err);
    }
  }

  async function checkIn(habitId) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch(`/api/habits/${habitId}/checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ date: today })
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

  document.addEventListener('click', (e) => {
    const target = e.target;

    if (target.classList.contains('menu-btn')) {
      const id = target.getAttribute('data-id');
      const dropdown = document.getElementById(`dropdown-${id}`);
      document.querySelectorAll('.dropdown-content').forEach(d => {
        if (d !== dropdown) d.classList.add('hidden');
      });
      dropdown.classList.toggle('hidden');
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
      document.getElementById('edit-habit-id').value = target.getAttribute('data-id');
      document.getElementById('edit-habit-title').value = target.getAttribute('data-title');
      document.getElementById('edit-habit-desc').value = target.getAttribute('data-desc');
      document.getElementById('edit-habit-frequency').value = target.getAttribute('data-freq');
      editModal.classList.remove('hidden');
    }
  });

  document.getElementById('close-detail-btn').addEventListener('click', () => detailSection.classList.add('hidden'));
  document.getElementById('close-edit').addEventListener('click', () => editModal.classList.add('hidden'));

  document.addEventListener('DOMContentLoaded', () => {
    loadStats();
    loadHabits();

    document.getElementById('habit-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('habit-title').value.trim();
      const description = document.getElementById('habit-desc').value.trim();
      const frequency = document.getElementById('habit-frequency').value;

      try {
        const res = await fetch('/api/habits', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ title, description, frequency })
        });

        const data = await res.json();
        if (data.success) {
          document.getElementById('habit-title').value = '';
          document.getElementById('habit-desc').value = '';
          await loadHabits();
          await loadStats();
        }
      } catch (err) {
        console.error('Error adding habit:', err);
      }
    });

    document.addEventListener('DOMContentLoaded', () => {
  loadStats();
  loadHabits();

  const habitForm = document.getElementById('habit-form');
  if (habitForm) {
    habitForm.addEventListener('submit', async (e) => {
      e.preventDefault(); // Stop default form refresh
      
      const titleInput = document.getElementById('habit-title');
      const descInput = document.getElementById('habit-desc');
      const freqInput = document.getElementById('habit-frequency');

      const title = titleInput ? titleInput.value.trim() : '';
      const description = descInput ? descInput.value.trim() : '';
      const frequency = freqInput ? freqInput.value : 'daily';

      if (!title) {
        alert('Please enter a habit title');
        return;
      }

      try {
        const res = await fetch(`${API_URL}/api/habits`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ title, description, frequency })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          if (titleInput) titleInput.value = '';
          if (descInput) descInput.value = '';
          await loadHabits();
          await loadStats();
        } else {
          console.error('Failed to create habit:', data.error);
        }
      } catch (err) {
        console.error('Error adding habit:', err);
      }
    });
  }
});
  });
})();