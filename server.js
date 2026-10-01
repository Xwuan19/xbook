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
const path = require('path');
const { db } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

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
    const books = await db.getAllBooks();
    const settings = await db.getSettings();
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
    const { bookId, courseId, quantity, customerName, customerClass, customerPhone, note } = req.body;
    
    // Ràng buộc bắt buộc họ và tên đầy đủ (tối thiểu 2 từ)
    const nameWords = (customerName || '').trim().split(/\s+/).filter(w => w.length > 0);
    if (nameWords.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập đầy đủ cả Họ và Tên (ví dụ: Nguyễn Văn An) để tìm tên phát sách trên lớp!"
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

    const selectedBookId = bookId || courseId;
    const book = await db.getBookById(selectedBookId);
    if (!book) {
      return res.status(400).json({ success: false, message: "Không tìm thấy cuốn sách này!" });
    }

    const qty = Math.max(1, parseInt(quantity) || 1);
    const totalAmount = book.price * qty;

    // Sinh mã đơn hàng duy nhất cho PayOS (Số nguyên)
    const orderCode = Number(String(Date.now()).slice(-6) + Math.floor(100 + Math.random() * 900));
    const transferDescription = `XB${orderCode}`;

    const paymentPayload = {
      orderCode: orderCode,
      amount: totalAmount,
      description: transferDescription,
      items: [
        {
          name: `${book.title.substring(0, 35)} (x${qty})`,
          quantity: qty,
          price: book.price
        }
      ],
      returnUrl: `${BASE_URL}/success.html?orderCode=${orderCode}`,
      cancelUrl: `${BASE_URL}/cancel.html?orderCode=${orderCode}`
    };

    const paymentResponse = await callPayOSCreatePaymentLink(paymentPayload);

    // Lưu vào database
    const order = await db.createOrder({
      orderCode: orderCode,
      bookId: book.id,
      bookTitle: book.title,
      quantity: qty,
      unitPrice: book.price,
      amount: totalAmount,
      customerName: customerName || 'Bạn cùng lớp',
      customerClass: customerClass || '',
      customerPhone: customerPhone || '',
      note: note || '',
      checkoutUrl: paymentResponse.checkoutUrl,
      qrCode: paymentResponse.qrCode
    });

    console.log(`\n Đã tạo mã QR PayOS cho: ${customerName} (${customerClass}) - ${qty}x "${book.title}" - ${totalAmount.toLocaleString('vi-VN')} đ (Mã: ${transferDescription})`);

    return res.json({
      success: true,
      data: {
        orderCode: order.orderCode,
        amount: order.amount,
        quantity: qty,
        bookTitle: book.title,
        customerName: order.customerName,
        customerClass: order.customerClass,
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
              bookTitle: paymentInfo.items?.[0]?.name || 'Sách giáo trình',
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

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123456';

function requireAdminAuth(req, res, next) {
  const password = req.headers['x-admin-password'] || req.query.adminPassword || req.body.adminPassword;
  if (!password || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: "Mật khẩu quản trị không chính xác!" });
  }
  next();
}

/**
 * 5. XÁC THỰC MẬT KHẨU QUẢN TRỊ VIÊN
 */
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password && password === ADMIN_PASSWORD) {
    return res.json({ success: true, message: "Xác thực quyền quản trị thành công!" });
  }
  return res.status(401).json({ success: false, message: "Mật khẩu quản trị không đúng!" });
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
 * 7. QUẢN TRỊ: BẬT / TẮT ĐĂNG KÝ (CHỐT SỔ ĐƠN HÀNG - YÊU CẦU MẬT KHẨU)
 */
app.post('/api/admin/toggle-registration', requireAdminAuth, async (req, res) => {
  try {
    const current = await db.getSettings();
    const updated = await db.updateSettings({
      isRegistrationOpen: !current.isRegistrationOpen
    });
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
 * 9. TEST GIẢ LẬP THANH TOÁN
 */
app.post('/api/test/simulate-payment', async (req, res) => {
  try {
    const { orderCode } = req.body;
    const order = await db.getOrderByCode(orderCode);
    if (!order) return res.status(404).json({ success: false, message: "Không tìm thấy đơn" });

    await db.updateOrderStatus(orderCode, 'PAID', {
      paidAt: new Date().toISOString(),
      reference: "TEST_" + Date.now()
    });

    res.json({ success: true, message: `Đã giả lập nộp tiền đơn #${orderCode}` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n Hệ thống XBook Bán Sách Cho Lớp đang chạy tại: ${BASE_URL}`);
});

module.exports = app;
