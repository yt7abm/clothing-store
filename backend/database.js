// ========================================
// قاعدة البيانات - متجر الملابس
// ========================================
const Database = require('better-sqlite3');
const path = require('path');

// مسار قاعدة البيانات
const dbPath = path.join(__dirname, 'database.db');

// إنشاء الاتصال بقاعدة البيانات
const db = new Database(dbPath);

// تفعيل المفاتيح الأجنبية
db.pragma('foreign_keys = ON');

// ========================================
// إنشاء الجداول
// ========================================
console.log('📦 جاري تجهيز قاعدة البيانات...');

// 1. جدول المستخدمين (المدير والموظفين)
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    full_name TEXT,
    role TEXT DEFAULT 'employee',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 2. جدول الفئات (تصنيفات الملابس)
db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 3. جدول المنتجات
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    cost REAL DEFAULT 0,
    image TEXT,
    category_id INTEGER,
    stock INTEGER DEFAULT 0,
    min_stock INTEGER DEFAULT 5,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id)
  )
`);

// 4. جدول الكوبونات
db.exec(`
  CREATE TABLE IF NOT EXISTS coupons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    type TEXT DEFAULT 'percent',
    value REAL NOT NULL,
    min_order REAL DEFAULT 0,
    max_uses INTEGER DEFAULT 100,
    used_count INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 5. جدول المبيعات (الفواتير)
db.exec(`
  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number TEXT UNIQUE NOT NULL,
    total REAL NOT NULL,
    discount REAL DEFAULT 0,
    final_total REAL NOT NULL,
    payment_method TEXT DEFAULT 'cash',
    coupon_code TEXT,
    customer_name TEXT,
    user_id INTEGER,
    sale_type TEXT DEFAULT 'online',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

// 6. جدول تفاصيل المبيعات
db.exec(`
  CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    price REAL NOT NULL,
    quantity INTEGER NOT NULL,
    subtotal REAL NOT NULL,
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
  )
`);

// 7. جدول حركة المخزون
db.exec(`
  CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    reason TEXT,
    user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

console.log('✅ تم إنشاء جميع الجداول بنجاح');

// ========================================
// البيانات الأولية (Seed Data)
// ========================================

// إنشاء حساب مدير افتراضي
const bcrypt = require('bcryptjs');
const adminExists = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');

if (!adminExists) {
  const hashedPassword = bcrypt.hashSync('admin123', 10);
  db.prepare(`
    INSERT INTO users (username, password, full_name, role)
    VALUES (?, ?, ?, ?)
  `).run('admin', hashedPassword, 'المدير العام', 'admin');
  console.log('👤 تم إنشاء حساب المدير: admin / admin123');
}

// إضافة فئات افتراضية
const categoriesCount = db.prepare('SELECT COUNT(*) as count FROM categories').get();
if (categoriesCount.count === 0) {
  const categories = ['قمصان', 'بناطيل', 'فساتين', 'أحذية', 'إكسسوارات', 'عبايات'];
  const insert = db.prepare('INSERT INTO categories (name) VALUES (?)');
  categories.forEach(name => insert.run(name));
  console.log('📁 تم إضافة الفئات الافتراضية');
}

// إضافة منتجات تجريبية
const productsCount = db.prepare('SELECT COUNT(*) as count FROM products').get();
if (productsCount.count === 0) {
  const sampleProducts = [
    { name: 'قميص قطني كلاسيكي', price: 15.500, cost: 8.000, category: 1, stock: 25, desc: 'قميص رجالي قطن 100% - لون أبيض' },
    { name: 'بنطال جينز أزرق', price: 22.000, cost: 12.000, category: 2, stock: 18, desc: 'بنطال جينز رجالي مقاس 32-38' },
    { name: 'فستان سهرة أسود', price: 45.000, cost: 25.000, category: 3, stock: 10, desc: 'فستان نسائي أنيق للمناسبات' },
    { name: 'حذاء رياضي أبيض', price: 35.000, cost: 20.000, category: 4, stock: 15, desc: 'حذاء رياضي مريح للاستخدام اليومي' },
    { name: 'حزام جلد طبيعي', price: 12.000, cost: 6.000, category: 5, stock: 30, desc: 'حزام رجالي جلد طبيعي' },
    { name: 'عباية سوداء مطرزة', price: 55.000, cost: 30.000, category: 6, stock: 8, desc: 'عباية نسائية بتطريز يدوي فاخر' }
  ];

  const insert = db.prepare(`
    INSERT INTO products (name, description, price, cost, category_id, stock)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  sampleProducts.forEach(p => {
    insert.run(p.name, p.desc, p.price, p.cost, p.category, p.stock);
  });
  console.log('🛍️  تم إضافة 6 منتجات تجريبية');
}

// إضافة كوبونات تجريبية
const couponsCount = db.prepare('SELECT COUNT(*) as count FROM coupons').get();
if (couponsCount.count === 0) {
  const coupons = [
    { code: 'WELCOME10', type: 'percent', value: 10, min_order: 20, max_uses: 100 },
    { code: 'SAVE5', type: 'fixed', value: 5, min_order: 30, max_uses: 50 },
    { code: 'VIP20', type: 'percent', value: 20, min_order: 100, max_uses: 10 }
  ];
  
  const insert = db.prepare(`
    INSERT INTO coupons (code, type, value, min_order, max_uses)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  coupons.forEach(c => {
    insert.run(c.code, c.type, c.value, c.min_order, c.max_uses);
  });
  console.log('🎟️  تم إضافة 3 كوبونات تجريبية');
}

// ========================================
// تصدير قاعدة البيانات
// ========================================
module.exports = db;