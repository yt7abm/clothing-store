const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../database');

// ========================================
// قائمة الصلاحيات المتاحة في النظام
// ========================================
const AVAILABLE_PERMISSIONS = [
  // المنتجات
  { key: 'products.view',     label: 'عرض المنتجات',        category: 'المنتجات' },
  { key: 'products.create',   label: 'إضافة منتج',          category: 'المنتجات' },
  { key: 'products.edit',     label: 'تعديل منتج',          category: 'المنتجات' },
  { key: 'products.delete',   label: 'حذف منتج',            category: 'المنتجات' },

  // الفئات
  { key: 'categories.view',   label: 'عرض الفئات',          category: 'الفئات' },
  { key: 'categories.create', label: 'إضافة فئة',           category: 'الفئات' },
  { key: 'categories.edit',   label: 'تعديل فئة',           category: 'الفئات' },
  { key: 'categories.delete', label: 'حذف فئة',             category: 'الفئات' },

  // المخزون
  { key: 'inventory.view',    label: 'عرض المخزون',         category: 'المخزون' },
  { key: 'inventory.edit',    label: 'تعديل المخزون',       category: 'المخزون' },

  // الطلبات
  { key: 'orders.view',       label: 'عرض الطلبات',         category: 'الطلبات' },
  { key: 'orders.edit',       label: 'تعديل حالة الطلبات',  category: 'الطلبات' },
  { key: 'orders.delete',     label: 'حذف الطلبات',         category: 'الطلبات' },

  // الكاشير
  { key: 'cashier.access',    label: 'الوصول للكاشير',      category: 'الكاشير' },
  { key: 'cashier.discount',  label: 'تطبيق خصومات',        category: 'الكاشير' },
  { key: 'cashier.refund',    label: 'إرجاع المنتجات',      category: 'الكاشير' },

  // الكوبونات
  { key: 'coupons.view',      label: 'عرض الكوبونات',       category: 'الكوبونات' },
  { key: 'coupons.create',    label: 'إضافة كوبون',         category: 'الكوبونات' },
  { key: 'coupons.edit',      label: 'تعديل كوبون',         category: 'الكوبونات' },
  { key: 'coupons.delete',    label: 'حذف كوبون',           category: 'الكوبونات' },

  // التقارير
  { key: 'reports.view',      label: 'عرض التقارير',        category: 'التقارير' },
  { key: 'reports.export',    label: 'تصدير التقارير',      category: 'التقارير' },

  // البانرات
  { key: 'banners.view',      label: 'عرض البانرات',        category: 'البانرات' },
  { key: 'banners.manage',    label: 'إدارة البانرات',      category: 'البانرات' },

  // الموظفين (للمدير فقط)
  { key: 'staff.view',        label: 'عرض الموظفين',        category: 'الموظفين' },
  { key: 'staff.create',      label: 'إضافة موظف',          category: 'الموظفين' },
  { key: 'staff.edit',        label: 'تعديل موظف',          category: 'الموظفين' },
  { key: 'staff.delete',      label: 'حذف موظف',            category: 'الموظفين' }
];

// ========================================
// قائمة الصلاحيات المتاحة (للواجهة)
// ========================================
router.get('/permissions', (req, res) => {
  try {
    res.json({ success: true, permissions: AVAILABLE_PERMISSIONS });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// جلب كل الموظفين
// ========================================
router.get('/', (req, res) => {
  try {
    const staff = db.prepare(`
      SELECT id, username, full_name, phone, role, permissions, active, created_at
      FROM users 
      ORDER BY 
        CASE role 
          WHEN 'admin' THEN 1 
          WHEN 'manager' THEN 2 
          ELSE 3 
        END,
        id DESC
    `).all();

    // تحويل الصلاحيات من نص JSON إلى مصفوفة
    const formatted = staff.map(s => ({
      ...s,
      permissions: JSON.parse(s.permissions || '[]')
    }));

    res.json({ success: true, staff: formatted });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// جلب موظف واحد
// ========================================
router.get('/:id', (req, res) => {
  try {
    const staff = db.prepare(`
      SELECT id, username, full_name, phone, role, permissions, active, created_at
      FROM users WHERE id = ?
    `).get(req.params.id);

    if (!staff) {
      return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
    }

    staff.permissions = JSON.parse(staff.permissions || '[]');
    res.json({ success: true, staff });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// إضافة موظف جديد
// ========================================
router.post('/', (req, res) => {
  try {
    const { username, password, full_name, phone, role, permissions } = req.body;

    // التحقق من المدخلات
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'اسم المستخدم وكلمة المرور مطلوبان' 
      });
    }

    // التحقق من عدم وجود اسم المستخدم
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(400).json({ 
        success: false, 
        message: 'اسم المستخدم موجود مسبقاً' 
      });
    }

    // تشفير كلمة المرور
    const hashedPassword = bcrypt.hashSync(password, 10);

    // تحويل الصلاحيات إلى JSON
    const permissionsJson = JSON.stringify(permissions || []);

    const result = db.prepare(`
      INSERT INTO users (username, password, full_name, phone, role, permissions, active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(
      username,
      hashedPassword,
      full_name || null,
      phone || null,
      role || 'employee',
      permissionsJson
    );

    res.json({ 
      success: true, 
      message: 'تم إضافة الموظف بنجاح', 
      id: result.lastInsertRowid 
    });
  } catch (error) {
    console.error('خطأ في إضافة الموظف:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// تعديل موظف
// ========================================
router.put('/:id', (req, res) => {
  try {
    const { username, password, full_name, phone, role, permissions, active } = req.body;
    const staff = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);

    if (!staff) {
      return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
    }

    // منع تعديل المدير العام (id = 1)
    if (staff.username === 'admin' && username && username !== 'admin') {
      return res.status(400).json({ 
        success: false, 
        message: 'لا يمكن تغيير اسم المستخدم للمدير العام' 
      });
    }

    // التحقق من عدم وجود اسم المستخدم (إذا تم تغييره)
    if (username && username !== staff.username) {
      const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?')
        .get(username, req.params.id);
      if (existing) {
        return res.status(400).json({ 
          success: false, 
          message: 'اسم المستخدم موجود مسبقاً' 
        });
      }
    }

    // تجهيز البيانات
    const newUsername = username || staff.username;
    const newFullName = full_name !== undefined ? full_name : staff.full_name;
    const newPhone = phone !== undefined ? phone : staff.phone;
    const newRole = role || staff.role;
    const newActive = active !== undefined ? active : staff.active;

    // الصلاحيات: لا يمكن تعديل صلاحيات المدير العام
    let newPermissions;
    if (staff.username === 'admin') {
      newPermissions = '["all"]';
    } else {
      newPermissions = permissions !== undefined 
        ? JSON.stringify(permissions) 
        : staff.permissions;
    }

    // كلمة المرور
    let newPassword = staff.password;
    if (password && password.trim() !== '') {
      newPassword = bcrypt.hashSync(password, 10);
    }

    db.prepare(`
      UPDATE users 
      SET username = ?, password = ?, full_name = ?, phone = ?, role = ?, permissions = ?, active = ?
      WHERE id = ?
    `).run(
      newUsername,
      newPassword,
      newFullName,
      newPhone,
      newRole,
      newPermissions,
      newActive,
      req.params.id
    );

    res.json({ success: true, message: 'تم تعديل الموظف بنجاح' });
  } catch (error) {
    console.error('خطأ في تعديل الموظف:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// تفعيل/تعطيل موظف
// ========================================
router.put('/:id/toggle', (req, res) => {
  try {
    const staff = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    
    if (!staff) {
      return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
    }

    // منع تعطيل المدير العام
    if (staff.username === 'admin') {
      return res.status(400).json({ 
        success: false, 
        message: 'لا يمكن تعطيل المدير العام' 
      });
    }

    const newStatus = staff.active === 1 ? 0 : 1;
    db.prepare('UPDATE users SET active = ? WHERE id = ?').run(newStatus, req.params.id);

    res.json({ 
      success: true, 
      message: newStatus === 1 ? 'تم تفعيل الموظف' : 'تم تعطيل الموظف',
      active: newStatus
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// تغيير كلمة المرور (للموظف نفسه)
// ========================================
router.put('/:id/password', (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        message: 'كلمة المرور الحالية والجديدة مطلوبتان' 
      });
    }

    const staff = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!staff) {
      return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
    }

    // التحقق من كلمة المرور الحالية
    const isValid = bcrypt.compareSync(currentPassword, staff.password);
    if (!isValid) {
      return res.status(400).json({ 
        success: false, 
        message: 'كلمة المرور الحالية غير صحيحة' 
      });
    }

    // تشفير كلمة المرور الجديدة
    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, req.params.id);

    res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// حذف موظف
// ========================================
router.delete('/:id', (req, res) => {
  try {
    const staff = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);

    if (!staff) {
      return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
    }

    // منع حذف المدير العام
    if (staff.username === 'admin') {
      return res.status(400).json({ 
        success: false, 
        message: 'لا يمكن حذف المدير العام' 
      });
    }

    // حذف الموظف نهائياً
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);

    res.json({ success: true, message: 'تم حذف الموظف' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;