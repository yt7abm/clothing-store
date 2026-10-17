const express = require('express');
const router = express.Router();
const db = require('../database');

// جلب كل الفئات
router.get('/', async (req, res) => {
  try {
    const categories = await db.prepare(`
      SELECT c.*, 
      (SELECT COUNT(*) FROM products WHERE category_id = c.id AND active = 1) as products_count
      FROM categories c
      ORDER BY c.display_order ASC, c.id ASC
    `).all();

    res.json({ success: true, categories });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// جلب فئة واحدة
router.get('/:id', async (req, res) => {
  try {
    const category = await db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'الفئة غير موجودة' });
    }
    res.json({ success: true, category });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// إضافة فئة جديدة
router.post('/', async (req, res) => {
  try {
    const { name, icon, display_order } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, message: 'اسم الفئة مطلوب' });
    }
    const existing = await db.prepare('SELECT id FROM categories WHERE name = ?').get(name.trim());
    if (existing) {
      return res.status(400).json({ success: false, message: 'الفئة موجودة مسبقاً' });
    }
    const result = await db.prepare(`
      INSERT INTO categories (name, icon, display_order)
      VALUES (?, ?, ?)
      RETURNING id
    `).run(name.trim(), icon || '🏷️', display_order || 0);

    res.json({ success: true, message: 'تم إضافة الفئة بنجاح', id: result.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// تعديل فئة
router.put('/:id', async (req, res) => {
  try {
    const { name, icon, display_order } = req.body;
    const category = await db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'الفئة غير موجودة' });
    }
    if (name && name.trim() !== category.name) {
      const existing = await db.prepare('SELECT id FROM categories WHERE name = ? AND id != ?').get(name.trim(), req.params.id);
      if (existing) {
        return res.status(400).json({ success: false, message: 'اسم الفئة موجود مسبقاً' });
      }
    }
    const newName = name !== undefined ? name.trim() : category.name;
    const newIcon = icon !== undefined ? icon : (category.icon || '🏷️');
    const newOrder = display_order !== undefined ? display_order : (category.display_order || 0);

    await db.prepare(`
      UPDATE categories SET name = ?, icon = ?, display_order = ? WHERE id = ?
    `).run(newName, newIcon, newOrder, req.params.id);

    res.json({ success: true, message: 'تم تعديل الفئة بنجاح' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// حذف فئة
router.delete('/:id', async (req, res) => {
  try {
    const category = await db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'الفئة غير موجودة' });
    }
    const productsCount = await db.prepare('SELECT COUNT(*) as count FROM products WHERE category_id = ?').get(req.params.id).count;
    if (productsCount > 0) {
      return res.status(400).json({ success: false, message: `لا يمكن حذف الفئة. يوجد ${productsCount} منتج مرتبط بها.` });
    }
    await db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'تم حذف الفئة' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;