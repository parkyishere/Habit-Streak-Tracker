const pool = require('../config/db');

/**
 * Controller for To-Do List (One-off Tasks)
 * Habitica-style isolated task management.
 */

// 1. Get all todos for authenticated user
exports.getTodos = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, filter } = req.query;

    let query = 'SELECT * FROM todos WHERE user_id = $1';
    const params = [userId];

    const activeFilter = filter || status;
    if (activeFilter === 'completed') {
      query += ' AND completed = TRUE';
    } else if (activeFilter === 'active' || activeFilter === 'pending') {
      query += ' AND completed = FALSE';
    }

    query += ' ORDER BY completed ASC, due_date ASC NULLS LAST, created_at DESC';

    const { rows: todos } = await pool.query(query, params);
    return res.json({ success: true, todos });
  } catch (err) {
    console.error('Error in getTodos:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve to-dos' });
  }
};

// 2. Create new todo
exports.createTodo = async (req, res) => {
  try {
    const userId = req.user.id;
    const { title, description, due_date, completed } = req.body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ success: false, error: 'Title is required' });
    }

    const cleanTitle = title.trim();
    const cleanDesc = description && typeof description === 'string' ? description.trim() : (description || '');
    const cleanDueDate = due_date && String(due_date).trim() ? String(due_date).trim() : null;
    const isCompleted = Boolean(completed);

    const { rows } = await pool.query(
      `INSERT INTO todos (user_id, title, description, due_date, completed)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, cleanTitle, cleanDesc, cleanDueDate, isCompleted]
    );

    const todo = rows[0];

    // Real-time socket emission if available
    const io = req.app.get('io');
    if (io) {
      io.emit('todo_activity', {
        action: 'created',
        todoId: todo.id,
        title: todo.title,
        username: req.user.username || 'User'
      });
    }

    return res.status(201).json({ success: true, todo });
  } catch (err) {
    console.error('Error in createTodo:', err);
    return res.status(500).json({ success: false, error: 'Failed to create to-do' });
  }
};

// 3. Update todo (PUT / PATCH)
exports.updateTodo = async (req, res) => {
  try {
    const userId = req.user.id;
    const todoId = parseInt(req.params.id, 10);

    if (isNaN(todoId)) {
      return res.status(400).json({ success: false, error: 'Invalid to-do ID' });
    }

    const { rows: existingRows } = await pool.query(
      'SELECT * FROM todos WHERE id = $1 AND user_id = $2',
      [todoId, userId]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({ success: false, error: 'To-do not found' });
    }

    const current = existingRows[0];
    const { title, description, due_date, completed } = req.body;

    if (title !== undefined && (!title || typeof title !== 'string' || !title.trim())) {
      return res.status(400).json({ success: false, error: 'Title cannot be empty' });
    }

    const newTitle = title !== undefined ? title.trim() : current.title;
    const newDesc = description !== undefined ? (description || '') : current.description;
    const newDueDate = due_date !== undefined ? (due_date && String(due_date).trim() ? String(due_date).trim() : null) : current.due_date;
    const newCompleted = completed !== undefined ? Boolean(completed) : current.completed;

    const { rows: updatedRows } = await pool.query(
      `UPDATE todos
       SET title = $1, description = $2, due_date = $3, completed = $4
       WHERE id = $5 AND user_id = $6
       RETURNING *`,
      [newTitle, newDesc, newDueDate, newCompleted, todoId, userId]
    );

    return res.json({ success: true, todo: updatedRows[0] });
  } catch (err) {
    console.error('Error in updateTodo:', err);
    return res.status(500).json({ success: false, error: 'Failed to update to-do' });
  }
};

// 4. Toggle completion status
exports.toggleTodo = async (req, res) => {
  try {
    const userId = req.user.id;
    const todoId = parseInt(req.params.id, 10);

    if (isNaN(todoId)) {
      return res.status(400).json({ success: false, error: 'Invalid to-do ID' });
    }

    const { rows } = await pool.query(
      `UPDATE todos
       SET completed = NOT completed
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [todoId, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'To-do not found' });
    }

    const todo = rows[0];

    const io = req.app.get('io');
    if (io) {
      io.emit('todo_activity', {
        action: todo.completed ? 'completed' : 'uncompleted',
        todoId: todo.id,
        title: todo.title,
        username: req.user.username || 'User'
      });
    }

    return res.json({ success: true, todo });
  } catch (err) {
    console.error('Error in toggleTodo:', err);
    return res.status(500).json({ success: false, error: 'Failed to toggle to-do' });
  }
};

// 5. Delete todo
exports.deleteTodo = async (req, res) => {
  try {
    const userId = req.user.id;
    const todoId = parseInt(req.params.id, 10);

    if (isNaN(todoId)) {
      return res.status(400).json({ success: false, error: 'Invalid to-do ID' });
    }

    const { rows } = await pool.query(
      'DELETE FROM todos WHERE id = $1 AND user_id = $2 RETURNING *',
      [todoId, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'To-do not found' });
    }

    return res.json({ success: true, message: 'To-do deleted successfully', todo: rows[0] });
  } catch (err) {
    console.error('Error in deleteTodo:', err);
    return res.status(500).json({ success: false, error: 'Failed to delete to-do' });
  }
};
