/**
 * ============================================================================
 * XBOOK - BACKEND HỆ THỐNG ĐẶT SÁCH CHO LỚP & THANH TOÁN PAYOS DYNAMIC QR
 * ============================================================================
 * Quy trình:
 *  1. Sinh viên vào web chọn sách & số lượng, nhập Họ tên, Lớp/MSSV
 *  2. PayOS sinh mã Dynamic VietQR chính xác từng đồng kèm mã đơn duy nhất (XB...)
 *  3. Sinh viên quét mã chuyển tiền trực tiếp vào tài khoản ngân hàng của bạn
 *  4. PayOS bắt biến động số dư và gửi Webhook về Backend
 *  5. Backend xác thực chữ ký số, đối soát số tiền và ghi nhận "Đã thanh toán"
 *  6. Hệ thống thống kê tổng số sách cần lấy và cho phép bạn ĐÓNG / MỞ đăng ký (Chốt số lượng)
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { db } = require('./database');
const domain = require('./public/domain');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================================
// PWA: manifest + service worker (để "Thêm vào Màn hình chính" trên iPhone chạy
// như app thật: mở toàn màn hình, có icon riêng, và dùng được khi mạng chập chờn)
// ============================================================================
function sendPublicFile(res, filename, contentType, extraHeaders = {}) {
  const filePath = path.join(__dirname, 'public', filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  res.setHeader('Content-Type', contentType);
  for (const [key, value] of Object.entries(extraHeaders)) res.setHeader(key, value);
  return res.sendFile(filePath);
}

app.get('/manifest.webmanifest', (req, res) =>
  sendPublicFile(res, 'manifest.webmanifest', 'application/manifest+json', {
    'Cache-Control': 'public, max-age=3600'
  })
);

// Service worker phải nằm ở gốc site để điều khiển toàn bộ phạm vi "/" — không cache file này.
app.get('/sw.js', (req, res) =>
  sendPublicFile(res, 'sw.js', 'application/javascript; charset=utf-8', {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Service-Worker-Allowed': '/'
  })
);

// ============================================================================
// TRANG QUẢN TRỊ RIÊNG: /admin.html (route /admin chuyển hướng sang)
// Toàn bộ giao diện quản lý đã tách khỏi trang chủ nên admin có 1 trang riêng,
// vào bằng /admin, /admin/ hay /admin.html đều được.
// ============================================================================
app.get(['/admin', '/admin/'], (req, res) => res.redirect(302, '/admin.html'));

app.use(express.static(path.join(__dirname, 'public')));

// Thư mục chứa ảnh bìa sách đã upload (Quản lý sách)
// Trên serverless (Vercel), hệ thống file gốc là read-only nên dùng /tmp/uploads
const UPLOADS_DIR = process.env.VERCEL
  ? path.join('/tmp', 'uploads')
  : path.join(__dirname, 'uploads');

try {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
} catch (err) {
  console.warn("Lưu ý: Không thể tạo thư mục uploads cục bộ:", err.message);
}

app.use('/uploads', express.static(UPLOADS_DIR));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `book-cover-${Date.now()}-${Math.floor(Math.random() * 1000)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 }, // tối đa 3MB
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error("Tệp phải là ảnh (JPG/PNG/WebP/GIF)"));
  }
});

// ============================================================================
// KHỞI TẠO PAYOS SDK
// ============================================================================
let payos = null;
const PAYOS_CLIENT_ID = process.env.PAYOS_CLIENT_ID;
const PAYOS_API_KEY = process.env.PAYOS_API_KEY;
const PAYOS_CHECKSUM_KEY = process.env.PAYOS_CHECKSUM_KEY;

const isPayOSConfigured = 
  PAYOS_CLIENT_ID && 
  PAYOS_CLIENT_ID !== 'your_client_id_here' &&
  PAYOS_API_KEY && 
  PAYOS_API_KEY !== 'your_api_key_here';

if (isPayOSConfigured) {
  try {
    const PayOSPackage = require('@payos/node');
    const PayOS = PayOSPackage.PayOS || PayOSPackage;
    try {
      payos = new PayOS({
        clientId: PAYOS_CLIENT_ID,
        apiKey: PAYOS_API_KEY,
        checksumKey: PAYOS_CHECKSUM_KEY
      });
    } catch (err) {
      payos = new PayOS(PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY);
    }
    console.log(" [PayOS] Đã kết nối SDK PayOS thành công!");
  } catch (error) {
    console.warn(" [PayOS] Cảnh báo khi nạp SDK:", error.message);
  }
} else {
  console.log(" [PayOS] Đang chạy chế độ Demo mô phỏng (Chưa điền key thật trong .env).");
}

async function callPayOSCreatePaymentLink(paymentData) {
  if (!payos) {
    // Demo Mode khi bạn chưa dán key thật
    return {
      orderCode: paymentData.orderCode,
      amount: paymentData.amount,
      description: paymentData.description,
      accountNumber: "0123456789",
      accountName: "LE VAN QUYEN - XBOOK",
      bin: "970422", // MBBank
      checkoutUrl: `${BASE_URL}/mock-checkout.html?orderCode=${paymentData.orderCode}&amount=${paymentData.amount}`,
      qrCode: `00020101021238540010A00000072701240006970422011001234567890208QRIBFTTA5303704540${paymentData.amount}5802VN62180814${paymentData.description}6304ABCD`,
      status: "PENDING"
    };
  }

  if (payos.paymentRequests && typeof payos.paymentRequests.create === 'function') {
    return await payos.paymentRequests.create(paymentData);
  }
  if (typeof payos.createPaymentLink === 'function') {
    return await payos.createPaymentLink(paymentData);
  }
  throw new Error("Không tìm thấy hàm createPaymentLink trên SDK PayOS");
}

function verifyPayOSWebhook(webhookBody) {
  if (!payos) {
    return webhookBody?.data || webhookBody;
  }
  if (payos.webhooks && typeof payos.webhooks.verify === 'function') {
    return payos.webhooks.verify(webhookBody);
  }
  if (typeof payos.verifyPaymentWebhookData === 'function') {
    return payos.verifyPaymentWebhookData(webhookBody);
  }
  throw new Error("Không tìm thấy hàm verify Webhook trên SDK PayOS");
}

// ============================================================================
// API ROUTES
// ============================================================================

/**
 * 1. LẤY DANH SÁCH SÁCH & TRẠNG THÁI ĐĂNG KÝ
 */
app.get('/api/books', async (req, res) => {
  try {
    // Gọi DB SONG SONG: với Neon (1 request HTTP/query) thời gian chờ giảm ~một nửa
    const [books, settings] = await Promise.all([db.getAllBooks(), db.getSettings()]);
    res.json({ success: true, books, settings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Alias cho frontend cũ nếu còn gọi /api/courses
app.get('/api/courses', async (req, res) => {
  try {
    const books = await db.getAllBooks();
    res.json({ success: true, data: books });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * 2. TẠO ĐƠN ĐẶT SÁCH & SINH MÃ DYNAMIC VIETQR
 */
app.post('/api/orders/create-payment-link', async (req, res) => {
  try {
    const { bookId, courseId, quantity, items: rawItems, customerName, customerClass, customerDepartment, customerPhone, note, deliveryDate } = req.body;
    
    if (deliveryDate) {
      const cleanDate = String(deliveryDate).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate) || Number.isNaN(Date.parse(cleanDate)) || new Date(cleanDate).toISOString().slice(0, 10) !== cleanDate) {
        return res.status(400).json({ success: false, message: 'Ngày nhận sách không hợp lệ!' });
      }
    }
    // BẮT BUỘC 1: Họ và Tên đầy đủ (tối thiểu 2 từ) để tìm tên khi phát sách trên lớp
    const nameWords = (customerName || '').trim().split(/\s+/).filter(w => w.length > 0);
    if (nameWords.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập đầy đủ cả Họ và Tên (ví dụ: Nguyễn Văn An) để tìm tên phát sách trên lớp!"
      });
    }

    // BẮT BUỘC 2: Số điện thoại Việt Nam hợp lệ (bỏ khoảng trắng/dấu chấm, +84 → 0)
    const phone = String(customerPhone || '').replace(/[\s.\-()]/g, '').replace(/^\+?84/, '0');
    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập số điện thoại để liên hệ khi phát sách!"
      });
    }
    if (!/^0\d{9}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Số điện thoại chưa đúng định dạng (10 số, ví dụ: 0987 654 321)!"
      });
    }

    // Kiểm tra xem đã chốt sổ chưa
    const settings = await db.getSettings();
    if (!settings.isRegistrationOpen) {
      return res.status(400).json({
        success: false,
        message: settings.closeMessage || "Đã chốt danh sách mua sách đợt này. Tạm dừng nhận đăng ký mới!"
      });
    }

    // BẮT BUỘC 3: Lớp học — phải chọn đúng lớp trong danh sách khoa/lớp do quản trị khai báo
    if ((settings.classes || []).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Hệ thống chưa mở lớp nào. Vui lòng liên hệ quản trị viên để được thêm khoa & lớp trước khi mua sách!"
      });
    }
    if (!customerClass) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn lớp học của bạn!' });
    }
    const matches = settings.classes.filter(c => c.name === customerClass && (!customerDepartment || c.department === customerDepartment));
    if (matches.length !== 1) return res.status(400).json({ success: false, message: 'Vui lòng chọn đúng khoa và lớp của bạn.' });
    const selectedClass = matches[0];

    // Hỗ trợ 2 định dạng:
    //  - MỚI: items = [{ bookId, quantity }, ...] → 1 người mua nhiều cuốn khác nhau trong 1 đơn
    //  - CŨ:  bookId + quantity (1 cuốn)
    let requestedItems = Array.isArray(rawItems) ? rawItems : [];
    if (requestedItems.length === 0) {
      requestedItems = [{ bookId: bookId || courseId, quantity }];
    }

    const items = [];
    for (const raw of requestedItems) {
      const book = await db.getBookById(raw.bookId);
      if (!book) {
        return res.status(400).json({ success: false, message: `Không tìm thấy sách (mã: ${raw.bookId})!` });
      }
      const qty = Math.max(1, Math.min(50, parseInt(raw.quantity) || 1));
      items.push({
        bookId: book.id,
        bookTitle: book.title,
        quantity: qty,
        unitPrice: book.price
      });
    }
    if (items.length === 0) {
      return res.status(400).json({ success: false, message: "Giỏ hàng đang trống. Vui lòng chọn sách!" });
    }

    const totalQuantity = items.reduce((sum, it) => sum + it.quantity, 0);
    const totalAmount = items.reduce((sum, it) => sum + it.unitPrice * it.quantity, 0);
    const bookTitleSummary = items.map(it => it.bookTitle).join(', ');

    // Sinh mã đơn hàng duy nhất cho PayOS (Số nguyên)
    const orderCode = Number(String(Date.now()).slice(-6) + Math.floor(100 + Math.random() * 900));
    const transferDescription = `XB${orderCode}`;

    const paymentPayload = {
      orderCode: orderCode,
      amount: totalAmount,
      description: transferDescription,
      items: items.map(it => ({
        name: `${it.bookTitle.substring(0, 40)} (x${it.quantity})`.substring(0, 60),
        quantity: it.quantity,
        price: it.unitPrice
      })),
      returnUrl: `${BASE_URL}/success.html?orderCode=${orderCode}`,
      cancelUrl: `${BASE_URL}/cancel.html?orderCode=${orderCode}`
    };

    const paymentResponse = await callPayOSCreatePaymentLink(paymentPayload);

    // Lưu vào database
    const order = await db.createOrder({
      orderCode: orderCode,
      items: items,
      bookTitle: bookTitleSummary,
      quantity: totalQuantity,
      amount: totalAmount,
      customerName: customerName || 'Bạn cùng lớp',
      customerClass: selectedClass.name,
      customerDepartment: selectedClass.department,
      customerPhone: phone,
      note: note || '',
      deliveryDate: (deliveryDate && String(deliveryDate).trim()) || settings.deliveryDate || '',
      checkoutUrl: paymentResponse.checkoutUrl,
      qrCode: paymentResponse.qrCode
    });

    console.log(`\n Đã tạo mã QR PayOS cho: ${customerName} (${selectedClass.department} / ${selectedClass.name}) - ${totalQuantity} cuốn [${bookTitleSummary}] - ${totalAmount.toLocaleString('vi-VN')} đ (Mã: ${transferDescription})`);

    return res.json({
      success: true,
      data: {
        orderCode: order.orderCode,
        amount: order.amount,
        quantity: totalQuantity,
        bookTitle: bookTitleSummary,
        items: order.items,
        customerName: order.customerName,
        customerClass: order.customerClass,
        customerDepartment: order.customerDepartment,
        deliveryAt: order.deliveryAt,
        checkoutUrl: paymentResponse.checkoutUrl,
        qrCode: paymentResponse.qrCode,
        accountName: paymentResponse.accountName || "LE VAN QUYEN - XBOOK",
        accountNumber: paymentResponse.accountNumber || "0123456789",
        bin: paymentResponse.bin || "970422",
        description: transferDescription
      }
    });

  } catch (error) {
    console.error("Lỗi khi tạo đơn PayOS:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * 3. TRA CỨU TRẠNG THÁI ĐƠN HÀNG (REALTIME POLLING + ĐỒNG BỘ TRỰC TIẾP TỪ PAYOS)
 */
app.get('/api/orders/:orderCode', async (req, res) => {
  try {
    const orderCode = Number(req.params.orderCode);
    let order = await db.getOrderByCode(orderCode);

    // NẾU CHƯA PAID, CHỦ ĐỘNG HỎI TRỰC TIẾP PAYOS SERVER XEM TIỀN ĐÃ VỀ CHƯA!
    if (!order || order.status !== 'PAID') {
      try {
        let paymentInfo = null;
        if (payos && payos.paymentRequests && typeof payos.paymentRequests.get === 'function') {
          paymentInfo = await payos.paymentRequests.get(orderCode);
        } else if (payos && typeof payos.getPaymentLinkInformation === 'function') {
          paymentInfo = await payos.getPaymentLinkInformation(orderCode);
        }

        if (paymentInfo && (paymentInfo.status === 'PAID' || paymentInfo.status === 'COMPLETED')) {
          if (order) {
            order = await db.updateOrderStatus(orderCode, 'PAID', {
              paidAt: new Date().toISOString(),
              reference: paymentInfo.id || 'PAYOS_SYNC'
            });
          } else {
            order = await db.createOrder({
              orderCode: orderCode,
              status: 'PAID',
              bookTitle: paymentInfo.items?.[0]?.name || 'Sách',
              quantity: paymentInfo.items?.[0]?.quantity || 1,
              amount: paymentInfo.amount,
              unitPrice: paymentInfo.amount,
              customerName: paymentInfo.buyerName || 'Sinh viên',
              customerPhone: paymentInfo.buyerPhone || '',
              note: '',
              isDelivered: false,
              paidAt: new Date().toISOString()
            });
            await db.updateOrderStatus(orderCode, 'PAID');
          }
          console.log(`[SYNC PAYOS] Đã xác nhận đơn #${orderCode} đã thanh toán thành công từ PayOS!`);
        }
      } catch (err) {
        // Khi chưa thanh toán hoặc chưa tìm thấy đơn trên PayOS
      }
    }

    if (!order) {
      return res.status(404).json({ success: false, message: "Không tìm thấy đơn hàng!" });
    }

    return res.json({
      success: true,
      data: {
        orderCode: order.orderCode,
        status: order.status,
        bookTitle: order.bookTitle,
        quantity: order.quantity,
        amount: order.amount,
        customerName: order.customerName,
        customerClass: order.customerClass,
        customerDepartment: order.customerDepartment,
        deliveryAt: order.deliveryAt,
        paidAt: order.paidAt
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * 4. XỬ LÝ WEBHOOK TỪ PAYOS KHI TIỀN VỀ TÀI KHOẢN NGÂN HÀNG
 */
const handlePayOSWebhook = async (req, res) => {
  try {
    const webhookBody = req.body;
    if (!webhookBody) {
      return res.status(200).json({ success: true, message: "Empty body" });
    }

    // Trường hợp kiểm tra test kết nối từ PayOS Dashboard
    if (webhookBody.webhookUrl || (req.query && req.query.test)) {
      return res.json({ success: true, message: "Webhook URL hợp lệ" });
    }

    // Xác thực chữ ký số bằng Checksum Key
    let verifiedData;
    try {
      verifiedData = verifyPayOSWebhook(webhookBody);
    } catch (err) {
      console.error(" [BẢO MẬT] Chữ ký Webhook không hợp lệ:", err.message);
      if (webhookBody.data?.description?.includes('Mã xác nhận')) {
        return res.json({ success: true, message: "Webhook URL hợp lệ" });
      }
      return res.status(400).json({ success: false, message: "Chữ ký số không hợp lệ" });
    }

    // Trường hợp mã test xác nhận từ PayOS Dashboard
    if (verifiedData.description && verifiedData.description.includes('Mã xác nhận')) {
      return res.json({ success: true, message: "Webhook URL hợp lệ" });
    }

    const { orderCode, amount, reference, accountNumber, transactionDateTime } = verifiedData;

    const order = await db.getOrderByCode(orderCode);
    if (!order) {
      console.warn(`Webhook: Không tìm thấy đơn #${orderCode}`);
      return res.status(200).json({ success: false, message: "Đơn không tồn tại" });
    }

    // Đối soát số tiền
    if (Number(order.amount) !== Number(amount)) {
      console.error(` Sai lệch số tiền đơn #${orderCode}: Cần ${order.amount}, nhận ${amount}`);
      return res.status(400).json({ success: false, message: "Số tiền không khớp" });
    }

    // Idempotency: Đã xử lý rồi thì bỏ qua
    if (order.status === 'PAID') {
      return res.status(200).json({ success: true, message: "Đã xử lý trước đó" });
    }

    // Đánh dấu đã thanh toán thành công
    await db.updateOrderStatus(orderCode, 'PAID', {
      paidAt: transactionDateTime || new Date().toISOString(),
      reference,
      accountNumber
    });

    await db.saveTransaction({
      orderCode,
      reference,
      amount,
      description: verifiedData.description || '',
      accountNumber,
      transactionDateTime,
      counterAccountBankId: verifiedData.counterAccountBankId || '',
      counterAccountName: verifiedData.counterAccountName || '',
      counterAccountNumber: verifiedData.counterAccountNumber || ''
    });

    console.log(`\n TIỀN ĐÃ VỀ TÀI KHOẢN! Đã xác nhận thanh toán đơn #${orderCode}`);
    console.log(`- Bạn: ${order.customerName}`);
    console.log(`- Sách: ${order.quantity}x "${order.bookTitle}"`);
    console.log(`- Số tiền nhận được: ${amount.toLocaleString('vi-VN')} đ\n`);

    return res.status(200).json({ success: true, message: "Thanh toán thành công" });

  } catch (error) {
    console.error("Lỗi Webhook:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

app.post('/api/payos-webhook', handlePayOSWebhook);
app.post('/api/orders/webhook', handlePayOSWebhook);
app.post('/api/webhook', handlePayOSWebhook);

// CHẾ ĐỘ DEMO (chưa gắn key PayOS thật): cho phép xác nhận thanh toán mô phỏng để kiểm thử nội bộ.
// Khi đã gắn key PayOS thật (production), endpoint này KHÔNG tồn tại — 100% đối soát tiền thật qua Webhook.
if (!isPayOSConfigured) {
  app.post('/api/test/simulate-payment', async (req, res) => {
    try {
      const code = Number(req.body.orderCode);
      const order = await db.getOrderByCode(code);
      if (!order) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng!' });
      if (order.status === 'PAID') return res.json({ success: true, message: 'Đã xử lý trước đó' });
      const updated = await db.updateOrderStatus(code, 'PAID', {
        paidAt: new Date().toISOString(),
        reference: 'DEMO_SIMULATED'
      });
      console.log(` [DEMO] Mô phỏng thanh toán thành công đơn #${code}`);
      res.json({ success: true, order: updated });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });
}

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123456';

// ============================================================================
// PHIÊN ĐĂNG NHẬP QUẢN TRỊ (không cần nhập lại mật khẩu khi mở lại web)
// Token tự chứa hạn dùng + chữ ký HMAC → hoạt động cả trên Vercel Serverless
// (không phụ thuộc bộ nhớ của từng instance). Đổi mật khẩu = mọi token cũ hết hiệu lực.
// ============================================================================
const ADMIN_SESSION_DAYS = Math.max(1, Number(process.env.ADMIN_SESSION_DAYS || 30));
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || ADMIN_PASSWORD;

function issueAdminToken() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + ADMIN_SESSION_DAYS * 86400000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', ADMIN_SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifyAdminToken(token) {
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature) return false;
  const expected = crypto.createHmac('sha256', ADMIN_SESSION_SECRET).update(payload).digest('base64url');
  const given = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !crypto.timingSafeEqual(given, wanted)) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number(exp) > Date.now();
  } catch (err) {
    return false;
  }
}

function readAdminToken(req) {
  const raw = String(req.headers['x-admin-token'] || req.headers.authorization || '').trim();
  return raw.replace(/^Bearer\s+/i, '');
}

function readAdminPassword(req) {
  return req.headers['x-admin-password'] || req.query.adminPassword || (req.body && req.body.adminPassword);
}

function requireAdminAuth(req, res, next) {
  if (verifyAdminToken(readAdminToken(req))) return next();

  const password = readAdminPassword(req);
  if (password && password === ADMIN_PASSWORD) {
    // Gửi kèm token phiên để lần sau client không phải gửi mật khẩu nữa
    res.setHeader('x-admin-token', issueAdminToken());
    return next();
  }
  return res.status(401).json({ success: false, message: "Mật khẩu quản trị không chính xác!" });
}

/**
 * Gán 1 cuốn sách vào KHOA / LỚP (curriculum của lớp đó).
 * - Chọn cả khoa → mọi lớp của khoa đều cần cuốn này (VD: Khoa Kinh tế học Triết).
 * - Chỉ gọi khi client thực sự gửi lên classKeys/departments (tránh phá dữ liệu cũ).
 */
async function applyBookScope(bookId, body = {}) {
  if (!Array.isArray(body.classKeys) && !Array.isArray(body.departments)) return null;

  const settings = await db.getSettings();
  const departments = (Array.isArray(body.departments) ? body.departments : [])
    .map(d => String(d).trim()).filter(Boolean);
  const classKeys = (Array.isArray(body.classKeys) ? body.classKeys : []).map(String);

  const invalid = (message) => Object.assign(new Error(message), { status: 400 });
  const unknownDepartment = departments.find(d => !(settings.departments || []).includes(d));
  if (unknownDepartment) throw invalid(`Khoa không tồn tại: ${unknownDepartment}`);
  const knownKeys = new Set(domain.classes(settings.classes, settings.departments).map(domain.classKey));
  const unknownClass = classKeys.find(key => !knownKeys.has(key));
  if (unknownClass) throw invalid('Có lớp không tồn tại trong danh sách khoa / lớp.');

  const classes = domain.assignBookToClasses(
    domain.classes(settings.classes, settings.departments),
    bookId,
    { classKeys, departments }
  );
  return await db.updateSettings({ classes });
}

/**
 * 5. XÁC THỰC MẬT KHẨU QUẢN TRỊ VIÊN
 * Đăng nhập thành công → trả về token phiên (client tự chọn lưu 30 ngày hay chỉ phiên hiện tại)
 */
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (password && password === ADMIN_PASSWORD) {
    return res.json({
      success: true,
      message: "Xác thực quyền quản trị thành công!",
      token: issueAdminToken(),
      expiresInDays: ADMIN_SESSION_DAYS
    });
  }
  return res.status(401).json({ success: false, message: "Mật khẩu quản trị không đúng!" });
});

/** Đăng xuất: token tự chứa hạn dùng nên chỉ cần client xóa token đã lưu. */
app.post('/api/admin/logout', (req, res) => {
  res.json({ success: true, message: "Đã đăng xuất khỏi bảng quản trị." });
});

/**
 * 6. QUẢN TRỊ: THỐNG KÊ SỐ LƯỢNG ĐÃ THANH TOÁN (YÊU CẦU MẬT KHẨU)
 */
app.get('/api/admin/statistics', requireAdminAuth, async (req, res) => {
  try {
    const stats = await db.getStatistics();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Giữ lại endpoint reconciliation cũ để tương thích
app.get('/api/admin/reconciliation', requireAdminAuth, async (req, res) => {
  try {
    const stats = await db.getStatistics();
    res.json({
      success: true,
      summary: {
        totalOrders: stats.totalOrders,
        paidOrders: stats.paidOrdersCount,
        totalRevenue: stats.totalRevenue
      },
      orders: stats.allOrders,
      bookSummary: stats.bookSummary
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * 7. QUẢN TRỊ: BẬT / TẮT ĐĂNG KÝ (CHỐT SỔ - YÊU CẦU MẬT KHẨU)
 * Khi MỞ LẠI đăng ký: tự đặt "Ngày nhận sách" mặc định = NGÀY HÔM SAU
 * (VD: mở lại từ 07/10 → nhận sách 08/10). Admin có thể chỉnh lại ngày bất cứ lúc nào.
 */
app.post('/api/admin/toggle-registration', requireAdminAuth, async (req, res) => {
  try {
    const current = await db.getSettings();
    const patch = { isRegistrationOpen: !current.isRegistrationOpen };

    const updated = await db.updateSettings(patch);
    console.log(` Đã đổi trạng thái đăng ký: ${updated.isRegistrationOpen ? 'MỞ ĐĂNG KÝ' : 'ĐÃ ĐÓNG / CHỐT SỔ'}`);
    res.json({ success: true, settings: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * 8. QUẢN TRỊ: ĐÁNH DẤU ĐÃ PHÁT SÁCH (YÊU CẦU MẬT KHẨU)
 */
app.post('/api/admin/toggle-delivered', requireAdminAuth, async (req, res) => {
  try {
    const { orderCode } = req.body;
    const order = await db.toggleDeliveredStatus(orderCode);
    if (!order) return res.status(404).json({ success: false, message: "Không tìm thấy đơn" });
    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * 8b. QUẢN TRỊ: XÓA ĐƠN HÀNG (YÊU CẦU MẬT KHẨU)
 */
app.delete('/api/admin/orders/:orderCode', requireAdminAuth, async (req, res) => {
  try {
    const { orderCode } = req.params;
    const deleted = await db.deleteOrder(orderCode);
    if (!deleted) return res.status(404).json({ success: false, message: "Không tìm thấy đơn hàng để xóa!" });
    console.log(` [ADMIN] Đã xóa đơn hàng mã: ${orderCode}`);
    res.json({ success: true, message: "Đã xóa đơn hàng thành công!" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * 9. QUẢN TRỊ GIÁO TRÌNH: THÊM / SỬA / XÓA (PHÂN LOẠI KHOA & LỚP)
 */
function normalizeBookPayload(body) {
  return {
    title: (body.title || '').trim(),
    price: Number(body.price) || 0,
    author: (body.author || '').trim(),
    pages: Number(body.pages) || 0,
    year: (body.year || '').trim(),
    description: (body.description || '').trim(),
    cover: (body.cover || '').trim()
  };
}

app.post('/api/admin/books', requireAdminAuth, async (req, res) => {
  try {
    const payload = normalizeBookPayload(req.body || {});
    if (!payload.title) {
      return res.status(400).json({ success: false, message: "Vui lòng nhập tên sách!" });
    }
    if (payload.price <= 0) {
      return res.status(400).json({ success: false, message: "Vui lòng nhập giá sách hợp lệ!" });
    }
    const book = await db.createBook(payload);
    const settings = await applyBookScope(book.id, req.body || {});
    console.log(` [ADMIN] Đã thêm sách: "${book.title}"`);
    res.json({ success: true, book, settings: settings || undefined });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
});

app.put('/api/admin/books/:id', requireAdminAuth, async (req, res) => {
  try {
    const payload = normalizeBookPayload(req.body || {});
    if (!payload.title || payload.price <= 0) return res.status(400).json({ success: false, message: 'Vui lòng nhập tên và giá sách hợp lệ.' });
    const book = await db.updateBook(req.params.id, payload);
    if (!book) return res.status(404).json({ success: false, message: "Không tìm thấy sách!" });
    const settings = await applyBookScope(book.id, req.body || {});
    console.log(` [ADMIN] Đã cập nhật sách: "${book.title}"`);
    res.json({ success: true, book, settings: settings || undefined });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
});

app.delete('/api/admin/books/:id', requireAdminAuth, async (req, res) => {
  try {
    const deleted = await db.deleteBook(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: "Không tìm thấy sách!" });
    console.log(` [ADMIN] Đã xóa sách mã: ${req.params.id}`);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * 9b. QUẢN TRỊ: UPLOAD ẢNH BÌA SÁCH (YÊU CẦU MẬT KHẨU)
 */
app.post('/api/admin/upload', requireAdminAuth, (req, res) => {
  upload.single('cover')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message || "Không upload được ảnh!" });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Vui lòng chọn 1 tệp ảnh để upload!" });
    }
    const url = `/uploads/${req.file.filename}`;
    console.log(` [ADMIN] Đã upload ảnh bìa: ${url}`);
    return res.json({ success: true, url });
  });
});

/**
 * 10. QUẢN TRỊ: CẬP NHẬT SETTINGS (DANH SÁCH KHOA, DANH SÁCH LỚP, THÔNG BÁO CHỐT SỔ,
 * NGÀY NHẬN SÁCH + LƯU Ý THỜI GIAN GIAO)
 */
app.put('/api/admin/settings', requireAdminAuth, async (req, res) => {
  try {
    const patch = {};
    if (Array.isArray(req.body.departments)) {
      patch.departments = req.body.departments.map(d => String(d).trim()).filter(Boolean);
    }
    if (Array.isArray(req.body.classes)) {
      if (req.body.classes.some(c => typeof c !== 'object' || !c || typeof c.name !== 'string' || !c.name.trim() || typeof c.department !== 'string' || !c.department.trim() || !Array.isArray(c.bookIds) || c.bookIds.some(id => typeof id !== 'string'))) {
        return res.status(400).json({ success: false, message: 'Mỗi lớp cần có tên, khoa và danh sách bookIds.' });
      }
      patch.classes = domain.classes(req.body.classes, req.body.departments || (await db.getSettings()).departments);
      const departments = patch.departments || (await db.getSettings()).departments;
      if (patch.classes.some(c => !departments.includes(c.department))) return res.status(400).json({ success: false, message: 'Lớp phải thuộc một khoa đã khai báo.' });
    }
    if (req.body.closeMessage !== undefined) {
      patch.closeMessage = String(req.body.closeMessage);
    }
    if (req.body.deliveryDate !== undefined) {
      patch.deliveryDate = String(req.body.deliveryDate || '').trim();
      if (patch.deliveryDate && (!/^\d{4}-\d{2}-\d{2}$/.test(patch.deliveryDate) || Number.isNaN(Date.parse(patch.deliveryDate)) || new Date(patch.deliveryDate).toISOString().slice(0, 10) !== patch.deliveryDate)) return res.status(400).json({ success: false, message: 'Ngày giao không hợp lệ.' });
    }
    if (req.body.deliveryNote !== undefined) {
      patch.deliveryNote = String(req.body.deliveryNote).trim();
    }
    const current = await db.getSettings();
    const departments = patch.departments || current.departments;
    const classes = patch.classes || domain.classes(current.classes, current.departments);
    const books = await db.getAllBooks();
    if (classes.some(c => !departments.includes(c.department))) {
      return res.status(400).json({ success: false, message: 'Khoa đang có lớp. Hãy xóa hoặc chuyển lớp trước khi xóa khoa.' });
    }
    const bookIds = new Set(books.map(b => b.id));
    if (patch.classes && classes.some(c => c.bookIds.some(id => !bookIds.has(id)))) {
      return res.status(400).json({ success: false, message: 'Danh sách sách của lớp chứa mã sách không tồn tại.' });
    }
    const updated = await db.updateSettings(patch);
    res.json({ success: true, settings: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n Hệ thống XBook Bán Sách Cho Lớp đang chạy tại: ${BASE_URL}`);
  });
}

module.exports = app;
