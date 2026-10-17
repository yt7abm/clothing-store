const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/sales', async (req, res) => {
  try {
    const today = await db.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(final_total), 0) as total FROM sales WHERE DATE(created_at) = DATE('now')`).get();
    const thisMonth = await db.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(final_total), 0) as total FROM sales WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`).get();
    const total = await db.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(final_total), 0) as total FROM sales`).get();
    res.json({ success: true, today, thisMonth, total });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.get('/top-products', async (req, res) => {
  try {
    const products = await db.prepare(`SELECT product_name, SUM(quantity) as total_sold, SUM(subtotal) as revenue FROM sale_items GROUP BY product_id ORDER BY total_sold DESC LIMIT 10`).all();
    res.json({ success: true, products });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.get('/daily', async (req, res) => {
  try {
    const daily = await db.prepare(`SELECT DATE(created_at) as date, COUNT(*) as count, SUM(final_total) as total FROM sales WHERE created_at >= DATE('now', '-7 days') GROUP BY DATE(created_at) ORDER BY date ASC`).all();
    res.json({ success: true, daily });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.get('/profit', async (req, res) => {
  try {
    const profit = await db.prepare(`SELECT COALESCE(SUM(si.subtotal), 0) as revenue, COALESCE(SUM(si.quantity * p.cost), 0) as cost, COALESCE(SUM(si.subtotal) - SUM(si.quantity * p.cost), 0) as profit FROM sale_items si LEFT JOIN products p ON si.product_id = p.id`).get();
    res.json({ success: true, profit });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

module.exports = router;