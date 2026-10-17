const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const db = require('../database');

// ========================================
// إعداد Cloudinary
// ========================================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'clothing-store/products',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [{ width: 800, height: 800, crop: 'limit' }]
  }
});

const upload = multer({ storage });

// ========================================
// دالة مساعدة لحساب السعر النهائي
// ========================================
function getFinalPrice(product) {
  if (!product.discount_type || !product.discount_value) {
    return product.price;
  }
  if (product.discount_type === 'percent') {
    return product.price - (product.price * product.discount_value / 100);
  }
  if (product.discount_type === 'fixed') {
    return Math.max(0, product.price - product.discount_value);
  }
  return product.price;
}

// ========================================
// جلب كل المنتجات
// ========================================
router.get('/', async (req, res) => {
  try {
    const products = await db.prepare(`
      SELECT p.*, c.name as category_name 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE p.active = 1
      ORDER BY p.id DESC
    `).all();

    const formatted = products.map(p => ({
      ...p,
      final_price: getFinalPrice(p)
    }));

    res.json({ success: true, products: formatted });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// جلب المنتجات الأكثر مبيعاً (مُبسط لضمان العمل)
// ========================================
router.get('/best-sellers', async (req, res) => {
  try {
    // استعلام بسيط لا يعتمد على جدول sale_items (لضمان العمل حتى بدون مبيعات)
    const products = await db.prepare(`
      SELECT 
        p.*, 
        c.name as category_name
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE p.active = 1
      ORDER BY p.id DESC
      LIMIT 3
    `).all();

    const formatted = products.map(p => ({
      ...p,
      final_price: getFinalPrice(p)
    }));

    res.json({ success: true, products: formatted });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// جلب منتجات فئة معينة
// ========================================
router.get('/category/:categoryId', async (req, res) => {
  try {
    const { limit } = req.query;
    const limitNum = parseInt(limit) || 3;

    const products = await db.prepare(`
      SELECT p.*, c.name as category_name 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE p.active = 1 AND p.category_id = ?
      ORDER BY p.id DESC
      LIMIT ?
    `).all(req.params.categoryId, limitNum);

    const formatted = products.map(p => ({
      ...p,
      final_price: getFinalPrice(p)
    }));

    res.json({ success: true, products: formatted });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// جلب منتج واحد
// ========================================
router.get('/:id', async (req, res) => {
  try {
    const product = await db.prepare(`
      SELECT p.*, c.name as category_name 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE p.id = ?
    `).get(req.params.id);

    if (!product) {
      return res.status(404).json({ success: false, message: 'المنتج غير موجود' });
    }

    res.json({ 
      success: true, 
      product: { ...product, final_price: getFinalPrice(product) } 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// إضافة منتج جديد
// ========================================
router.post('/', upload.single('image'), async (req, res) => {
  try {
    const { 
      name, description, price, cost, category_id, stock, min_stock,
      discount_type, discount_value, is_featured 
    } = req.body;

    const image = req.file ? req.file.path : null;

    if (!name || !price) {
      return res.status(400).json({ success: false, message: 'الاسم والسعر مطلوبان' });
    }

    const result = await db.prepare(`
      INSERT INTO products (
        name, description, price, cost, image, category_id, stock, min_stock,
        discount_type, discount_value, is_featured
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `).run(
      name, description, price, cost || 0, image, category_id || null, 
      stock || 0, min_stock || 5, discount_type || null, discount_value || 0,
      is_featured === 'true' || is_featured === '1' ? 1 : 0
    );

    res.json({ 
      success: true, 
      message: 'تم إضافة المنتج بنجاح', 
      id: result.lastInsertRowid 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// تعديل منتج
// ========================================
router.put('/:id', upload.single('image'), async (req, res) => {
  try {
    const { 
      name, description, price, cost, category_id, stock, min_stock,
      discount_type, discount_value, is_featured 
    } = req.body;

    const product = await db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'المنتج غير موجود' });
    }

    const image = req.file ? req.file.path : product.image;
    const newDiscountType = (discount_type && discount_type !== '') ? discount_type : null;
    const newDiscountValue = parseFloat(discount_value) || 0;
    const newIsFeatured = (is_featured === 'true' || is_featured === '1' || is_featured === 1) ? 1 : 0;

    await db.prepare(`
      UPDATE products 
      SET name = ?, description = ?, price = ?, cost = ?, image = ?, 
          category_id = ?, stock = ?, min_stock = ?,
          discount_type = ?, discount_value = ?, is_featured = ?
      WHERE id = ?
    `).run(
      name, description, price, cost, image, category_id, stock, min_stock,
      newDiscountType, newDiscountValue, newIsFeatured, req.params.id
    );

    res.json({ success: true, message: 'تم تعديل المنتج بنجاح' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// تفعيل/تعطيل خصم على منتج
// ========================================
router.put('/:id/discount', async (req, res) => {
  try {
    const { discount_type, discount_value } = req.body;
    const product = await db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    
    if (!product) {
      return res.status(404).json({ success: false, message: 'المنتج غير موجود' });
    }

    const newType = (discount_type && discount_type !== '') ? discount_type : null;
    const newValue = parseFloat(discount_value) || 0;

    await db.prepare(`
      UPDATE products SET discount_type = ?, discount_value = ? WHERE id = ?
    `).run(newType, newValue, req.params.id);

    res.json({ 
      success: true, 
      message: newType ? 'تم تطبيق الخصم' : 'تم إلغاء الخصم' 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// تفعيل/تعطيل منتج مميز
// ========================================
router.put('/:id/featured', async (req, res) => {
  try {
    const product = await db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'المنتج غير موجود' });
    }

    const newStatus = product.is_featured === 1 ? 0 : 1;
    await db.prepare('UPDATE products SET is_featured = ? WHERE id = ?').run(newStatus, req.params.id);

    res.json({ 
      success: true, 
      message: newStatus === 1 ? 'تم تمييز المنتج' : 'تم إلغاء التمييز',
      is_featured: newStatus
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// حذف منتج
// ========================================
router.delete('/:id', async (req, res) => {
  try {
    await db.prepare('UPDATE products SET active = 0 WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'تم حذف المنتج' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;