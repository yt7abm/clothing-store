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

// إعداد التخزين على Cloudinary للبانرات
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'clothing-store/banners',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [{ width: 1600, height: 600, crop: 'limit' }]
  }
});

const upload = multer({ storage });

// ========================================
// جلب كل البانرات (للمدير - كل البانرات)
// ========================================
router.get('/', (req, res) => {
  try {
    const banners = db.prepare(`
      SELECT * FROM banners 
      ORDER BY display_order ASC, id DESC
    `).all();
    res.json({ success: true, banners });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// جلب البانرات النشطة فقط (للواجهة الأمامية)
// ========================================
router.get('/active', (req, res) => {
  try {
    const banners = db.prepare(`
      SELECT * FROM banners 
      WHERE active = 1 
      ORDER BY display_order ASC, id DESC
      LIMIT 10
    `).all();
    res.json({ success: true, banners });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// جلب بانر واحد
// ========================================
router.get('/:id', (req, res) => {
  try {
    const banner = db.prepare('SELECT * FROM banners WHERE id = ?').get(req.params.id);
    if (!banner) {
      return res.status(404).json({ success: false, message: 'البانر غير موجود' });
    }
    res.json({ success: true, banner });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// إضافة بانر جديد
// ========================================
router.post('/', upload.single('image'), (req, res) => {
  try {
    const { title, link, display_order } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'الصورة مطلوبة' });
    }

    const image = req.file.path; // رابط Cloudinary الكامل

    const result = db.prepare(`
      INSERT INTO banners (title, image, link, display_order, active)
      VALUES (?, ?, ?, ?, 1)
    `).run(
      title || null,
      image,
      link || null,
      display_order || 0
    );

    res.json({ 
      success: true, 
      message: 'تم إضافة البانر بنجاح', 
      id: result.lastInsertRowid 
    });
  } catch (error) {
    console.error('خطأ في إضافة البانر:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// تعديل بانر
// ========================================
router.put('/:id', upload.single('image'), (req, res) => {
  try {
    const { title, link, display_order, active } = req.body;
    const banner = db.prepare('SELECT * FROM banners WHERE id = ?').get(req.params.id);
    
    if (!banner) {
      return res.status(404).json({ success: false, message: 'البانر غير موجود' });
    }

    // إذا تم رفع صورة جديدة، استخدمها، وإلا احتفظ بالقديمة
    const image = req.file ? req.file.path : banner.image;

    db.prepare(`
      UPDATE banners 
      SET title = ?, image = ?, link = ?, display_order = ?, active = ?
      WHERE id = ?
    `).run(
      title !== undefined ? title : banner.title,
      image,
      link !== undefined ? link : banner.link,
      display_order !== undefined ? display_order : banner.display_order,
      active !== undefined ? active : banner.active,
      req.params.id
    );

    res.json({ success: true, message: 'تم تعديل البانر بنجاح' });
  } catch (error) {
    console.error('خطأ في تعديل البانر:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// تفعيل/تعطيل بانر
// ========================================
router.put('/:id/toggle', (req, res) => {
  try {
    const banner = db.prepare('SELECT * FROM banners WHERE id = ?').get(req.params.id);
    if (!banner) {
      return res.status(404).json({ success: false, message: 'البانر غير موجود' });
    }

    const newStatus = banner.active === 1 ? 0 : 1;
    db.prepare('UPDATE banners SET active = ? WHERE id = ?').run(newStatus, req.params.id);

    res.json({ 
      success: true, 
      message: newStatus === 1 ? 'تم تفعيل البانر' : 'تم تعطيل البانر',
      active: newStatus
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// حذف بانر
// ========================================
router.delete('/:id', (req, res) => {
  try {
    const banner = db.prepare('SELECT * FROM banners WHERE id = ?').get(req.params.id);
    if (!banner) {
      return res.status(404).json({ success: false, message: 'البانر غير موجود' });
    }

    db.prepare('DELETE FROM banners WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'تم حذف البانر' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;