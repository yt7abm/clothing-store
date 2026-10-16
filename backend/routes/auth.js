const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../database');

// ========================================
// قائمة الصلاحيات المتاحة (نفس staff.js)
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

  // الموظفين
  { key: 'staff.view',        label: 'عرض الموظفين',        category: 'الموظفين' },
  { key: 'staff.create',      label: 'إضافة موظف',          category: 'الموظفين' },
  { key: 'staff.edit',        label: 'تعديل موظف',          category: 'الموظفين' },
  { key: 'staff.delete',      label: 'حذف موظف',            category: 'الموظفين' }
];

// ========================================
// دالة مساعدة: جلب صلاحيات المستخدم
// ========================================
function getUserPermissions(user) {
  // المدير العام → كل الصلاحيات
  if (user.username === 'admin' || user.role === 'admin') {
    return AVAILABLE_PERMISSIONS.map(p => p.key);
  }
  
  // باقي الموظفين → الصلاحيات المخزنة
  try {
    const perms = JSON.parse(user.permissions || '[]');
    if (perms.includes('all')) {
      return AVAILABLE_PERMISSIONS.map(p => p.key);
    }
    return perms;
  } catch (e) {
    return [];
  }
}

// ========================================
// تسجيل الدخول
// ========================================
router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'اسم المستخدم وكلمة المرور مطلوبان' 
      });
    }

    // جلب المستخدم
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'اسم المستخدم غير موجود' 
      });
    }

    // التحقق من كلمة المرور
    const isValid = bcrypt.compareSync(password, user.password);

    if (!isValid) {
      return res.status(401).json({ 
        success: false, 
        message: 'كلمة المرور غير صحيحة' 
      });
    }

    // التحقق من الحساب النشط
    if (user.active !== 1) {
      return res.status(403).json({ 
        success: false, 
        message: 'الحساب معطل. يرجى التواصل مع المدير' 
      });
    }

    // جلب الصلاحيات
    const permissions = getUserPermissions(user);

    // تسجيل الدخول ناجح
    res.json({
      success: true,
      message: 'تم تسجيل الدخول بنجاح',
      token: 'token_' + user.id + '_' + Date.now(),
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        phone: user.phone,
        role: user.role,
        is_admin: user.username === 'admin' || user.role === 'admin'
      },
      permissions: permissions
    });

  } catch (error) {
    console.error('خطأ في تسجيل الدخول:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// التحقق من الجلسة (Token)
// ========================================
router.get('/verify', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'غير مصرح' });
    }

    const token = authHeader.replace('Bearer ', '');
    const parts = token.split('_');
    
    if (parts.length < 2) {
      return res.status(401).json({ success: false, message: 'رمز غير صالح' });
    }

    const userId = parseInt(parts[1]);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

    if (!user || user.active !== 1) {
      return res.status(401).json({ success: false, message: 'الجلسة منتهية' });
    }

    const permissions = getUserPermissions(user);

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        phone: user.phone,
        role: user.role,
        is_admin: user.username === 'admin' || user.role === 'admin'
      },
      permissions: permissions
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// تسجيل الخروج
// ========================================
router.post('/logout', (req, res) => {
  res.json({ success: true, message: 'تم تسجيل الخروج' });
});

// ========================================
// جلب بيانات المستخدم الحالي
// ========================================
router.get('/me', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'غير مصرح' });
    }

    const token = authHeader.replace('Bearer ', '');
    const parts = token.split('_');
    
    if (parts.length < 2) {
      return res.status(401).json({ success: false, message: 'رمز غير صالح' });
    }

    const userId = parseInt(parts[1]);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

    if (!user) {
      return res.status(401).json({ success: false, message: 'المستخدم غير موجود' });
    }

    const permissions = getUserPermissions(user);

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        phone: user.phone,
        role: user.role,
        is_admin: user.username === 'admin' || user.role === 'admin'
      },
      permissions: permissions
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;