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

// إعداد التخزين على Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'clothing-store/products', // اسم المجلد في Cloudinary
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [{ width: 800, height: 800, crop: 'limit' }]
  }
});

const upload = multer({ storage });

// ========================================
// جلب كل المنتجات
// ========================================
router.get('/', (req, res) => {
  try {
    const products = db.prepare(`
      SELECT p.*, c.name as category_name 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE p.active = 1
      ORDER BY p.id DESC
    `).all();
    res.json({ success: true, products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// جلب منتج واحد
// ========================================
router.get('/:id', (req, res) => {
  try {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'المنتج غير موجود' });
    }
    res.json({ success: true, product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// إضافة منتج جديد
// ========================================
router.post('/', upload.single('image'), (req, res) => {
  try {
    const { name, description, price, cost, category_id, stock, min_stock } = req.body;
    
    // Cloudinary يرجع الرابط الكامل في req.file.path
    const image = req.file ? req.file.path : null;

    if (!name || !price) {
      return res.status(400).json({ success: false, message: 'الاسم والسعر مطلوبان' });
    }

    const result = db.prepare(`
      INSERT INTO products (name, description, price, cost, image, category_id, stock, min_stock)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, description, price, cost || 0, image, category_id || null, stock || 0, min_stock || 5);

    res.json({ success: true, message: 'تم إضافة المنتج بنجاح', id: result.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// تعديل منتج
// ========================================
router.put('/:id', upload.single('image'), (req, res) => {
  try {
    const { name, description, price, cost, category_id, stock, min_stock } = req.body;
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    
    if (!product) {
      return res.status(404).json({ success: false, message: 'المنتج غير موجود' });
    }

    // إذا تم رفع صورة جديدة، استخدم رابط Cloudinary، وإلا احتفظ بالصورة القديمة
    const image = req.file ? req.file.path : product.image;

    db.prepare(`
      UPDATE products 
      SET name = ?, description = ?, price = ?, cost = ?, image = ?, category_id = ?, stock = ?, min_stock = ?
      WHERE id = ?
    `).run(name, description, price, cost, image, category_id, stock, min_stock, req.params.id);

    res.json({ success: true, message: 'تم تعديل المنتج بنجاح' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// حذف منتج
// ========================================
router.delete('/:id', (req, res) => {
  try {
    db.prepare('UPDATE products SET active = 0 WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'تم حذف المنتج' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;