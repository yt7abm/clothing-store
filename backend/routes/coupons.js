const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', async (req, res) => {
  try {
    const coupons = await db.prepare('SELECT * FROM coupons ORDER BY id DESC').all();
    res.json({ success: true, coupons });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const coupon = await db.prepare('SELECT * FROM coupons WHERE id = ?').get(req.params.id);
    if (!coupon) return res.status(404).json({ success: false, message: 'الكوبون غير موجود' });
    res.json({ success: true, coupon });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { code, type, value, min_order, max_uses, expires_at, active } = req.body;
    const result = await db.prepare(`INSERT INTO coupons (code, type, value, min_order, max_uses, expires_at, active) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`).run(code.toUpperCase(), type || 'percent', value, min_order || 0, max_uses || 100, expires_at || null, active !== undefined ? active : 1);
    res.json({ success: true, message: 'تم إضافة الكوبون بنجاح', id: result.lastInsertRowid });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { code, type, value, min_order, max_uses, expires_at, active } = req.body;
    await db.prepare(`UPDATE coupons SET code = ?, type = ?, value = ?, min_order = ?, max_uses = ?, expires_at = ?, active = ? WHERE id = ?`).run(code.toUpperCase(), type, value, min_order, max_uses, expires_at, active, req.params.id);
    res.json({ success: true, message: 'تم تعديل الكوبون بنجاح' });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.put('/:id/toggle', async (req, res) => {
  try {
    const coupon = await db.prepare('SELECT * FROM coupons WHERE id = ?').get(req.params.id);
    if (!coupon) return res.status(404).json({ success: false, message: 'الكوبون غير موجود' });
    const newStatus = coupon.active === 1 ? 0 : 1;
    await db.prepare('UPDATE coupons SET active = ? WHERE id = ?').run(newStatus, req.params.id);
    res.json({ success: true, message: newStatus === 1 ? 'تم تفعيل الكوبون' : 'تم تعطيل الكوبون', active: newStatus });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.prepare('DELETE FROM coupons WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'تم حذف الكوبون' });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

module.exports = router;