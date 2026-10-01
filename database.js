/**
 * ============================================================================
 * DATABASE MODULE - XBOOK (HỆ THỐNG ĐẶT SÁCH CHO LỚP & PAYOS DYNAMIC QR)
 * HỖ TRỢ HYBRID: NEON POSTGRESQL (CLOUD) & LOCAL JSON FILE FALLBACK
 * ============================================================================
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'data.json');

// Danh mục sách mặc định (Chính xác 3 cuốn sách của lớp)
const INITIAL_BOOKS = [
  {
    id: "sach-01",
    title: "Vật lí đại cương",
    price: 47000,
    author: "Giáo trình ĐH",
    pages: 220,
    description: "Giáo trình và tuyển tập bài tập Vật lí đại cương phục vụ học phần và thi kết thúc môn.",
    cover: "https://images.unsplash.com/photo-1636466497217-26a8cbeaf0aa?w=600&auto=format&fit=crop&q=80"
  },
  {
    id: "sach-02",
    title: "Đại số tuyến tính",
    price: 22000,
    author: "Giáo trình ĐH",
    pages: 180,
    description: "Giáo trình lý thuyết và bài tập giải mẫu Đại số tuyến tính chuẩn chương trình.",
    cover: "https://images.unsplash.com/photo-1509228468518-180dd4864904?w=600&auto=format&fit=crop&q=80"
  },
  {
    id: "sach-03",
    title: "Logic học (tài liệu học tập)",
    price: 20000,
    author: "Tài liệu học tập",
    pages: 140,
    description: "Tài liệu học tập & câu hỏi ôn tập môn Logic học đại cương cho lớp.",
    cover: "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=600&auto=format&fit=crop&q=80"
  }
];

function mapOrderFromDb(row) {
  if (!row) return null;
  return {
    orderCode: Number(row.order_code),
    bookId: row.book_id,
    bookTitle: row.book_title,
    quantity: Number(row.quantity) || 1,
    unitPrice: Number(row.unit_price) || 0,
    amount: Number(row.amount) || 0,
    customerName: row.customer_name || '',
    customerClass: row.customer_class || '',
    customerPhone: row.customer_phone || '',
    note: row.note || '',
    status: row.status || 'PENDING',
    isDelivered: Boolean(row.is_delivered),
    checkoutUrl: row.checkout_url || '',
    qrCode: row.qr_code || '',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
    paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
    bankReference: row.bank_reference || '',
    accountNumber: row.account_number || ''
  };
}

function mapBookFromDb(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    price: Number(row.price),
    author: row.author || '',
    pages: Number(row.pages) || 0,
    description: row.description || '',
    cover: row.cover || ''
  };
}

function mapSettingsFromDb(row) {
  if (!row) return { isRegistrationOpen: true, closeMessage: "" };
  return {
    isRegistrationOpen: row.is_registration_open !== false,
    closeMessage: row.close_message || ""
  };
}

class Database {
  constructor() {
    this.isNeon = false;
    this.sql = null;

    if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('postgres')) {
      try {
        const { neon } = require('@neondatabase/serverless');
        this.sql = neon(process.env.DATABASE_URL);
        this.isNeon = true;
        console.log(" [Database] Đã kích hoạt Neon Cloud PostgreSQL Storage!");
        this.initNeonTables().catch(err => {
          console.error(" [Database] Lỗi khi kiểm tra/tạo bảng trên Neon:", err.message);
        });
      } catch (err) {
        console.warn(" [Database] Không thể kết nối Neon, chuyển sang File Storage:", err.message);
        this.isNeon = false;
      }
    }

    if (!this.isNeon) {
      console.log(" [Database] Đang sử dụng Local JSON File Storage (data.json).");
      this.initFileDb();
    }
  }

  async initNeonTables() {
    if (!this.isNeon || !this.sql) return;
    try {
      await this.sql.query(`CREATE TABLE IF NOT EXISTS settings (
        id VARCHAR(50) PRIMARY KEY,
        is_registration_open BOOLEAN DEFAULT true,
        close_message TEXT
      )`);

      await this.sql.query(`CREATE TABLE IF NOT EXISTS books (
        id VARCHAR(50) PRIMARY KEY,
        title TEXT NOT NULL,
        price NUMERIC NOT NULL,
        author TEXT,
        pages INT,
        description TEXT,
        cover TEXT
      )`);

      await this.sql.query(`CREATE TABLE IF NOT EXISTS orders (
        order_code BIGINT PRIMARY KEY,
        book_id VARCHAR(50),
        book_title TEXT,
        quantity INT DEFAULT 1,
        unit_price NUMERIC,
        amount NUMERIC,
        customer_name TEXT,
        customer_class TEXT,
        customer_phone TEXT,
        note TEXT,
        status VARCHAR(50) DEFAULT 'PENDING',
        is_delivered BOOLEAN DEFAULT false,
        checkout_url TEXT,
        qr_code TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        paid_at TIMESTAMPTZ,
        bank_reference TEXT,
        account_number TEXT
      )`);

      await this.sql.query(`CREATE TABLE IF NOT EXISTS transactions (
        id VARCHAR(100) PRIMARY KEY,
        order_code BIGINT,
        reference TEXT,
        amount NUMERIC,
        description TEXT,
        account_number TEXT,
        transaction_date_time TEXT,
        counter_account_bank_id TEXT,
        counter_account_name TEXT,
        counter_account_number TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`);

      await this.sql.query(`CREATE TABLE IF NOT EXISTS webhook_logs (
        id VARCHAR(100) PRIMARY KEY,
        order_code BIGINT,
        is_verified BOOLEAN,
        signature TEXT,
        payload JSONB,
        error TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`);

      for (const b of INITIAL_BOOKS) {
        await this.sql.query(
          `INSERT INTO books (id, title, price, author, pages, description, cover)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE SET
             title = EXCLUDED.title,
             price = EXCLUDED.price,
             author = EXCLUDED.author,
             pages = EXCLUDED.pages,
             description = EXCLUDED.description,
             cover = EXCLUDED.cover`,
          [b.id, b.title, b.price, b.author, b.pages, b.description, b.cover]
        );
      }

      const settingsCount = await this.sql.query('SELECT COUNT(*) as count FROM settings WHERE id = $1', ['default']);
      if (Number(settingsCount[0]?.count || 0) === 0) {
        await this.sql.query(
          'INSERT INTO settings (id, is_registration_open, close_message) VALUES ($1, $2, $3)',
          ['default', true, 'Đã chốt danh sách mua sách đợt này để báo in. Tạm ngưng nhận đơn mới!']
        );
      }
    } catch (err) {
      console.error(" [Database] Lỗi trong initNeonTables:", err);
    }
  }

  initFileDb() {
    if (!fs.existsSync(DB_FILE)) {
      const defaultData = {
        settings: {
          isRegistrationOpen: true,
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

  readFile() {
    try {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      const data = JSON.parse(content);
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

  writeFile(data) {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
      return true;
    } catch (e) {
      console.error("Lỗi khi ghi Database:", e);
      return false;
    }
  }

  // --- SETTINGS (CHỐT SỔ ĐĂNG KÝ) ---
  async getSettings() {
    if (this.isNeon) {
      try {
        const rows = await this.sql`SELECT * FROM settings WHERE id = 'default' LIMIT 1`;
        if (rows && rows.length > 0) {
          return mapSettingsFromDb(rows[0]);
        }
        return { isRegistrationOpen: true, closeMessage: "" };
      } catch (err) {
        console.error("Lỗi Neon getSettings:", err.message);
      }
    }
    const db = this.readFile();
    return db.settings || { isRegistrationOpen: true, closeMessage: "" };
  }

  async updateSettings(newSettings) {
    if (this.isNeon) {
      try {
        const current = await this.getSettings();
        const isRegistrationOpen = newSettings.isRegistrationOpen !== undefined ? Boolean(newSettings.isRegistrationOpen) : current.isRegistrationOpen;
        const closeMessage = newSettings.closeMessage !== undefined ? String(newSettings.closeMessage) : current.closeMessage;
        await this.sql`UPDATE settings SET is_registration_open = ${isRegistrationOpen}, close_message = ${closeMessage} WHERE id = 'default'`;
        return { isRegistrationOpen, closeMessage };
      } catch (err) {
        console.error("Lỗi Neon updateSettings:", err.message);
      }
    }
    const db = this.readFile();
    db.settings = { ...db.settings, ...newSettings };
    this.writeFile(db);
    return db.settings;
  }

  // --- SÁCH ---
  async getAllBooks() {
    if (this.isNeon) {
      try {
        const rows = await this.sql`SELECT * FROM books ORDER BY id ASC`;
        if (rows && rows.length > 0) {
          return rows.map(mapBookFromDb);
        }
      } catch (err) {
        console.error("Lỗi Neon getAllBooks:", err.message);
      }
    }
    const db = this.readFile();
    return db.books;
  }

  async getBookById(bookId) {
    if (this.isNeon) {
      try {
        const rows = await this.sql`SELECT * FROM books WHERE id = ${bookId} LIMIT 1`;
        if (rows && rows.length > 0) {
          return mapBookFromDb(rows[0]);
        }
        return null;
      } catch (err) {
        console.error("Lỗi Neon getBookById:", err.message);
      }
    }
    const db = this.readFile();
    return db.books.find(b => b.id === bookId);
  }

  // --- ĐƠN HÀNG ---
  async createOrder(orderData) {
    const orderCode = Number(orderData.orderCode);
    const bookId = orderData.bookId || '';
    const bookTitle = orderData.bookTitle || '';
    const quantity = Number(orderData.quantity) || 1;
    const unitPrice = Number(orderData.unitPrice) || 0;
    const amount = Number(orderData.amount) || 0;
    const customerName = orderData.customerName || 'Bạn cùng lớp';
    const customerClass = orderData.customerClass || '';
    const customerPhone = orderData.customerPhone || '';
    const note = orderData.note || '';
    const status = orderData.status || 'PENDING';
    const isDelivered = Boolean(orderData.isDelivered);
    const checkoutUrl = orderData.checkoutUrl || '';
    const qrCode = orderData.qrCode || '';
    const now = new Date().toISOString();

    if (this.isNeon) {
      try {
        await this.sql.query(
          `INSERT INTO orders (
            order_code, book_id, book_title, quantity, unit_price, amount,
            customer_name, customer_class, customer_phone, note, status,
            is_delivered, checkout_url, qr_code, created_at, updated_at, paid_at,
            bank_reference, account_number
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
          ON CONFLICT (order_code) DO UPDATE SET
            status = EXCLUDED.status,
            updated_at = EXCLUDED.updated_at,
            paid_at = COALESCE(EXCLUDED.paid_at, orders.paid_at),
            bank_reference = COALESCE(EXCLUDED.bank_reference, orders.bank_reference),
            account_number = COALESCE(EXCLUDED.account_number, orders.account_number)`,
          [
            orderCode, bookId, bookTitle, quantity, unitPrice, amount,
            customerName, customerClass, customerPhone, note, status,
            isDelivered, checkoutUrl, qrCode, now, now, orderData.paidAt || null,
            orderData.bankReference || orderData.reference || null,
            orderData.accountNumber || null
          ]
        );

        return {
          orderCode,
          bookId,
          bookTitle,
          quantity,
          unitPrice,
          amount,
          customerName,
          customerClass,
          customerPhone,
          note,
          status,
          isDelivered,
          checkoutUrl,
          qrCode,
          createdAt: now,
          updatedAt: now,
          paidAt: orderData.paidAt || null,
          bankReference: orderData.bankReference || '',
          accountNumber: orderData.accountNumber || ''
        };
      } catch (err) {
        console.error("Lỗi Neon createOrder:", err.message);
      }
    }

    const db = this.readFile();
    const newOrder = {
      orderCode,
      bookId,
      bookTitle,
      quantity,
      unitPrice,
      amount,
      customerName,
      customerClass,
      customerPhone,
      note,
      status,
      isDelivered,
      checkoutUrl,
      qrCode,
      createdAt: now,
      updatedAt: now,
      paidAt: orderData.paidAt || null,
      bankReference: orderData.bankReference || '',
      accountNumber: orderData.accountNumber || ''
    };

    const existingIdx = db.orders.findIndex(o => o.orderCode === orderCode);
    if (existingIdx >= 0) {
      db.orders[existingIdx] = { ...db.orders[existingIdx], ...newOrder };
    } else {
      db.orders.push(newOrder);
    }
    this.writeFile(db);
    return newOrder;
  }

  async saveOrder(orderData) {
    return await this.createOrder(orderData);
  }

  async getOrderByCode(orderCode) {
    const code = Number(orderCode);
    if (this.isNeon) {
      try {
        const rows = await this.sql`SELECT * FROM orders WHERE order_code = ${code} LIMIT 1`;
        if (rows && rows.length > 0) {
          return mapOrderFromDb(rows[0]);
        }
        return null;
      } catch (err) {
        console.error("Lỗi Neon getOrderByCode:", err.message);
      }
    }
    const db = this.readFile();
    return db.orders.find(o => o.orderCode === code) || null;
  }

  async updateOrderStatus(orderCode, status, additionalInfo = {}) {
    const code = Number(orderCode);
    const now = new Date().toISOString();
    let paidAt = null;
    let bankReference = additionalInfo.reference || '';
    let accountNumber = additionalInfo.accountNumber || '';

    if (status === 'PAID') {
      paidAt = additionalInfo.paidAt || now;
    }

    if (this.isNeon) {
      try {
        const rows = await this.sql.query(
          `UPDATE orders SET
            status = $1,
            updated_at = $2,
            paid_at = COALESCE($3, paid_at),
            bank_reference = CASE WHEN $4 != '' THEN $4 ELSE bank_reference END,
            account_number = CASE WHEN $5 != '' THEN $5 ELSE account_number END
          WHERE order_code = $6
          RETURNING *`,
          [status, now, paidAt, bankReference, accountNumber, code]
        );

        if (rows && rows.length > 0) {
          return mapOrderFromDb(rows[0]);
        }
        return null;
      } catch (err) {
        console.error("Lỗi Neon updateOrderStatus:", err.message);
      }
    }

    const db = this.readFile();
    const orderIndex = db.orders.findIndex(o => o.orderCode === code);
    if (orderIndex === -1) return null;

    const order = db.orders[orderIndex];
    order.status = status;
    order.updatedAt = now;

    if (status === 'PAID') {
      order.paidAt = paidAt || order.paidAt || now;
      if (bankReference) order.bankReference = bankReference;
      if (accountNumber) order.accountNumber = accountNumber;
    }

    db.orders[orderIndex] = order;
    this.writeFile(db);
    return order;
  }

  async toggleDeliveredStatus(orderCode) {
    const code = Number(orderCode);
    if (this.isNeon) {
      try {
        const rows = await this.sql`
          UPDATE orders 
          SET is_delivered = NOT is_delivered, updated_at = NOW() 
          WHERE order_code = ${code} 
          RETURNING *
        `;
        if (rows && rows.length > 0) {
          return mapOrderFromDb(rows[0]);
        }
        return null;
      } catch (err) {
        console.error("Lỗi Neon toggleDeliveredStatus:", err.message);
      }
    }

    const db = this.readFile();
    const order = db.orders.find(o => o.orderCode === code);
    if (order) {
      order.isDelivered = !order.isDelivered;
      this.writeFile(db);
      return order;
    }
    return null;
  }

  // --- THỐNG KÊ ĐỂ BÁO SỐ LƯỢNG CHO CHÚ & PHÁT SÁCH ---
  async getStatistics() {
    let settings = null;
    let books = [];
    let orders = [];

    if (this.isNeon) {
      try {
        settings = await this.getSettings();
        books = await this.getAllBooks();
        const orderRows = await this.sql`SELECT * FROM orders ORDER BY created_at DESC`;
        orders = orderRows.map(mapOrderFromDb);
      } catch (err) {
        console.error("Lỗi Neon getStatistics, fallback to file:", err.message);
      }
    }

    if (!settings) {
      const db = this.readFile();
      settings = db.settings || { isRegistrationOpen: true, closeMessage: "" };
      books = db.books || INITIAL_BOOKS;
      orders = db.orders || [];
    }

    const paidOrders = orders.filter(o => o.status === 'PAID');
    
    // Thống kê tổng số lượng từng loại sách đã thanh toán
    const bookSummary = {};
    books.forEach(b => {
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
        bookSummary[o.bookId] = {
          id: o.bookId,
          title: o.bookTitle,
          price: o.amount,
          totalQuantity: (o.quantity || 1),
          totalRevenue: o.amount
        };
      }
    });

    const totalRevenue = paidOrders.reduce((sum, o) => sum + o.amount, 0);
    const totalBooks = paidOrders.reduce((sum, o) => sum + (o.quantity || 1), 0);

    return {
      settings,
      totalOrders: orders.length,
      paidOrdersCount: paidOrders.length,
      totalBooksPaid: totalBooks,
      totalRevenue,
      bookSummary: Object.values(bookSummary),
      allOrders: orders
    };
  }

  // --- SAO KÊ & LOGS ---
  async saveTransaction(transData) {
    const id = "TRANS_" + Date.now();
    const orderCode = Number(transData.orderCode);
    const reference = transData.reference || '';
    const amount = Number(transData.amount) || 0;
    const description = transData.description || '';
    const accountNumber = transData.accountNumber || '';
    const transactionDateTime = transData.transactionDateTime || new Date().toISOString();
    const counterAccountBankId = transData.counterAccountBankId || '';
    const counterAccountName = transData.counterAccountName || '';
    const counterAccountNumber = transData.counterAccountNumber || '';
    const now = new Date().toISOString();

    if (this.isNeon) {
      try {
        await this.sql.query(
          `INSERT INTO transactions (
            id, order_code, reference, amount, description, account_number,
            transaction_date_time, counter_account_bank_id, counter_account_name, counter_account_number, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            id, orderCode, reference, amount, description, accountNumber,
            transactionDateTime, counterAccountBankId, counterAccountName, counterAccountNumber, now
          ]
        );
        return {
          id, orderCode, reference, amount, description, accountNumber,
          transactionDateTime, counterAccountBankId, counterAccountName, counterAccountNumber,
          createdAt: now
        };
      } catch (err) {
        console.error("Lỗi Neon saveTransaction:", err.message);
      }
    }

    const db = this.readFile();
    const transaction = {
      id,
      orderCode,
      reference,
      amount,
      description,
      accountNumber,
      transactionDateTime,
      counterAccountBankId,
      counterAccountName,
      counterAccountNumber,
      createdAt: now
    };
    db.transactions.push(transaction);
    this.writeFile(db);
    return transaction;
  }

  async saveWebhookLog(logData) {
    const id = "LOG_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    const orderCode = logData.orderCode ? Number(logData.orderCode) : null;
    const isVerified = Boolean(logData.isVerified);
    const signature = logData.signature || '';
    const payload = logData.payload ? JSON.stringify(logData.payload) : null;
    const error = logData.error || null;
    const now = new Date().toISOString();

    if (this.isNeon) {
      try {
        await this.sql.query(
          `INSERT INTO webhook_logs (id, order_code, is_verified, signature, payload, error, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [id, orderCode, isVerified, signature, payload, error, now]
        );
        return { id, orderCode, isVerified, signature, payload: logData.payload, error, createdAt: now };
      } catch (err) {
        console.error("Lỗi Neon saveWebhookLog:", err.message);
      }
    }

    const db = this.readFile();
    const log = {
      id,
      orderCode,
      isVerified,
      signature,
      payload: logData.payload || null,
      error,
      createdAt: now
    };
    db.webhook_logs.push(log);
    this.writeFile(db);
    return log;
  }
}

module.exports = {
  db: new Database()
};
