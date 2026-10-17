const express = require('express');
const router = express.Router();
const db = require('../database');

// ========================================
// تقرير المبيعات
// ========================================
router.get('/sales', async (req, res) => {
  try {
    const today = await db.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(final_total), 0) as total
      FROM sales
      WHERE DATE(created_at) = CURRENT_DATE
    `).get();

    const thisMonth = await db.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(final_total), 0) as total
      FROM sales
      WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM CURRENT_DATE)
        AND EXTRACT(MONTH FROM created_at) = EXTRACT(MONTH FROM CURRENT_DATE)
    `).get();

    const total = await db.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(final_total), 0) as total FROM sales
    `).get();

    res.json({ success: true, today, thisMonth, total });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// أفضل المنتجات مبيعاً
// ========================================
router.get('/top-products', async (req, res) => {
  try {
    const products = await db.prepare(`
      SELECT product_name, SUM(quantity) as total_sold, SUM(subtotal) as revenue
      FROM sale_items
      GROUP BY product_id, product_name
      ORDER BY total_sold DESC
      LIMIT 10
    `).all();
    res.json({ success: true, products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// مبيعات آخر 7 أيام
// ========================================
router.get('/daily', async (req, res) => {
  try {
    const daily = await db.prepare(`
      SELECT DATE(created_at) as date, COUNT(*) as count, SUM(final_total) as total
      FROM sales
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `).all();
    res.json({ success: true, daily });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// الأرباح
// ========================================
router.get('/profit', async (req, res) => {
  try {
    const profit = await db.prepare(`
      SELECT 
        COALESCE(SUM(si.subtotal), 0) as revenue,
        COALESCE(SUM(si.quantity * p.cost), 0) as cost,
        COALESCE(SUM(si.subtotal) - SUM(si.quantity * p.cost), 0) as profit
      FROM sale_items si
      LEFT JOIN products p ON si.product_id = p.id
    `).get();
    res.json({ success: true, profit });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;