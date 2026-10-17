const express = require('express');
const router = express.Router();
const db = require('../database');

// إنشاء فاتورة بيع جديدة
router.post('/', async (req, res) => {
  try {
    const { items, discount, coupon_code, payment_method, customer_name, customer_phone, customer_email, customer_address, customer_notes, delivery_type, delivery_cost, tax, sale_type } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'لا توجد منتجات في الفاتورة' });
    }

    let total = 0;
    items.forEach(item => { total += item.price * item.quantity; });
    const taxAmount = tax !== undefined ? parseFloat(tax) : (total * 0.05);
    const deliveryAmount = delivery_cost !== undefined ? parseFloat(delivery_cost) : 0;
    const discountAmount = parseFloat(discount) || 0;
    const finalTotal = total + taxAmount + deliveryAmount - discountAmount;
    const invoiceNumber = 'INV-' + Date.now();

    let fullNotes = '';
    if (customer_notes) fullNotes += customer_notes;
    if (delivery_type) fullNotes += (fullNotes ? ' | ' : '') + `التوصيل: ${delivery_type === 'home' ? 'للمنزل' : 'للمكتب'}`;
    if (deliveryAmount > 0) fullNotes += (fullNotes ? ' | ' : '') + `تكلفة التوصيل: ${deliveryAmount.toFixed(3)} ر.ع`;
    if (taxAmount > 0) fullNotes += (fullNotes ? ' | ' : '') + `الضريبة: ${taxAmount.toFixed(3)} ر.ع`;
    if (customer_email) fullNotes += (fullNotes ? ' | ' : '') + `الإيميل: ${customer_email}`;

    const saleResult = await db.prepare(`
      INSERT INTO sales (invoice_number, total, discount, final_total, payment_method, coupon_code, customer_name, customer_phone, customer_address, customer_notes, sale_type, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
    `).run(invoiceNumber, total, discountAmount, finalTotal, payment_method || 'cash', coupon_code || null, customer_name || null, customer_phone || null, customer_address || null, fullNotes || null, sale_type || 'online', sale_type === 'online' ? 'pending' : 'completed');

    const saleId = saleResult.lastInsertRowid;
    const insertItem = db.prepare(`INSERT INTO sale_items (sale_id, product_id, product_name, price, quantity, subtotal) VALUES (?, ?, ?, ?, ?, ?)`);
    const updateStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');

    for (const item of items) {
      await insertItem.run(saleId, item.product_id, item.product_name, item.price, item.quantity, item.price * item.quantity);
      await updateStock.run(item.quantity, item.product_id);
    }

    if (coupon_code) {
      await db.prepare('UPDATE coupons SET used_count = used_count + 1 WHERE code = ?').run(coupon_code);
    }

    res.json({ success: true, message: 'تم إنشاء الفاتورة بنجاح', sale_id: saleId, invoice_number: invoiceNumber, final_total: finalTotal });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// جلب كل الفواتير
router.get('/', async (req, res) => {
  try {
    const { type } = req.query;
    let query = 'SELECT * FROM sales';
    if (type === 'online') query += " WHERE sale_type = 'online'";
    else if (type === 'cashier') query += " WHERE sale_type = 'cashier'";
    query += ' ORDER BY id DESC LIMIT 200';
    const sales = await db.prepare(query).all();
    res.json({ success: true, sales });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// جلب الطلبات الأونلاين
router.get('/online', async (req, res) => {
  try {
    const orders = await db.prepare(`SELECT * FROM sales WHERE sale_type = 'online' ORDER BY CASE status WHEN 'pending' THEN 1 WHEN 'confirmed' THEN 2 WHEN 'completed' THEN 3 WHEN 'cancelled' THEN 4 END, id DESC`).all();
    res.json({ success: true, orders });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// جلب تفاصيل طلب واحد
router.get('/:id', async (req, res) => {
  try {
    const sale = await db.prepare('SELECT * FROM sales WHERE id = ?').get(req.params.id);
    if (!sale) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    const items = await db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(req.params.id);
    res.json({ success: true, sale, items });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// تحديث حالة الطلب
router.put('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['pending', 'confirmed', 'completed', 'cancelled'];
    if (!allowed.includes(status)) return res.status(400).json({ success: false, message: 'حالة غير صحيحة' });
    await db.prepare('UPDATE sales SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ success: true, message: 'تم تحديث الحالة' });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

module.exports = router;