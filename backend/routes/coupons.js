const express = require('express');
const router = express.Router();
const db = require('../database');

// جلب كل الكوبونات
router.get('/', (req, res) => {
  try {
    const coupons = db.prepare('SELECT * FROM coupons ORDER BY id DESC').all();
    res.json({ success: true, coupons });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// التحقق من كوبون
router.post('/validate', (req, res) => {
  try {
    const { code, total } = req.body;
    const coupon = db.prepare('SELECT * FROM coupons WHERE code = ? AND active = 1').get(code);

    if (!coupon) {
      return res.status(404).json({ success: false, message: 'الكوبون غير موجود' });
    }

    if (coupon.used_count >= coupon.max_uses) {
      return res.status(400).json({ success: false, message: 'تم استنفاد هذا الكوبون' });
    }

    if (total < coupon.min_order) {
      return res.status(400).json({ success: false, message: `الحد الأدنى للطلب ${coupon.min_order} ريال` });
    }

    let discount = 0;
    if (coupon.type === 'percent') {
      discount = (total * coupon.value) / 100;
    } else {
      discount = coupon.value;
    }

    res.json({ success: true, coupon, discount });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// إضافة كوبون
router.post('/', (req, res) => {
  try {
    const { code, type, value, min_order, max_uses, expires_at } = req.body;
    const result = db.prepare(`
      INSERT INTO coupons (code, type, value, min_order, max_uses, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(code, type, value, min_order || 0, max_uses || 100, expires_at || null);

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// حذف كوبون
router.delete('/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM coupons WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;