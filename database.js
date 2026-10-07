/**
 * ============================================================================
 * DATABASE MODULE - XBOOK (HỆ THỐNG ĐẶT SÁCH CHO LỚP & PAYOS DYNAMIC QR)
 * HỖ TRỢ HYBRID: NEON POSTGRESQL (CLOUD) & LOCAL JSON FILE FALLBACK
 * ============================================================================
 */

require('dotenv').config();
const domain = require('./public/domain');
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'data.json');

// Chỉ dùng để chuyển dữ liệu gán lớp từ phiên bản cũ
const DEFAULT_DEPARTMENT = 'Khoa CNTT';

// Danh sách khoa khởi tạo sẵn (chỉ còn Khoa CNTT)
const INITIAL_DEPARTMENTS = ['Khoa CNTT'];

// Lưu ý thời gian giao sách mặc định (hiển thị ngắn gọn cho sinh viên)
const DEFAULT_DELIVERY_NOTE = 'Sách thường giao ngay hôm sau nếu có tiết.';

// Danh mục sách chung; danh sách sách cần học được lưu trên từng lớp
const INITIAL_BOOKS = [
  {
    id: "sach-04",
    title: "Cấu trúc dữ liệu và giải thuật",
    price: 35000,
    author: "Giáo trình Khoa CNTT",
    pages: 250,
    year: "",
    description: "Giáo trình mẫu của Khoa CNTT: mảng, danh sách liên kết, cây, đồ thị và các giải thuật sắp xếp.",
    cover: "https://images.unsplash.com/photo-1509228468518-180dd4864904?w=600&auto=format&fit=crop&q=80",
  }
];

function parseJsonArray(raw, fallback = []) {
  if (Array.isArray(raw)) return raw;
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (e) {
    return fallback;
  }
}

function mapOrderFromDb(row) {
  if (!row) return null;
  const quantity = Number(row.quantity) || 1;
  const unitPrice = Number(row.unit_price) || 0;
  let items = parseJsonArray(row.items_json, []);
  if (items.length === 0) {
    // Đơn hàng cũ (chưa có items): tự dựng lại từ trường legacy
    items = [{
      bookId: row.book_id || '',
      bookTitle: row.book_title || '',
      department: row.department || '',
      quantity,
      unitPrice
    }];
  }
  return {
    orderCode: Number(row.order_code),
    bookId: row.book_id,
    bookTitle: row.book_title,
    quantity,
    unitPrice,
    amount: Number(row.amount) || 0,
    items,
    customerName: row.customer_name || '',
    customerClass: row.customer_class || '',
    customerDepartment: row.customer_department || '',
    deliveryAt: row.delivery_at ? new Date(row.delivery_at).toISOString() : null,
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
    year: row.year || '',
    description: row.description || '',
    cover: row.cover || '',
  };
}

function mapSettingsFromDb(row) {
  if (!row) return { isRegistrationOpen: true, closeMessage: "", departments: [...INITIAL_DEPARTMENTS], classes: [], deliveryDate: "", deliveryNote: DEFAULT_DELIVERY_NOTE };
  return {
    isRegistrationOpen: row.is_registration_open !== false,
    closeMessage: row.close_message || "",
    departments: parseJsonArray(row.departments, [...INITIAL_DEPARTMENTS]),
    classes: domain.classes(parseJsonArray(row.classes, []), parseJsonArray(row.departments, INITIAL_DEPARTMENTS)),
    catalogVersion: Number(row.catalog_version) || 1,
    deliveryDate: row.delivery_date || "",
    deliveryNote: row.delivery_note || DEFAULT_DELIVERY_NOTE
  };
}

/**
 * Chuẩn hóa đơn hàng cũ: đảm bảo luôn có mảng items[]
 * (1 người có thể mua nhiều cuốn khác nhau trong 1 đơn)
 */
function normalizeOrder(order) {
  if (!order) return order;
  if (!Array.isArray(order.items) || order.items.length === 0) {
    order.items = [{
      bookId: order.bookId || '',
      bookTitle: order.bookTitle || '',
      department: order.department || '',
      quantity: Number(order.quantity) || 1,
      unitPrice: Number(order.unitPrice) || 0
    }];
  }
  order.items = order.items.map(it => ({
    bookId: it.bookId || '',
    bookTitle: it.bookTitle || '',
    department: it.department || '',
    quantity: Number(it.quantity) || 1,
    unitPrice: Number(it.unitPrice) || 0
  }));
  return order;
}

function normalizeBook(book) {
  if (!book) return book;
  // Ownership fields are legacy input only; public books are independent of faculties/classes.
  const { department, classes, ...catalogBook } = book;
  return catalogBook;
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
        this.ready = this.initNeonTables().catch(err => {
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
        close_message TEXT,
        departments TEXT DEFAULT '[]',
        classes TEXT DEFAULT '[]',
        delivery_date TEXT DEFAULT '',
        delivery_note TEXT DEFAULT ''
      )`);

      await this.sql.query(`CREATE TABLE IF NOT EXISTS books (
        id VARCHAR(50) PRIMARY KEY,
        title TEXT NOT NULL,
        price NUMERIC NOT NULL,
        author TEXT,
        pages INT,
        year TEXT,
        description TEXT,
        cover TEXT,
        department TEXT DEFAULT '',
        classes TEXT DEFAULT '[]'
      )`);

      await this.sql.query(`CREATE TABLE IF NOT EXISTS orders (
        order_code BIGINT PRIMARY KEY,
        book_id VARCHAR(50),
        book_title TEXT,
        quantity INT DEFAULT 1,
        unit_price NUMERIC,
        amount NUMERIC,
        items_json TEXT,
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

      // Di chuyển schema cho database đã tồn tại từ phiên bản trước (thêm cột mới nếu thiếu)
      const migrations = [
        `ALTER TABLE settings ADD COLUMN IF NOT EXISTS departments TEXT DEFAULT '[]'`,
        `ALTER TABLE settings ADD COLUMN IF NOT EXISTS classes TEXT DEFAULT '[]'`,
        `ALTER TABLE settings ADD COLUMN IF NOT EXISTS delivery_date TEXT DEFAULT ''`,
        `ALTER TABLE settings ADD COLUMN IF NOT EXISTS delivery_note TEXT DEFAULT ''`,
        `ALTER TABLE books ADD COLUMN IF NOT EXISTS department TEXT DEFAULT ''`,
        `ALTER TABLE books ADD COLUMN IF NOT EXISTS classes TEXT DEFAULT '[]'`,
        `ALTER TABLE books ADD COLUMN IF NOT EXISTS year TEXT DEFAULT ''`,
        `ALTER TABLE orders ADD COLUMN IF NOT EXISTS items_json TEXT`,
        `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_at TIMESTAMPTZ`,
        `ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_department TEXT DEFAULT ''`,
        `ALTER TABLE settings ADD COLUMN IF NOT EXISTS catalog_version INT DEFAULT 1`
      ];
      for (const migration of migrations) {
        try {
          await this.sql.query(migration);
        } catch (migErr) {
          console.warn(" [Database] Bỏ qua migration (có thể đã tồn tại):", migErr.message);
        }
      }

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
        // Chỉ seed sách MỚI (ON CONFLICT DO NOTHING) để không ghi đè sách đã chỉnh sửa qua trang quản trị
        await this.sql.query(
          `INSERT INTO books (id, title, price, author, pages, year, description, cover, department, classes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (id) DO NOTHING`,
          [b.id, b.title, b.price, b.author, b.pages, b.year || '', b.description, b.cover, '', '[]']
        );
      }

      const settingsCount = await this.sql.query('SELECT COUNT(*) as count FROM settings WHERE id = $1', ['default']);
      if (Number(settingsCount[0]?.count || 0) === 0) {
        await this.sql.query(
          'INSERT INTO settings (id, is_registration_open, close_message, departments, classes, delivery_date, delivery_note) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          ['default', true, 'Đã chốt danh sách mua sách đợt này để báo in. Tạm ngưng nhận đơn mới!', JSON.stringify(INITIAL_DEPARTMENTS), '[]', '', DEFAULT_DELIVERY_NOTE]
        );
      }
      const [settingsRows, legacyBooks] = await Promise.all([
        this.sql.query("SELECT * FROM settings WHERE id = 'default'"),
        this.sql.query('SELECT id, department, classes FROM books')
      ]);
      const settings = mapSettingsFromDb(settingsRows[0]);
      if (settings.catalogVersion !== 2) {
        const migrated = domain.migrateSettings(settings, legacyBooks.map(b => ({ ...b, classes: parseJsonArray(b.classes) })));
        await this.sql.query("UPDATE settings SET classes = $1, catalog_version = 2 WHERE id = 'default'", [JSON.stringify(migrated.classes)]);
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
          closeMessage: "Hiện đã chốt danh sách mua sách đợt này để gửi in. Tạm ngưng nhận đơn mới!",
          departments: [...INITIAL_DEPARTMENTS],
          classes: [],
          deliveryDate: "",
          deliveryNote: DEFAULT_DELIVERY_NOTE
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
    let data;
    try {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      data = JSON.parse(content);
    } catch (e) {
      console.error("Lỗi khi đọc Database:", e);
      data = {};
    }

    // Tương thích dữ liệu phiên bản cũ (courses → books)
    if (!data.books && data.courses) {
      data.books = data.courses;
    }
    if (!data.settings) {
      data.settings = {
        isRegistrationOpen: true,
        closeMessage: "Đã chốt danh sách mua sách đợt này. Tạm ngưng nhận đơn mới!"
      };
    }

    // Chuẩn hóa settings: luôn có danh sách khoa & lớp + ngày nhận sách & lưu ý giao sách
    data.settings = {
      isRegistrationOpen: data.settings.isRegistrationOpen !== false,
      closeMessage: data.settings.closeMessage || "",
      departments: Array.isArray(data.settings.departments)
        ? data.settings.departments
        : [...INITIAL_DEPARTMENTS],
      classes: data.settings.classes || [],
      catalogVersion: Number(data.settings.catalogVersion) || 1,
      deliveryDate: String(data.settings.deliveryDate || ''),
      deliveryNote: String(data.settings.deliveryNote || DEFAULT_DELIVERY_NOTE)
    };

    data.settings = domain.migrateSettings(data.settings, data.books || []);

    // Sách là danh mục chung, độc lập khoa/lớp
    data.books = (Array.isArray(data.books) ? data.books : []).map(normalizeBook);

    // Chuẩn hóa đơn hàng: luôn có items[] (1 người mua nhiều cuốn)
    data.orders = (Array.isArray(data.orders) ? data.orders : []).map(normalizeOrder);

    if (!Array.isArray(data.transactions)) data.transactions = [];
    if (!Array.isArray(data.webhook_logs)) data.webhook_logs = [];

    return data;
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

  // --- SETTINGS (CHỐT SỔ ĐĂNG KÝ + DANH SÁCH KHOA / LỚP + NGÀY NHẬN SÁCH) ---
  async getSettings() {
    await this.ready;
    if (this.isNeon) {
      try {
        const rows = await this.sql`SELECT * FROM settings WHERE id = 'default' LIMIT 1`;
        if (rows && rows.length > 0) {
          return mapSettingsFromDb(rows[0]);
        }
        return { isRegistrationOpen: true, closeMessage: "", departments: [...INITIAL_DEPARTMENTS], classes: [], deliveryDate: "", deliveryNote: DEFAULT_DELIVERY_NOTE };
      } catch (err) {
        console.error("Lỗi Neon getSettings:", err.message);
      }
    }
    const db = this.readFile();
    return db.settings || { isRegistrationOpen: true, closeMessage: "", departments: [...INITIAL_DEPARTMENTS], classes: [], deliveryDate: "", deliveryNote: DEFAULT_DELIVERY_NOTE };
  }

  async updateSettings(newSettings) {
    if (this.isNeon) {
      try {
        const current = await this.getSettings();
        const merged = {
          isRegistrationOpen: newSettings.isRegistrationOpen !== undefined ? Boolean(newSettings.isRegistrationOpen) : current.isRegistrationOpen,
          closeMessage: newSettings.closeMessage !== undefined ? String(newSettings.closeMessage) : current.closeMessage,
          catalogVersion: 2,
          departments: Array.isArray(newSettings.departments) ? newSettings.departments : current.departments,
          classes: Array.isArray(newSettings.classes) ? newSettings.classes : current.classes,
          deliveryDate: newSettings.deliveryDate !== undefined ? String(newSettings.deliveryDate) : current.deliveryDate,
          deliveryNote: newSettings.deliveryNote !== undefined ? String(newSettings.deliveryNote) : current.deliveryNote
        };
        await this.sql.query(
          `UPDATE settings SET is_registration_open = $1, close_message = $2, departments = $3, classes = $4, delivery_date = $5, delivery_note = $6, catalog_version = 2 WHERE id = 'default'`,
          [merged.isRegistrationOpen, merged.closeMessage, JSON.stringify(merged.departments), JSON.stringify(merged.classes), merged.deliveryDate, merged.deliveryNote]
        );
        return merged;
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
    await this.ready;
    if (this.isNeon) {
      try {
        const rows = await this.sql`SELECT * FROM books ORDER BY id ASC`;
        return rows.map(mapBookFromDb);
      } catch (err) {
        console.error("Lỗi Neon getAllBooks:", err.message);
      }
    }
    const db = this.readFile();
    return db.books;
  }

  async getBookById(bookId) {
    await this.ready;
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

  // --- ĐƠN HÀNG (HỖ TRỢ 1 NGƯỜI MUA NHIỀU CUỐN KHÁC NHAU TRONG 1 ĐƠN) ---
  async createOrder(orderData) {
    const orderCode = Number(orderData.orderCode);

    // items[]: danh sách nhiều cuốn khác nhau. Đơn cũ 1 cuốn vẫn tương thích.
    let items = Array.isArray(orderData.items) ? orderData.items : [];
    if (items.length === 0) {
      items = [{
        bookId: orderData.bookId || '',
        bookTitle: orderData.bookTitle || '',
        quantity: Number(orderData.quantity) || 1,
        unitPrice: Number(orderData.unitPrice) || 0
      }];
    }
    items = items.map(it => ({
      bookId: it.bookId || '',
      bookTitle: it.bookTitle || '',
      quantity: Number(it.quantity) || 1,
      unitPrice: Number(it.unitPrice) || 0
    }));

    const totalQuantity = items.reduce((sum, it) => sum + it.quantity, 0);
    const itemsAmount = items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);

    const bookId = items[0].bookId;
    const bookTitle = orderData.bookTitle || items.map(it => it.bookTitle).join(', ');
    const quantity = Number(orderData.quantity) || totalQuantity;
    const unitPrice = Number(orderData.unitPrice) || items[0].unitPrice;
    const amount = orderData.amount !== undefined ? Number(orderData.amount) : itemsAmount;
    const customerName = orderData.customerName || 'Bạn cùng lớp';
    const customerClass = orderData.customerClass || '';
    const customerDepartment = orderData.customerDepartment || '';
    const customerPhone = orderData.customerPhone || '';
    const note = orderData.note || '';
    const status = orderData.status || 'PENDING';
    const isDelivered = Boolean(orderData.isDelivered);
    const checkoutUrl = orderData.checkoutUrl || '';
    const qrCode = orderData.qrCode || '';
    const now = new Date().toISOString();
    const deliveryAt = domain.deliveryAt(now, orderData.deliveryDate);

    if (this.isNeon) {
      try {
        await this.sql.query(
          `INSERT INTO orders (
            order_code, book_id, book_title, quantity, unit_price, amount, items_json,
            customer_name, customer_class, customer_phone, note, status,
            is_delivered, checkout_url, qr_code, created_at, updated_at, paid_at,
            bank_reference, account_number, delivery_at, customer_department
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
          ON CONFLICT (order_code) DO UPDATE SET
            status = EXCLUDED.status,
            updated_at = EXCLUDED.updated_at,
            paid_at = COALESCE(EXCLUDED.paid_at, orders.paid_at),
            bank_reference = COALESCE(EXCLUDED.bank_reference, orders.bank_reference),
            account_number = COALESCE(EXCLUDED.account_number, orders.account_number)`,
          [
            orderCode, bookId, bookTitle, quantity, unitPrice, amount, JSON.stringify(items),
            customerName, customerClass, customerPhone, note, status,
            isDelivered, checkoutUrl, qrCode, now, now, orderData.paidAt || null,
            orderData.bankReference || orderData.reference || null,
            orderData.accountNumber || null, deliveryAt, customerDepartment
          ]
        );

        return {
          orderCode,
          bookId,
          bookTitle,
          quantity,
          unitPrice,
          amount,
          items,
          customerName,
          customerClass,
          customerDepartment,
          customerPhone,
          note,
          status,
          isDelivered,
          checkoutUrl,
          qrCode,
          deliveryAt,
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
      items,
      customerName,
      customerClass,
      customerDepartment,
      customerPhone,
      note,
      status,
      isDelivered,
      checkoutUrl,
      qrCode,
      deliveryAt,
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

    // Thống kê tổng số lượng TỪNG CUỐN đã thanh toán (đếm theo items để hỗ trợ đơn đa cuốn)
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
      const items = Array.isArray(o.items) && o.items.length > 0
        ? o.items
        : [{ bookId: o.bookId, bookTitle: o.bookTitle, quantity: o.quantity || 1, unitPrice: o.unitPrice || 0 }];

      items.forEach(it => {
        const key = it.bookId && bookSummary[it.bookId] ? it.bookId : (it.bookId || it.bookTitle || 'khac');
        if (!bookSummary[key]) {
          bookSummary[key] = {
            id: it.bookId || key,
            title: it.bookTitle || 'Sách khác',
            price: it.unitPrice || 0,
            totalQuantity: 0,
            totalRevenue: 0
          };
        }
        const qty = Number(it.quantity) || 1;
        bookSummary[key].totalQuantity += qty;
        bookSummary[key].totalRevenue += qty * (Number(it.unitPrice) || 0);
      });
    });

    const totalRevenue = paidOrders.reduce((sum, o) => sum + o.amount, 0);
    const totalBooks = paidOrders.reduce((sum, o) => {
      const items = Array.isArray(o.items) && o.items.length > 0 ? o.items : [{ quantity: o.quantity || 1 }];
      return sum + items.reduce((s, it) => s + (Number(it.quantity) || 1), 0);
    }, 0);

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

  // --- QUẢN TRỊ SÁCH (THÊM / SỬA / XÓA - PHÂN LOẠI KHOA & LỚP) ---
  async createBook(bookData) {
    const id = bookData.id || ('sach-' + Date.now().toString(36));
    const book = {
      id,
      title: bookData.title || 'Sách mới',
      price: Number(bookData.price) || 0,
      author: bookData.author || '',
      pages: Number(bookData.pages) || 0,
      year: bookData.year || '',
      description: bookData.description || '',
      cover: bookData.cover || ''
    };

    if (this.isNeon) {
      try {
        await this.sql.query(
          `INSERT INTO books (id, title, price, author, pages, year, description, cover)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [book.id, book.title, book.price, book.author, book.pages, book.year, book.description, book.cover]
        );
        return book;
      } catch (err) {
        console.error("Lỗi Neon createBook:", err.message);
        throw new Error("Không thể thêm sách: " + err.message);
      }
    }

    const db = this.readFile();
    if (db.books.some(b => b.id === id)) {
      throw new Error("Mã sách đã tồn tại!");
    }
    db.books.push(book);
    this.writeFile(db);
    return book;
  }

  async updateBook(bookId, patch) {
    if (this.isNeon) {
      try {
        const rows = await this.sql.query(
          `UPDATE books SET
            title = COALESCE($2, title),
            price = COALESCE($3, price),
            author = COALESCE($4, author),
            pages = COALESCE($5, pages),
            year = COALESCE($6, year),
            description = COALESCE($7, description),
            cover = COALESCE($8, cover)
          WHERE id = $1
          RETURNING *`,
          [
            bookId,
            patch.title !== undefined ? String(patch.title) : null,
            patch.price !== undefined ? Number(patch.price) : null,
            patch.author !== undefined ? String(patch.author) : null,
            patch.pages !== undefined ? Number(patch.pages) : null,
            patch.year !== undefined ? String(patch.year) : null,
            patch.description !== undefined ? String(patch.description) : null,
            patch.cover !== undefined ? String(patch.cover) : null
          ]
        );
        if (rows && rows.length > 0) return mapBookFromDb(rows[0]);
        return null;
      } catch (err) {
        console.error("Lỗi Neon updateBook:", err.message);
        throw new Error("Không thể cập nhật sách: " + err.message);
      }
    }

    const db = this.readFile();
    const index = db.books.findIndex(b => b.id === bookId);
    if (index === -1) return null;
    const current = db.books[index];
    const updated = normalizeBook({
      ...current,
      ...patch,
      price: patch.price !== undefined ? Number(patch.price) : current.price,
      pages: patch.pages !== undefined ? Number(patch.pages) : current.pages
    });
    db.books[index] = updated;
    this.writeFile(db);
    return updated;
  }

  async deleteBook(bookId) {
    const settings = await this.getSettings();
    await this.updateSettings({ classes: settings.classes.map(c => ({ ...c, bookIds: c.bookIds.filter(id => id !== bookId) })) });
    if (this.isNeon) {
      try {
        await this.sql.query('DELETE FROM books WHERE id = $1', [bookId]);
        return true;
      } catch (err) {
        console.error("Lỗi Neon deleteBook:", err.message);
        throw new Error("Không thể xóa giáo trình: " + err.message);
      }
    }
    const db = this.readFile();
    const before = db.books.length;
    db.books = db.books.filter(b => b.id !== bookId);
    this.writeFile(db);
    return db.books.length < before;
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
