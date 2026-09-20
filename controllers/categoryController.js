const pool = require('../config/db');
const features = require('../config/features');

// Get all categories
exports.getCategories = async (req, res) => {
  try {
    if (!features.EXPERIMENT_CATEGORIES_TAGS) {
      return res.json({ success: true, categories: [] });
    }

    const { rows: categories } = await pool.query(
      'SELECT id, name, color_hex, icon_name FROM categories ORDER BY id ASC'
    );

    res.json({ success: true, categories });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Create a new category
exports.createCategory = async (req, res) => {
  if (!features.EXPERIMENT_CATEGORIES_TAGS) {
    return res.status(403).json({ success: false, error: 'Category feature is currently disabled' });
  }

  const { name, color_hex, icon_name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, error: 'Category name is required' });
  }

  const color = color_hex && /^#[0-9A-Fa-f]{6}$/.test(color_hex) ? color_hex : '#3B82F6';
  const icon = icon_name || 'bookmark';

  try {
    const { rows } = await pool.query(
      `INSERT INTO categories (name, color_hex, icon_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (name) DO UPDATE SET color_hex = EXCLUDED.color_hex
       RETURNING *`,
      [name.trim(), color, icon]
    );

    res.status(201).json({ success: true, category: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
