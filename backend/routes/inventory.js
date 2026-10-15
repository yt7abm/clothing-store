const express = require('express');
const router = express.Router();
const db = require('../database');

// جلب المخزون
router.get('/', (req, res) => {
  try {
    const inventory = db.prepare(`
      SELECT p.id, p.name, p.stock, p.min_stock, p.price, c.name as category
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.active = 1
      ORDER BY p.stock ASC
    `).all();

    const lowStock = inventory.filter(p => p.stock <= p.min_stock);
    const totalValue = inventory.reduce((sum, p) => sum + (p.stock * p.price), 0);

    res.json({ success: true, inventory, lowStock, totalValue });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// تعديل كمية المخزون
router.post('/adjust', (req, res) => {
  try {
    const { product_id, quantity, type, reason } = req.body;
    
    if (type === 'add') {
      db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(quantity, product_id);
    } else if (type === 'remove') {
      db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(quantity, product_id);
    }

    db.prepare(`
      INSERT INTO stock_movements (product_id, type, quantity, reason)
      VALUES (?, ?, ?, ?)
    `).run(product_id, type, quantity, reason || '');

    res.json({ success: true, message: 'تم تعديل المخزون' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// سجل حركات المخزون
router.get('/movements', (req, res) => {
  try {
    const movements = db.prepare(`
      SELECT sm.*, p.name as product_name
      FROM stock_movements sm
      LEFT JOIN products p ON sm.product_id = p.id
      ORDER BY sm.id DESC
      LIMIT 100
    `).all();
    res.json({ success: true, movements });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;