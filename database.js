/**
 * ============================================================================
 * DATABASE MODULE - XBOOK (HỆ THỐNG ĐẶT SÁCH CHO LỚP & PAYOS DYNAMIC QR)
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'data.json');

// Danh mục sách mặc định
const INITIAL_BOOKS = [
  {
    id: "sach-01",
    title: "Vật lí đại cương",
    price: 45000,
    author: "Giáo trình ĐH",
    pages: 220,
    description: "Giáo trình và tuyển tập bài tập Vật lí đại cương phục vụ học phần và thi kết thúc môn.",
    cover: "https://images.unsplash.com/photo-1636466497217-26a8cbeaf0aa?w=600&auto=format&fit=crop&q=80"
  },
  {
    id: "sach-02",
    title: "Đại số tuyến tính",
    price: 35000,
    author: "Giáo trình ĐH",
    pages: 180,
    description: "Giáo trình lý thuyết và bài tập giải mẫu Đại số tuyến tính chuẩn chương trình.",
    cover: "https://images.unsplash.com/photo-1509228468518-180dd4864904?w=600&auto=format&fit=crop&q=80"
  },
  {
    id: "sach-03",
    title: "Logic học (tài liệu học tập)",
    price: 30000,
    author: "Tài liệu học tập",
    pages: 140,
    description: "Tài liệu học tập & câu hỏi ôn tập môn Logic học đại cương cho lớp.",
    cover: "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=600&auto=format&fit=crop&q=80"
  }
];

class Database {
  constructor() {
    this.init();
  }

  init() {
    if (!fs.existsSync(DB_FILE)) {
      const defaultData = {
        settings: {
          isRegistrationOpen: true, // true = Mở cho đăng ký, false = Đã chốt sổ đóng đăng ký
          closeMessage: "Hiện đã chốt danh sách mua sách đợt này để gửi in. Tạm ngưng nhận đơn mới!"
        },
        books: INITIAL_BOOKS,
        orders: [],
        transactions: [],
        webhook_logs: []
      };
      fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2), 'utf-8');
    }
  }

  read() {
    try {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      const data = JSON.parse(content);
      // Đảm bảo tương thích ngược nếu data.json cũ dùng key 'courses'
      if (!data.books && data.courses) {
        data.books = data.courses;
      }
      if (!data.settings) {
        data.settings = {
          isRegistrationOpen: true,
          closeMessage: "Đã chốt danh sách mua sách đợt này. Tạm ngưng nhận đơn mới!"
        };
      }
      return data;
    } catch (e) {
      console.error("Lỗi khi đọc Database:", e);
      return {
        settings: { isRegistrationOpen: true, closeMessage: "" },
        books: INITIAL_BOOKS,
        orders: [],
        transactions: [],
        webhook_logs: []
      };
    }
  }

  write(data) {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
      return true;
    } catch (e) {
      console.error("Lỗi khi ghi Database:", e);
      return false;
    }
  }

  // --- SETTINGS (CHỐT SỔ ĐĂNG KÝ) ---
  getSettings() {
    const db = this.read();
    return db.settings || { isRegistrationOpen: true, closeMessage: "" };
  }

  updateSettings(newSettings) {
    const db = this.read();
    db.settings = { ...db.settings, ...newSettings };
    this.write(db);
    return db.settings;
  }

  // --- SÁCH ---
  getAllBooks() {
    const db = this.read();
    return db.books;
  }

  getBookById(bookId) {
    const db = this.read();
    return db.books.find(b => b.id === bookId);
  }

  // --- ĐƠN HÀNG ---
  createOrder(orderData) {
    const db = this.read();
    const newOrder = {
      orderCode: Number(orderData.orderCode), // Số nguyên duy nhất cho PayOS
      bookId: orderData.bookId,
      bookTitle: orderData.bookTitle,
      quantity: Number(orderData.quantity) || 1,
      unitPrice: Number(orderData.unitPrice),
      amount: Number(orderData.amount), // Số tiền chính xác
      customerName: orderData.customerName || 'Bạn cùng lớp',
      customerClass: orderData.customerClass || '', // Lớp hoặc Mã sinh viên
      customerPhone: orderData.customerPhone || '',
      note: orderData.note || '',
      status: 'PENDING', // PENDING -> PAID
      isDelivered: false, // Đã phát sách chưa (false = Chưa phát, true = Đã phát)
      checkoutUrl: orderData.checkoutUrl || '',
      qrCode: orderData.qrCode || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      paidAt: null
    };

    db.orders.push(newOrder);
    this.write(db);
    return newOrder;
  }

  getOrderByCode(orderCode) {
    const db = this.read();
    const code = Number(orderCode);
    return db.orders.find(o => o.orderCode === code);
  }

  updateOrderStatus(orderCode, status, additionalInfo = {}) {
    const db = this.read();
    const code = Number(orderCode);
    const orderIndex = db.orders.findIndex(o => o.orderCode === code);
    
    if (orderIndex === -1) return null;

    const order = db.orders[orderIndex];
    order.status = status;
    order.updatedAt = new Date().toISOString();

    if (status === 'PAID') {
      order.paidAt = additionalInfo.paidAt || new Date().toISOString();
      order.bankReference = additionalInfo.reference || '';
      order.accountNumber = additionalInfo.accountNumber || '';
    }

    db.orders[orderIndex] = order;
    this.write(db);
    return order;
  }

  // Đánh dấu đã phát sách cho bạn nào
  toggleDeliveredStatus(orderCode) {
    const db = this.read();
    const code = Number(orderCode);
    const order = db.orders.find(o => o.orderCode === code);
    if (order) {
      order.isDelivered = !order.isDelivered;
      this.write(db);
      return order;
    }
    return null;
  }

  // --- THỐNG KÊ ĐỂ BÁO SỐ LƯỢNG CHO CHÚ & PHÁT SÁCH ---
  getStatistics() {
    const db = this.read();
    const paidOrders = db.orders.filter(o => o.status === 'PAID');
    
    // Thống kê tổng số lượng từng loại sách đã thanh toán
    const bookSummary = {};
    db.books.forEach(b => {
      bookSummary[b.id] = {
        id: b.id,
        title: b.title,
        price: b.price,
        totalQuantity: 0,
        totalRevenue: 0
      };
    });

    paidOrders.forEach(o => {
      if (bookSummary[o.bookId]) {
        bookSummary[o.bookId].totalQuantity += (o.quantity || 1);
        bookSummary[o.bookId].totalRevenue += o.amount;
      } else {
        // Tương thích sách cũ
        bookSummary[o.bookId] = {
          id: o.bookId,
          title: o.bookTitle,
          price: o.amount,
          totalQuantity: 1,
          totalRevenue: o.amount
        };
      }
    });

    const totalRevenue = paidOrders.reduce((sum, o) => sum + o.amount, 0);
    const totalBooks = paidOrders.reduce((sum, o) => sum + (o.quantity || 1), 0);

    return {
      settings: db.settings,
      totalOrders: db.orders.length,
      paidOrdersCount: paidOrders.length,
      totalBooksPaid: totalBooks,
      totalRevenue: totalRevenue,
      bookSummary: Object.values(bookSummary),
      allOrders: db.orders
    };
  }

  // --- SAO KÊ & LOGS ---
  saveTransaction(transData) {
    const db = this.read();
    const transaction = {
      id: "TRANS_" + Date.now(),
      orderCode: Number(transData.orderCode),
      reference: transData.reference || '',
      amount: Number(transData.amount),
      description: transData.description || '',
      accountNumber: transData.accountNumber || '',
      transactionDateTime: transData.transactionDateTime || new Date().toISOString(),
      counterAccountBankId: transData.counterAccountBankId || '',
      counterAccountName: transData.counterAccountName || '',
      counterAccountNumber: transData.counterAccountNumber || '',
      createdAt: new Date().toISOString()
    };
    db.transactions.push(transaction);
    this.write(db);
    return transaction;
  }

  saveWebhookLog(logData) {
    const db = this.read();
    const log = {
      id: "LOG_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      orderCode: logData.orderCode ? Number(logData.orderCode) : null,
      isVerified: Boolean(logData.isVerified),
      signature: logData.signature || '',
      payload: logData.payload || null,
      error: logData.error || null,
      createdAt: new Date().toISOString()
    };
    db.webhook_logs.push(log);
    this.write(db);
    return log;
  }
}

module.exports = {
  db: new Database()
};
