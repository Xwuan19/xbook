/**
 * ============================================================================
 * HỒI QUY: SÁCH MẪU KHÔNG ĐƯỢC "SỐNG DẬY" SAU KHI ADMIN XÓA
 * ============================================================================
 * Lỗi thực tế: xóa "Cấu trúc dữ liệu và giải thuật" trong Quản lý sách, nhưng
 * vài giờ / vài ngày sau nó xuất hiện lại.
 *
 * Nguyên nhân: initNeonTables() chạy `INSERT ... ON CONFLICT DO NOTHING` cho sách mẫu
 * ở MỌI lần khởi động server. Trên Vercel, mỗi cold start = 1 lần khởi động
 * → sách đã xóa bị tạo lại (không còn dòng nào để "conflict").
 *
 * Test này chạy trên một Neon giả lập (chỉ vài câu SQL mà phần seed dùng),
 * không cần kết nối mạng.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/** Neon giả lập: đủ để chạy seedInitialBooksIfNeeded() + recordDeletedBook() */
function makeFakeNeon({ settings = null, books = [] } = {}) {
  const state = { settings: settings ? { ...settings } : null, books: books.map(b => ({ ...b })) };
  const queries = [];
  const normalise = (text) => String(text).replace(/\s+/g, ' ').trim();

  const sql = {
    state,
    queries,
    async query(text, params = []) {
      const t = normalise(text);
      queries.push({ text: t, params });
      if (/^SELECT \* FROM settings WHERE id = 'default' LIMIT 1$/i.test(t)) {
        return state.settings ? [{ ...state.settings }] : [];
      }
      if (/^SELECT COUNT\(\*\) as count FROM books$/i.test(t)) {
        return [{ count: state.books.length }];
      }
      if (/^INSERT INTO books/i.test(t)) {
        const [id, title, price, author, pages, year, description, cover] = params;
        if (!state.books.some(b => b.id === id)) {
          state.books.push({ id, title, price, author, pages, year, description, cover });
        }
        return [];
      }
      if (/^UPDATE settings SET books_seeded = 1 WHERE id = 'default'$/i.test(t)) {
        if (state.settings) state.settings = { ...state.settings, books_seeded: 1 };
        return [];
      }
      if (/^UPDATE settings SET deleted_books = \$1, books_seeded = 1 WHERE id = 'default'$/i.test(t)) {
        if (state.settings) state.settings = { ...state.settings, deleted_books: params[0], books_seeded: 1 };
        return [];
      }
      throw new Error('Truy vấn chưa được giả lập: ' + t);
    }
  };
  return sql;
}

/** Database ở chế độ Neon nhưng dùng sql giả (không gọi mạng) */
function attachFakeNeon(fakeSql) {
  const { db } = require('../database');
  db.isNeon = true;
  db.sql = fakeSql;
  db.ready = Promise.resolve();
  return db;
}

const settingsRow = (overrides = {}) => ({
  id: 'default',
  is_registration_open: true,
  close_message: '',
  departments: '["Khoa CNTT"]',
  classes: '[]',
  delivery_date: '',
  delivery_note: 'Sách thường giao ngay hôm sau nếu có tiết.',
  catalog_version: 2,
  books_seeded: 0,
  deleted_books: '[]',
  ...overrides
});

test('seed sample books once on a brand-new database, then never again', async () => {
  // --- Lần khởi động đầu tiên: database mới tinh -----------------------------
  const fake = makeFakeNeon({ settings: settingsRow(), books: [] });
  const db = attachFakeNeon(fake);

  const first = await db.seedInitialBooksIfNeeded({ isBrandNewDatabase: true });
  assert.deepEqual(first.seeded, ['sach-04'], 'database mới được tạo sách mẫu');
  assert.equal(fake.state.books.length, 1);
  assert.equal(fake.state.books[0].title, 'Cấu trúc dữ liệu và giải thuật');
  assert.equal(fake.state.settings.books_seeded, 1, 'đánh dấu đã seed');

  // --- Cold start thứ 2 (Vercel): KHÔNG seed lại ----------------------------
  const second = await db.seedInitialBooksIfNeeded({ isBrandNewDatabase: false });
  assert.deepEqual(second.seeded, [], 'cold start không tạo thêm sách');
  assert.equal(fake.state.books.length, 1);
});

test('deleted sample book does not come back on later cold starts (Neon)', async () => {
  // Database đang chạy production: còn 1 sách khác, admin đã xóa sách mẫu sach-04
  const fake = makeFakeNeon({
    settings: settingsRow({ books_seeded: 1, deleted_books: '["sach-04"]' }),
    books: [{ id: 'sach-custom', title: 'Sách tự thêm' }]
  });
  const db = attachFakeNeon(fake);

  // Mô phỏng nhiều lần serverless khởi động lại
  for (let boot = 0; boot < 5; boot++) {
    const result = await db.seedInitialBooksIfNeeded({ isBrandNewDatabase: false });
    assert.deepEqual(result.seeded, [], `lần khởi động ${boot + 1} không được tạo lại sách`);
  }
  assert.equal(fake.state.books.length, 1, 'chỉ còn sách admin tự thêm');
  assert.deepEqual(fake.state.books.map(b => b.id), ['sach-custom']);

  // Kể cả khi danh mục trống hoàn toàn (admin xóa hết) và DB "trông như mới"
  const emptyFake = makeFakeNeon({ settings: settingsRow({ books_seeded: 0, deleted_books: '["sach-04"]' }), books: [] });
  const emptyDb = attachFakeNeon(emptyFake);
  const afterWipe = await emptyDb.seedInitialBooksIfNeeded({ isBrandNewDatabase: false });
  assert.deepEqual(afterWipe.seeded, [], 'không seed lại khi database đã từng dùng');
  assert.equal(emptyFake.state.books.length, 0);
});

test('deleting a book records a tombstone so seeding can never restore it', async () => {
  const fake = makeFakeNeon({
    settings: settingsRow({ books_seeded: 1 }),
    books: [{ id: 'sach-04', title: 'Cấu trúc dữ liệu và giải thuật' }]
  });
  const db = attachFakeNeon(fake);

  const deleted = await db.recordDeletedBook('sach-04');
  assert.deepEqual(deleted, ['sach-04']);
  assert.equal(JSON.parse(fake.state.settings.deleted_books)[0], 'sach-04');
  assert.equal(fake.state.settings.books_seeded, 1, 'xóa sách cũng đánh dấu đã seed');

  // Nếu vì lý do nào đó DB bị coi là "mới" thì tombstone vẫn chặn việc tạo lại
  const planFake = makeFakeNeon({ settings: settingsRow({ books_seeded: 0, deleted_books: '["sach-04"]' }), books: [] });
  const planDb = attachFakeNeon(planFake);
  const result = await planDb.seedInitialBooksIfNeeded({ isBrandNewDatabase: true });
  assert.deepEqual(result.seeded, [], 'tombstone chặn seed');
});

test('local file database keeps a deleted book deleted after restart', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xbook-seed-'));
  for (const file of ['database.js']) fs.copyFileSync(path.join(__dirname, '..', file), path.join(dir, file));
  fs.mkdirSync(path.join(dir, 'public'));
  fs.copyFileSync(path.join(__dirname, '../public/domain.js'), path.join(dir, 'public/domain.js'));
  fs.symlinkSync(path.join(__dirname, '../node_modules'), path.join(dir, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');

  const initialData = {
    settings: {
      isRegistrationOpen: true, closeMessage: '', departments: ['Khoa CNTT'], classes: [],
      deliveryDate: '', deliveryNote: '', catalogVersion: 2
    },
    books: [{ id: 'sach-04', title: 'Cấu trúc dữ liệu và giải thuật', price: 35000 }],
    orders: [], transactions: [], webhook_logs: []
  };
  fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify(initialData, null, 2), 'utf-8');

  process.env.DATABASE_URL = '';
  delete require.cache[require.resolve(path.join(dir, 'database.js'))];
  const first = require(path.join(dir, 'database.js'));
  assert.equal((await first.db.getAllBooks()).length, 1);
  await first.db.deleteBook('sach-04');
  assert.equal((await first.db.getAllBooks()).length, 0, 'sách đã bị xóa');

  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf-8'));
  assert.deepEqual(saved.settings.deletedBooks, ['sach-04'], 'lưu tombstone');
  assert.equal(saved.settings.booksSeeded, true);

  // Khởi động lại server (module mới đọc lại file) → sách vẫn phải biến mất
  delete require.cache[require.resolve(path.join(dir, 'database.js'))];
  const second = require(path.join(dir, 'database.js'));
  const booksAfterRestart = await second.db.getAllBooks();
  assert.deepEqual(booksAfterRestart, [], 'khởi động lại không làm sách sống dậy');

  fs.rmSync(dir, { recursive: true, force: true });
});
