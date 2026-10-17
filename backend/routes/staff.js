const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../database');

const AVAILABLE_PERMISSIONS = [
  { key: 'products.view', label: 'عرض المنتجات', category: 'المنتجات' }, { key: 'products.create', label: 'إضافة منتج', category: 'المنتجات' }, { key: 'products.edit', label: 'تعديل منتج', category: 'المنتجات' }, { key: 'products.delete', label: 'حذف منتج', category: 'المنتجات' },
  { key: 'categories.view', label: 'عرض الفئات', category: 'الفئات' }, { key: 'categories.create', label: 'إضافة فئة', category: 'الفئات' }, { key: 'categories.edit', label: 'تعديل فئة', category: 'الفئات' }, { key: 'categories.delete', label: 'حذف فئة', category: 'الفئات' },
  { key: 'inventory.view', label: 'عرض المخزون', category: 'المخزون' }, { key: 'inventory.edit', label: 'تعديل المخزون', category: 'المخزون' },
  { key: 'orders.view', label: 'عرض الطلبات', category: 'الطلبات' }, { key: 'orders.edit', label: 'تعديل حالة الطلبات', category: 'الطلبات' }, { key: 'orders.delete', label: 'حذف الطلبات', category: 'الطلبات' },
  { key: 'cashier.access', label: 'الوصول للكاشير', category: 'الكاشير' }, { key: 'cashier.discount', label: 'تطبيق خصومات', category: 'الكاشير' }, { key: 'cashier.refund', label: 'إرجاع المنتجات', category: 'الكاشير' },
  { key: 'coupons.view', label: 'عرض الكوبونات', category: 'الكوبونات' }, { key: 'coupons.create', label: 'إضافة كوبون', category: 'الكوبونات' }, { key: 'coupons.edit', label: 'تعديل كوبون', category: 'الكوبونات' }, { key: 'coupons.delete', label: 'حذف كوبون', category: 'الكوبونات' },
  { key: 'reports.view', label: 'عرض التقارير', category: 'التقارير' }, { key: 'reports.export', label: 'تصدير التقارير', category: 'التقارير' },
  { key: 'banners.view', label: 'عرض البانرات', category: 'البانرات' }, { key: 'banners.manage', label: 'إدارة البانرات', category: 'البانرات' },
  { key: 'staff.view', label: 'عرض الموظفين', category: 'الموظفين' }, { key: 'staff.create', label: 'إضافة موظف', category: 'الموظفين' }, { key: 'staff.edit', label: 'تعديل موظف', category: 'الموظفين' }, { key: 'staff.delete', label: 'حذف موظف', category: 'الموظفين' }
];

router.get('/permissions', (req, res) => { res.json({ success: true, permissions: AVAILABLE_PERMISSIONS }); });

router.get('/', async (req, res) => {
  try {
    const staff = await db.prepare(`SELECT id, username, full_name, phone, role, permissions, active, created_at FROM users ORDER BY CASE role WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END, id DESC`).all();
    const formatted = staff.map(s => ({ ...s, permissions: JSON.parse(s.permissions || '[]') }));
    res.json({ success: true, staff: formatted });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const staff = await db.prepare(`SELECT id, username, full_name, phone, role, permissions, active, created_at FROM users WHERE id = ?`).get(req.params.id);
    if (!staff) return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
    staff.permissions = JSON.parse(staff.permissions || '[]');
    res.json({ success: true, staff });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { username, password, full_name, phone, role, permissions } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: 'اسم المستخدم وكلمة المرور مطلوبان' });
    const existing = await db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) return res.status(400).json({ success: false, message: 'اسم المستخدم موجود مسبقاً' });
    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = await db.prepare(`INSERT INTO users (username, password, full_name, phone, role, permissions, active) VALUES (?, ?, ?, ?, ?, ?, 1) RETURNING id`).run(username, hashedPassword, full_name || null, phone || null, role || 'employee', JSON.stringify(permissions || []));
    res.json({ success: true, message: 'تم إضافة الموظف بنجاح', id: result.lastInsertRowid });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { username, password, full_name, phone, role, permissions, active } = req.body;
    const staff = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!staff) return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
    if (staff.username === 'admin' && username && username !== 'admin') return res.status(400).json({ success: false, message: 'لا يمكن تغيير اسم المستخدم للمدير العام' });
    if (username && username !== staff.username) {
      const existing = await db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, req.params.id);
      if (existing) return res.status(400).json({ success: false, message: 'اسم المستخدم موجود مسبقاً' });
    }
    let newPermissions = staff.username === 'admin' ? '["all"]' : (permissions !== undefined ? JSON.stringify(permissions) : staff.permissions);
    let newPassword = staff.password;
    if (password && password.trim() !== '') newPassword = bcrypt.hashSync(password, 10);
    await db.prepare(`UPDATE users SET username = ?, password = ?, full_name = ?, phone = ?, role = ?, permissions = ?, active = ? WHERE id = ?`).run(username || staff.username, newPassword, full_name !== undefined ? full_name : staff.full_name, phone !== undefined ? phone : staff.phone, role || staff.role, newPermissions, active !== undefined ? active : staff.active, req.params.id);
    res.json({ success: true, message: 'تم تعديل الموظف بنجاح' });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.put('/:id/toggle', async (req, res) => {
  try {
    const staff = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!staff) return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
    if (staff.username === 'admin') return res.status(400).json({ success: false, message: 'لا يمكن تعطيل المدير العام' });
    const newStatus = staff.active === 1 ? 0 : 1;
    await db.prepare('UPDATE users SET active = ? WHERE id = ?').run(newStatus, req.params.id);
    res.json({ success: true, message: newStatus === 1 ? 'تم تفعيل الموظف' : 'تم تعطيل الموظف', active: newStatus });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const staff = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!staff) return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
    if (staff.username === 'admin') return res.status(400).json({ success: false, message: 'لا يمكن حذف المدير العام' });
    await db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'تم حذف الموظف' });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

module.exports = router;