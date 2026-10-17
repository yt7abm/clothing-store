// ========================================
// قاعدة البيانات - متجر الملابس (Supabase / PostgreSQL)
// ========================================
const path = require('path');
const bcrypt = require('bcryptjs');

// ========================================
// إنشاء الاتصال بقاعدة البيانات
// ========================================
const isProduction = process.env.NODE_ENV === 'production' || process.env.DATABASE_URL;

let db;

if (isProduction) {
  // ===== الإنتاج (Supabase PostgreSQL) =====
  console.log('🌐 الاتصال بـ Supabase (PostgreSQL)...');
  
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  // محاكي متزامن (Sync Adapter) باستخدام async/await
  db = {
    _pool: pool,
    _isPostgres: true,
    
    // دالة مساعدة لتنفيذ الاستعلامات
    query: async (sql, params = []) => {
      // تحويل ? إلى $1, $2, ... (PostgreSQL)
      let index = 1;
      const pgSql = sql.replace(/\?/g, () => `$${index++}`);
      const result = await pool.query(pgSql, params);
      return result;
    },
    
    // محاكي prepare (للاستخدام مع async/await)
    prepare: (sql) => {
      return {
        get: async (...params) => {
          const result = await db.query(sql, params);
          return result.rows[0] || null;
        },
        all: async (...params) => {
          const result = await db.query(sql, params);
          return result.rows;
        },
        run: async (...params) => {
          const result = await db.query(sql, params);
          return {
            lastInsertRowid: result.rows[0]?.id || null,
            changes: result.rowCount
          };
        }
      };
    },
    
    exec: async (sql) => {
      await pool.query(sql);
    },
    
    pragma: () => {},
    
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }
  };
} else {
  // ===== التطوير المحلي (better-sqlite3) =====
  console.log('💻 الاتصال بقاعدة بيانات محلية...');
  const Database = require('better-sqlite3');
  const dbPath = path.join(__dirname, 'database.db');
  db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
}

console.log('📦 جاري تجهيز قاعدة البيانات...');

// ========================================
// إنشاء الجداول (PostgreSQL syntax)
// ========================================
async function initDatabase() {
  try {
    if (isProduction) {
      // PostgreSQL (Supabase)
      await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          full_name TEXT,
          phone TEXT,
          role TEXT DEFAULT 'employee',
          permissions TEXT DEFAULT '[]',
          active INTEGER DEFAULT 1,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      await db.exec(`
        CREATE TABLE IF NOT EXISTS categories (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          icon TEXT DEFAULT '🏷️',
          display_order INTEGER DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      await db.exec(`
        CREATE TABLE IF NOT EXISTS products (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          price REAL NOT NULL,
          cost REAL DEFAULT 0,
          image TEXT,
          category_id INTEGER REFERENCES categories(id),
          stock INTEGER DEFAULT 0,
          min_stock INTEGER DEFAULT 5,
          active INTEGER DEFAULT 1,
          discount_type TEXT DEFAULT NULL,
          discount_value REAL DEFAULT 0,
          is_featured INTEGER DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      await db.exec(`
        CREATE TABLE IF NOT EXISTS coupons (
          id SERIAL PRIMARY KEY,
          code TEXT UNIQUE NOT NULL,
          type TEXT DEFAULT 'percent',
          value REAL NOT NULL,
          min_order REAL DEFAULT 0,
          max_uses INTEGER DEFAULT 100,
          used_count INTEGER DEFAULT 0,
          active INTEGER DEFAULT 1,
          expires_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      await db.exec(`
        CREATE TABLE IF NOT EXISTS sales (
          id SERIAL PRIMARY KEY,
          invoice_number TEXT UNIQUE NOT NULL,
          total REAL NOT NULL,
          discount REAL DEFAULT 0,
          final_total REAL NOT NULL,
          payment_method TEXT DEFAULT 'cash',
          coupon_code TEXT,
          customer_name TEXT,
          customer_phone TEXT,
          customer_address TEXT,
          customer_notes TEXT,
          user_id INTEGER REFERENCES users(id),
          sale_type TEXT DEFAULT 'online',
          status TEXT DEFAULT 'pending',
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      await db.exec(`
        CREATE TABLE IF NOT EXISTS sale_items (
          id SERIAL PRIMARY KEY,
          sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
          product_id INTEGER NOT NULL REFERENCES products(id),
          product_name TEXT NOT NULL,
          price REAL NOT NULL,
          quantity INTEGER NOT NULL,
          subtotal REAL NOT NULL
        )
      `);

      await db.exec(`
        CREATE TABLE IF NOT EXISTS stock_movements (
          id SERIAL PRIMARY KEY,
          product_id INTEGER NOT NULL REFERENCES products(id),
          type TEXT NOT NULL,
          quantity INTEGER NOT NULL,
          reason TEXT,
          user_id INTEGER REFERENCES users(id),
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      await db.exec(`
        CREATE TABLE IF NOT EXISTS banners (
          id SERIAL PRIMARY KEY,
          title TEXT,
          image TEXT NOT NULL,
          link TEXT,
          display_order INTEGER DEFAULT 0,
          active INTEGER DEFAULT 1,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      await db.exec(`
        CREATE TABLE IF NOT EXISTS offers (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT,
          image TEXT,
          original_price REAL DEFAULT 0,
          offer_price REAL NOT NULL,
          product_ids TEXT DEFAULT '[]',
          display_order INTEGER DEFAULT 0,
          active INTEGER DEFAULT 1,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      console.log('✅ تم إنشاء جميع الجداول بنجاح');

      // ========================================
      // البيانات الأولية
      // ========================================
      setTimeout(async () => {
        try {
          const adminRes = await db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
          if (!adminRes) {
            const hashedPassword = bcrypt.hashSync('admin123', 10);
            await db.prepare(`
              INSERT INTO users (username, password, full_name, role, permissions, active)
              VALUES (?, ?, ?, ?, ?, ?)
            `).run('admin', hashedPassword, 'المدير العام', 'admin', '["all"]', 1);
            console.log('👤 تم إنشاء حساب المدير: admin / admin123');
          }

          const catsRes = await db.prepare('SELECT COUNT(*) as count FROM categories').get();
          if (parseInt(catsRes.count) === 0) {
            const categories = [
              { name: 'قمصان', icon: '👔', order: 1 },
              { name: 'بناطيل', icon: '👖', order: 2 },
              { name: 'فساتين', icon: '👗', order: 3 },
              { name: 'أحذية', icon: '👟', order: 4 },
              { name: 'إكسسوارات', icon: '⌚', order: 5 },
              { name: 'عبايات', icon: '🧕', order: 6 }
            ];
            for (const cat of categories) {
              await db.prepare('INSERT INTO categories (name, icon, display_order) VALUES (?, ?, ?)').run(cat.name, cat.icon, cat.order);
            }
            console.log('📁 تم إضافة 6 فئات افتراضية');
          }

          const prodsRes = await db.prepare('SELECT COUNT(*) as count FROM products').get();
          if (parseInt(prodsRes.count) === 0) {
            const sampleProducts = [
              { name: 'قميص قطني كلاسيكي', price: 15.500, cost: 8.000, category: 1, stock: 25, desc: 'قميص رجالي قطن 100% - لون أبيض' },
              { name: 'بنطال جينز أزرق', price: 22.000, cost: 12.000, category: 2, stock: 18, desc: 'بنطال جينز رجالي مقاس 32-38' },
              { name: 'فستان سهرة أسود', price: 45.000, cost: 25.000, category: 3, stock: 10, desc: 'فستان نسائي أنيق للمناسبات' },
              { name: 'حذاء رياضي أبيض', price: 35.000, cost: 20.000, category: 4, stock: 15, desc: 'حذاء رياضي مريح للاستخدام اليومي' },
              { name: 'حزام جلد طبيعي', price: 12.000, cost: 6.000, category: 5, stock: 30, desc: 'حزام رجالي جلد طبيعي' },
              { name: 'عباية سوداء مطرزة', price: 55.000, cost: 30.000, category: 6, stock: 8, desc: 'عباية نسائية بتطريز يدوي فاخر' }
            ];
            for (const p of sampleProducts) {
              await db.prepare(`
                INSERT INTO products (name, description, price, cost, category_id, stock)
                VALUES (?, ?, ?, ?, ?, ?)
              `).run(p.name, p.desc, p.price, p.cost, p.category, p.stock);
            }
            console.log('🛍️  تم إضافة 6 منتجات تجريبية');
          }

          const coupRes = await db.prepare('SELECT COUNT(*) as count FROM coupons').get();
          if (parseInt(coupRes.count) === 0) {
            const coupons = [
              { code: 'WELCOME10', type: 'percent', value: 10, min_order: 20, max_uses: 100 },
              { code: 'SAVE5', type: 'fixed', value: 5, min_order: 30, max_uses: 50 },
              { code: 'VIP20', type: 'percent', value: 20, min_order: 100, max_uses: 10 }
            ];
            for (const c of coupons) {
              await db.prepare(`
                INSERT INTO coupons (code, type, value, min_order, max_uses)
                VALUES (?, ?, ?, ?, ?)
              `).run(c.code, c.type, c.value, c.min_order, c.max_uses);
            }
            console.log('🎟️  تم إضافة 3 كوبونات تجريبية');
          }

          console.log('✅ قاعدة البيانات جاهزة');
        } catch (e) {
          console.error('خطأ في البيانات الأولية:', e.message);
        }
      }, 3000);

    } else {
      // SQLite (محلي)
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          full_name TEXT,
          phone TEXT,
          role TEXT DEFAULT 'employee',
          permissions TEXT DEFAULT '[]',
          active INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          icon TEXT DEFAULT '🏷️',
          display_order INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

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
          discount_type TEXT DEFAULT NULL,
          discount_value REAL DEFAULT 0,
          is_featured INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (category_id) REFERENCES categories(id)
        )
      `);

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
          customer_phone TEXT,
          customer_address TEXT,
          customer_notes TEXT,
          user_id INTEGER,
          sale_type TEXT DEFAULT 'online',
          status TEXT DEFAULT 'pending',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `);

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

      db.exec(`
        CREATE TABLE IF NOT EXISTS banners (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT,
          image TEXT NOT NULL,
          link TEXT,
          display_order INTEGER DEFAULT 0,
          active INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS offers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          description TEXT,
          image TEXT,
          original_price REAL DEFAULT 0,
          offer_price REAL NOT NULL,
          product_ids TEXT DEFAULT '[]',
          display_order INTEGER DEFAULT 0,
          active INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      console.log('✅ تم إنشاء جميع الجداول بنجاح');

      // البيانات الأولية (SQLite)
      const adminExists = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
      if (!adminExists) {
        const hashedPassword = bcrypt.hashSync('admin123', 10);
        db.prepare(`
          INSERT INTO users (username, password, full_name, role, permissions, active)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run('admin', hashedPassword, 'المدير العام', 'admin', '["all"]', 1);
        console.log('👤 تم إنشاء حساب المدير: admin / admin123');
      }

      const categoriesCount = db.prepare('SELECT COUNT(*) as count FROM categories').get();
      if (categoriesCount.count === 0) {
        const categories = [
          { name: 'قمصان', icon: '👔', order: 1 },
          { name: 'بناطيل', icon: '👖', order: 2 },
          { name: 'فساتين', icon: '👗', order: 3 },
          { name: 'أحذية', icon: '👟', order: 4 },
          { name: 'إكسسوارات', icon: '⌚', order: 5 },
          { name: 'عبايات', icon: '🧕', order: 6 }
        ];
        const insert = db.prepare('INSERT INTO categories (name, icon, display_order) VALUES (?, ?, ?)');
        categories.forEach(cat => insert.run(cat.name, cat.icon, cat.order));
        console.log('📁 تم إضافة 6 فئات افتراضية');
      }

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
        sampleProducts.forEach(p => insert.run(p.name, p.desc, p.price, p.cost, p.category, p.stock));
        console.log('🛍️  تم إضافة 6 منتجات تجريبية');
      }

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
        coupons.forEach(c => insert.run(c.code, c.type, c.value, c.min_order, c.max_uses));
        console.log('🎟️  تم إضافة 3 كوبونات تجريبية');
      }

      console.log('✅ قاعدة البيانات جاهزة');
    }
  } catch (error) {
    console.error('❌ خطأ في تجهيز قاعدة البيانات:', error.message);
  }
}

// بدء التهيئة
initDatabase();

// ========================================
// تصدير قاعدة البيانات
// ========================================
module.exports = db;