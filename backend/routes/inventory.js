const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', async (req, res) => {
  try {
    const products = await db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY stock ASC').all();
    res.json({ success: true, products });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.post('/adjust', async (req, res) => {
  try {
    const { product_id, type, quantity, reason } = req.body;
    const product = await db.prepare('SELECT * FROM products WHERE id = ?').get(product_id);
    if (!product) return res.status(404).json({ success: false, message: 'المنتج غير موجود' });
    const newStock = type === 'add' ? product.stock + quantity : product.stock - quantity;
    if (newStock < 0) return res.status(400).json({ success: false, message: 'الكمية غير كافية' });
    await db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(newStock, product_id);
    await db.prepare(`INSERT INTO stock_movements (product_id, type, quantity, reason) VALUES (?, ?, ?, ?)`).run(product_id, type, quantity, reason || 'تعديل مخزون');
    res.json({ success: true, message: 'تم تعديل المخزون', newStock });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

module.exports = router;