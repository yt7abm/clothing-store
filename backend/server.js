// ========================================
// السيرفر الرئيسي - متجر الملابس
// ========================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require('path');

console.log('1️⃣ تم تحميل المكتبات');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('2️⃣ تم إنشاء التطبيق');

// ========================================
// Middleware
// ========================================
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
console.log('3️⃣ تم تفعيل الوسطاء');

// الجلسات
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));
console.log('4️⃣ تم تفعيل الجلسات');

// الملفات الثابتة (Static Files)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/admin', express.static(path.join(__dirname, '..', 'admin')));
app.use('/frontend', express.static(path.join(__dirname, '..', 'frontend')));
app.use('/', express.static(path.join(__dirname, '..')));

// ========================================
// Routes
// ========================================
console.log('6️⃣ جاري تحميل Routes...');

app.use('/api/auth', require('./routes/auth'));
console.log('   ✅ auth');

app.use('/api/products', require('./routes/products'));
console.log('   ✅ products');

app.use('/api/categories', require('./routes/categories'));
console.log('   ✅ categories');

app.use('/api/inventory', require('./routes/inventory'));
console.log('   ✅ inventory');

app.use('/api/sales', require('./routes/sales'));
console.log('   ✅ sales');

app.use('/api/coupons', require('./routes/coupons'));
console.log('   ✅ coupons');

app.use('/api/reports', require('./routes/reports'));
console.log('   ✅ reports');

// ========================================
// صفحة اختبار
// ========================================
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: '✅ السيرفر شغّال تمام!',
    store: process.env.STORE_NAME || 'متجر الملابس',
    time: new Date().toLocaleString('ar-OM')
  });
});

// ========================================
// تشغيل السيرفر
// ========================================
app.listen(PORT, () => {
  console.log('');
  console.log('═══════════════════════════════════════');
  console.log(`🛍️  ${process.env.STORE_NAME || 'متجر الملابس'}`);
  console.log('═══════════════════════════════════════');
  console.log(`✅ السيرفر شغّال على: http://localhost:${PORT}`);
  console.log(`🌐 المتجر: http://localhost:${PORT}`);
  console.log(`🔐 لوحة التحكم: http://localhost:${PORT}/admin`);
  console.log(`🧪 اختبار: http://localhost:${PORT}/api/test`);
  console.log('═══════════════════════════════════════');
  console.log('');
});