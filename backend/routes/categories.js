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

// ... (باقي الكود كما هو، لكن تأكد أن كل الدوال التي تستخدم db.prepare فيها كلمة async و await)