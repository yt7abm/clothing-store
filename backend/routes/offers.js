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
    folder: 'clothing-store/offers',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [{ width: 800, height: 800, crop: 'limit' }]
  }
});

const upload = multer({ storage });

// ========================================
// جلب كل العروضات (للمدير)
// ========================================
router.get('/', (req, res) => {
  try {
    const offers = db.prepare(`
      SELECT * FROM offers 
      ORDER BY display_order ASC, id DESC
    `).all();

    // تحويل product_ids من JSON
    const formatted = offers.map(o => ({
      ...o,
      product_ids: JSON.parse(o.product_ids || '[]')
    }));

    res.json({ success: true, offers: formatted });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// جلب العروضات النشطة (للواجهة)
// ========================================
router.get('/active', (req, res) => {
  try {
    const offers = db.prepare(`
      SELECT * FROM offers 
      WHERE active = 1
      ORDER BY display_order ASC, id DESC
      LIMIT 6
    `).all();

    // جلب تفاصيل المنتجات لكل عرض
    const formatted = offers.map(o => {
      const productIds = JSON.parse(o.product_ids || '[]');
      let products = [];
      
      if (productIds.length > 0) {
        const placeholders = productIds.map(() => '?').join(',');
        products = db.prepare(`
          SELECT p.*, c.name as category_name
          FROM products p
          LEFT JOIN categories c ON p.category_id = c.id
          WHERE p.id IN (${placeholders}) AND p.active = 1
        `).all(...productIds);
      }

      return {
        ...o,
        product_ids: productIds,
        products
      };
    });

    res.json({ success: true, offers: formatted });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// جلب عرض واحد
// ========================================
router.get('/:id', (req, res) => {
  try {
    const offer = db.prepare('SELECT * FROM offers WHERE id = ?').get(req.params.id);
    
    if (!offer) {
      return res.status(404).json({ success: false, message: 'العرض غير موجود' });
    }

    const productIds = JSON.parse(offer.product_ids || '[]');
    let products = [];

    if (productIds.length > 0) {
      const placeholders = productIds.map(() => '?').join(',');
      products = db.prepare(`
        SELECT p.*, c.name as category_name
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.id IN (${placeholders})
      `).all(...productIds);
    }

    res.json({ 
      success: true, 
      offer: { ...offer, product_ids: productIds, products } 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// إضافة عرض جديد
// ========================================
router.post('/', upload.single('image'), (req, res) => {
  try {
    const { 
      title, description, original_price, offer_price, product_ids, display_order 
    } = req.body;

    if (!title || !offer_price) {
      return res.status(400).json({ 
        success: false, 
        message: 'العنوان وسعر العرض مطلوبان' 
      });
    }

    // معالجة product_ids (مصفوفة أو نص JSON)
    let idsArray = [];
    if (product_ids) {
      if (typeof product_ids === 'string') {
        try {
          idsArray = JSON.parse(product_ids);
        } catch (e) {
          idsArray = product_ids.split(',').map(id => parseInt(id.trim())).filter(Boolean);
        }
      } else if (Array.isArray(product_ids)) {
        idsArray = product_ids.map(id => parseInt(id)).filter(Boolean);
      }
    }

    const image = req.file ? req.file.path : null;

    const result = db.prepare(`
      INSERT INTO offers (
        title, description, image, original_price, offer_price, 
        product_ids, display_order, active
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      title,
      description || null,
      image,
      original_price || 0,
      offer_price,
      JSON.stringify(idsArray),
      display_order || 0
    );

    res.json({ 
      success: true, 
      message: 'تم إضافة العرض بنجاح', 
      id: result.lastInsertRowid 
    });
  } catch (error) {
    console.error('خطأ في إضافة العرض:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// تعديل عرض
// ========================================
router.put('/:id', upload.single('image'), (req, res) => {
  try {
    const { 
      title, description, original_price, offer_price, product_ids, 
      display_order, active 
    } = req.body;

    const offer = db.prepare('SELECT * FROM offers WHERE id = ?').get(req.params.id);
    if (!offer) {
      return res.status(404).json({ success: false, message: 'العرض غير موجود' });
    }

    // معالجة product_ids
    let idsArray = JSON.parse(offer.product_ids || '[]');
    if (product_ids !== undefined) {
      if (typeof product_ids === 'string') {
        try {
          idsArray = JSON.parse(product_ids);
        } catch (e) {
          idsArray = product_ids.split(',').map(id => parseInt(id.trim())).filter(Boolean);
        }
      } else if (Array.isArray(product_ids)) {
        idsArray = product_ids.map(id => parseInt(id)).filter(Boolean);
      }
    }

    const image = req.file ? req.file.path : offer.image;

    db.prepare(`
      UPDATE offers 
      SET title = ?, description = ?, image = ?, 
          original_price = ?, offer_price = ?, product_ids = ?,
          display_order = ?, active = ?
      WHERE id = ?
    `).run(
      title !== undefined ? title : offer.title,
      description !== undefined ? description : offer.description,
      image,
      original_price !== undefined ? original_price : offer.original_price,
      offer_price !== undefined ? offer_price : offer.offer_price,
      JSON.stringify(idsArray),
      display_order !== undefined ? display_order : offer.display_order,
      active !== undefined ? active : offer.active,
      req.params.id
    );

    res.json({ success: true, message: 'تم تعديل العرض بنجاح' });
  } catch (error) {
    console.error('خطأ في تعديل العرض:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// تفعيل/تعطيل عرض
// ========================================
router.put('/:id/toggle', (req, res) => {
  try {
    const offer = db.prepare('SELECT * FROM offers WHERE id = ?').get(req.params.id);
    if (!offer) {
      return res.status(404).json({ success: false, message: 'العرض غير موجود' });
    }

    const newStatus = offer.active === 1 ? 0 : 1;
    db.prepare('UPDATE offers SET active = ? WHERE id = ?').run(newStatus, req.params.id);

    res.json({ 
      success: true, 
      message: newStatus === 1 ? 'تم تفعيل العرض' : 'تم تعطيل العرض',
      active: newStatus
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// حذف عرض
// ========================================
router.delete('/:id', (req, res) => {
  try {
    const offer = db.prepare('SELECT * FROM offers WHERE id = ?').get(req.params.id);
    if (!offer) {
      return res.status(404).json({ success: false, message: 'العرض غير موجود' });
    }

    db.prepare('DELETE FROM offers WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'تم حذف العرض' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;