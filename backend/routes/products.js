const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../database');

// إعداد رفع الصور
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });

// جلب كل المنتجات
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

// جلب منتج واحد
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

// إضافة منتج جديد
router.post('/', upload.single('image'), (req, res) => {
  try {
    const { name, description, price, cost, category_id, stock, min_stock } = req.body;
    const image = req.file ? req.file.filename : null;

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

// تعديل منتج
router.put('/:id', upload.single('image'), (req, res) => {
  try {
    const { name, description, price, cost, category_id, stock, min_stock } = req.body;
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    
    if (!product) {
      return res.status(404).json({ success: false, message: 'المنتج غير موجود' });
    }

    const image = req.file ? req.file.filename : product.image;

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

// حذف منتج
router.delete('/:id', (req, res) => {
  try {
    db.prepare('UPDATE products SET active = 0 WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'تم حذف المنتج' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;