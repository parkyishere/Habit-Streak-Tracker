const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

async function runDashboardFrontendTests() {
  console.log('\n[START] Starting Dashboard Frontend Tests...\n');

  // Read html and js
  const htmlContent = fs.readFileSync(path.join(__dirname, 'public', 'dashboard.html'), 'utf-8');
  const jsContent = fs.readFileSync(path.join(__dirname, 'public', 'js', 'dashboard.js'), 'utf-8');

  // Minimal DOM Mocking
  class ElementMock {
    constructor(tagName, id = '', className = '') {
      this.tagName = tagName.toUpperCase();
      this.id = id;
      this.className = className;
      this.classList = {
        _classes: new Set(className ? className.split(/\s+/).filter(Boolean) : []),
        add: (...cls) => cls.forEach(c => this.classList._classes.add(c)),
        remove: (...cls) => cls.forEach(c => this.classList._classes.delete(c)),
        toggle: (c, force) => {
          if (force !== undefined) {
            if (force) this.classList._classes.add(c);
            else this.classList._classes.delete(c);
            return force;
          }
          if (this.classList._classes.has(c)) {
            this.classList._classes.delete(c);
            return false;
          } else {
            this.classList._classes.add(c);
            return true;
          }
        },
        contains: (c) => this.classList._classes.has(c)
      };
      this.children = [];
      this.options = [];
      this.selectedIndex = 0;
      this._value = '';
      this.innerText = '';
      this._innerHTML = '';
      this.attributes = {};
      this.listeners = {};
      this.style = {};
    }

    get value() {
      if (this.tagName === 'SELECT') {
        if (this.options.length === 0) return '';
        const opt = this.options[this.selectedIndex] || this.options.find(o => o.selected) || this.options[0];
        return opt ? opt.value : this._value;
      }
      return this._value;
    }

    set value(val) {
      this._value = String(val);
      if (this.tagName === 'SELECT') {
        let foundIdx = -1;
        this.options.forEach((opt, idx) => {
          if (String(opt.value) === String(val)) {
            opt.selected = true;
            foundIdx = idx;
          } else {
            opt.selected = false;
          }
        });
        if (foundIdx !== -1) {
          this.selectedIndex = foundIdx;
        }
      }
    }

    get innerHTML() {
      return this._innerHTML;
    }

    set innerHTML(html) {
      this._innerHTML = html;
      this.children = [];
      this.options = [];
      // Simple option parser for select innerHTML updates
      if (this.tagName === 'SELECT') {
        const optionRegex = /<option\s+value="([^"]*)"[^>]*>(.*?)<\/option>/gi;
        let match;
        while ((match = optionRegex.exec(html)) !== null) {
          const opt = new ElementMock('option');
          opt.value = match[1];
          opt.innerText = match[2];
          this.options.push(opt);
          this.children.push(opt);
        }
      }
    }

    appendChild(child) {
      this.children.push(child);
      if (this.tagName === 'SELECT' && child.tagName === 'OPTION') {
        this.options.push(child);
      }
      return child;
    }

    setAttribute(name, val) {
      this.attributes[name] = String(val);
    }

    getAttribute(name) {
      return this.attributes[name] !== undefined ? this.attributes[name] : null;
    }

    removeAttribute(name) {
      delete this.attributes[name];
    }

    addEventListener(event, callback) {
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event].push(callback);
    }

    async dispatchEvent(event, data = {}) {
      const list = this.listeners[event] || [];
      for (const cb of list) {
        await cb(data);
      }
    }

    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    }

    querySelectorAll(selector) {
      const results = [];
      const traverse = (node) => {
        for (const child of node.children) {
          if (selector.startsWith('.') && child.classList.contains(selector.slice(1))) {
            results.push(child);
          } else if (selector.startsWith('#') && child.id === selector.slice(1)) {
            results.push(child);
          } else if (child.tagName.toLowerCase() === selector.toLowerCase()) {
            results.push(child);
          }
          traverse(child);
        }
      };
      traverse(this);
      return results;
    }

    closest(sel) {
      let cur = this;
      while (cur) {
        if (sel.startsWith('.') && cur.classList && cur.classList.contains(sel.slice(1))) return cur;
        if (sel.startsWith('#') && cur.id === sel.slice(1)) return cur;
        cur = cur.parentElement;
      }
      return null;
    }
  }

  // Build simulated document elements
  const elementsById = {
    'habits-list': new ElementMock('div', 'habits-list'),
    'edit-modal': new ElementMock('div', 'edit-modal', 'modal hidden'),
    'habit-detail-section': new ElementMock('div', 'habit-detail-section', 'card hidden'),
    'habit-form': new ElementMock('form', 'habit-form'),
    'habit-title': new ElementMock('input', 'habit-title'),
    'habit-desc': new ElementMock('input', 'habit-desc'),
    'habit-frequency': new ElementMock('select', 'habit-frequency'),
    'habit-category': new ElementMock('select', 'habit-category', 'input cat-select'),
    'edit-habit-category': new ElementMock('select', 'edit-habit-category', 'input cat-select'),
    'habit-color': new ElementMock('input', 'habit-color'),
    'edit-habit-color': new ElementMock('input', 'edit-habit-color'),
    'edit-habit-id': new ElementMock('input', 'edit-habit-id'),
    'edit-habit-title': new ElementMock('input', 'edit-habit-title'),
    'edit-habit-desc': new ElementMock('input', 'edit-habit-desc'),
    'edit-habit-frequency': new ElementMock('select', 'edit-habit-frequency'),
    'tab-due': new ElementMock('button', 'tab-due', 'tab-btn active'),
    'tab-all': new ElementMock('button', 'tab-all', 'tab-btn'),
    'due-count': new ElementMock('span', 'due-count', 'tab-badge'),
    'all-count': new ElementMock('span', 'all-count', 'tab-badge'),
    'filter-sort-container': new ElementMock('div', 'filter-sort-container', 'filter-sort-container hidden'),
    'filter-sort-menu': new ElementMock('div', 'filter-sort-menu', 'filter-sort-menu hidden'),
    'filter-sort-toggle-btn': new ElementMock('button', 'filter-sort-toggle-btn', 'filter-sort-btn'),
    'category-filter-chips': new ElementMock('div', 'category-filter-chips', 'category-menu-grid'),
    'category-create-row': new ElementMock('div', 'category-create-row', 'category-form-row'),
    'edit-category-row': new ElementMock('div', 'edit-category-row', 'category-form-row'),
    'toast-container': new ElementMock('div', 'toast-container', 'toast-container'),
    'close-edit': new ElementMock('span', 'close-edit'),
    'close-detail-btn': new ElementMock('button', 'close-detail-btn'),
    'detail-edit-btn': new ElementMock('button', 'detail-edit-btn'),
    'detail-delete-btn': new ElementMock('button', 'detail-delete-btn'),
    'github-calendar': new ElementMock('div', 'github-calendar'),
    'stat-habits': new ElementMock('p', 'stat-habits'),
    'stat-checkins': new ElementMock('p', 'stat-checkins'),
    'stat-max-streak': new ElementMock('p', 'stat-max-streak'),
    'stat-avg-score': new ElementMock('p', 'stat-avg-score')
  };

  const documentMock = {
    readyState: 'loading',
    addEventListener: (event, cb) => {
      if (!documentMock._listeners[event]) documentMock._listeners[event] = [];
      documentMock._listeners[event].push(cb);
    },
    _listeners: {},
    getElementById: (id) => elementsById[id] || null,
    createElement: (tag) => new ElementMock(tag),
    querySelectorAll: (sel) => {
      const matches = [];
      for (const el of Object.values(elementsById)) {
        if (sel.startsWith('.') && el.classList.contains(sel.slice(1))) matches.push(el);
        if (sel.startsWith('#') && el.id === sel.slice(1)) matches.push(el);
      }
      return matches;
    }
  };

  const mockCategories = [
    { id: 1, name: 'Work', color_hex: '#3B82F6', icon_name: 'briefcase' },
    { id: 2, name: 'Health', color_hex: '#10B981', icon_name: 'heart' },
    { id: 3, name: 'Code', color_hex: '#6366F1', icon_name: 'code' }
  ];

  const mockHabits = [
    { id: 101, title: 'Drink Water', is_due_today: true, is_completed_today: false, frequency_type: 'daily', category_id: 2, category_name: 'Health', current_streak: 3, score: 30 },
    { id: 102, title: 'Read Docs', is_due_today: false, is_completed_today: false, frequency_type: 'specific_days', category_id: 1, category_name: 'Work', current_streak: 5, score: 50 },
    { id: 103, title: 'Weekly Exercise', is_due_today: true, is_completed_today: false, frequency_type: 'weekly_target', target_per_week: 3, weekly_progress: { current_days: 1, target_days: 3 }, current_streak: 2, score: 20 }
  ];

  const windowMock = {
    location: { href: 'http://localhost:5000/dashboard.html' },
    localStorage: {
      getItem: (k) => k === 'token' ? 'mock_jwt_token' : null,
      setItem: () => {},
      removeItem: () => {}
    },
    fetch: async (url, opts = {}) => {
      if (url === '/api/features') {
        return {
          ok: true,
          json: async () => ({
            success: true,
            features: {
              EXPERIMENT_WEEKLY_TARGETS: true,
              EXPERIMENT_CATEGORIES_TAGS: true,
              EXPERIMENT_QUANTIFIABLE_HABITS: true
            }
          })
        };
      }
      if (url === '/api/categories') {
        return {
          ok: true,
          json: async () => ({ success: true, categories: mockCategories })
        };
      }
      if (url.startsWith('/api/habits')) {
        return {
          ok: true,
          json: async () => ({ success: true, habits: mockHabits })
        };
      }
      if (url === '/api/analytics') {
        return {
          ok: true,
          json: async () => ({
            success: true,
            stats: { totalHabits: 3, totalCheckIns: 10, maxStreak: 5, avgScore: 33.3 }
          })
        };
      }
      return { ok: true, json: async () => ({ success: true }) };
    }
  };

  // Run script in context
  const sandbox = {
    window: windowMock,
    document: documentMock,
    localStorage: windowMock.localStorage,
    fetch: windowMock.fetch,
    console,
    setTimeout: (fn) => fn(),
    parseInt,
    parseFloat,
    Boolean,
    Array,
    Object,
    String,
    Number,
    Date,
    io: () => ({ on: () => {}, emit: () => {} }),
    escapeHtml: (s) => String(s)
  };

  vm.createContext(sandbox);
  vm.runInContext(jsContent, sandbox);

  // Trigger DOMContentLoaded
  console.log('Test 1: Initializing DOMContentLoaded without ReferenceError');
  const domListeners = documentMock._listeners['DOMContentLoaded'] || [];
  assert.ok(domListeners.length > 0, 'DOMContentLoaded listener should be registered');
  
  // Await the DOM ready callback
  for (const listener of domListeners) {
    await listener();
  }
  console.log('  [PASS] Passed: DOMContentLoaded executed cleanly without crashing');

  // Test 1b: loadWeeklyTargets is defined and callable
  console.log('\nTest 2: loadWeeklyTargets Reference & Execution');
  assert.strictEqual(typeof sandbox.window.loadWeeklyTargets, 'function', 'loadWeeklyTargets must be a defined function');
  await sandbox.window.loadWeeklyTargets();
  console.log('  [PASS] Passed: loadWeeklyTargets exists and executed without throwing');

  // Test 2: Category dropdowns are populated from /api/categories
  console.log('\nTest 3: Category Select Dropdowns Population');
  const habitCatSelect = elementsById['habit-category'];
  const editCatSelect = elementsById['edit-habit-category'];
  assert.ok(habitCatSelect.options.length >= 4, 'habit-category select must have placeholder + 3 categories');
  assert.ok(editCatSelect.options.length >= 4, 'edit-habit-category select must have placeholder + 3 categories');
  
  const habitCatValues = habitCatSelect.options.map(o => o.value);
  assert.ok(habitCatValues.includes('1'), 'habit-category must include category id 1 (Work)');
  assert.ok(habitCatValues.includes('2'), 'habit-category must include category id 2 (Health)');
  assert.ok(habitCatValues.includes('3'), 'habit-category must include category id 3 (Code)');
  console.log('  [PASS] Passed: Both create and edit category dropdowns populated with backend categories');

  // Test 2b: openCreateModal populates categories
  console.log('\nTest 4: openCreateModal Functionality');
  assert.strictEqual(typeof sandbox.window.openCreateModal, 'function', 'openCreateModal must be defined');
  await sandbox.window.openCreateModal();
  assert.ok(habitCatSelect.options.length >= 4, 'openCreateModal ensures category options populated');
  console.log('  [PASS] Passed: openCreateModal populates categories correctly');

  // Test 3: "All Habits" button interactivity and unfiltered view
  console.log('\nTest 5: "All Habits" Button Interactivity & Unfiltered Habit View');
  const tabAll = elementsById['tab-all'];
  const tabDue = elementsById['tab-due'];
  assert.ok(tabAll.listeners['click'] && tabAll.listeners['click'].length > 0, 'tab-all must have click listener attached');
  
  // Initially, currentTab is 'due'
  assert.strictEqual(tabDue.classList.contains('active'), true, 'Due Today tab should be active initially');
  
  // Click "All Habits" tab
  await tabAll.dispatchEvent('click');
  assert.strictEqual(tabAll.classList.contains('active'), true, 'All Habits tab must become active');
  assert.strictEqual(tabDue.classList.contains('active'), false, 'Due Today tab must become inactive');
  
  // Habits list must render all 3 habits (unfiltered)
  const habitsList = elementsById['habits-list'];
  assert.strictEqual(habitsList.children.length, 3, 'Habits grid must display all 3 habits in unfiltered view');
  console.log('  [PASS] Passed: "All Habits" button triggered unfiltered view with all 3 habits rendered');

  console.log('\n[SUCCESS] ALL DASHBOARD FRONTEND TESTS PASSED SUCCESSFULLY!\n');
}

runDashboardFrontendTests().catch(err => {
  console.error('[FAIL] Test failed:', err);
  process.exit(1);
});
