const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

/**
 * Giao diện quản lý đã tách khỏi trang chủ thành trang riêng /admin.html (route /admin):
 *  - trang chủ (/)          nạp domain.js + core.js + app.js
 *  - trang quản trị (/admin)  nạp domain.js + core.js + admin.js
 * core.js là phần dùng chung (tiện ích, dropdown tự vẽ, modal, nạp danh mục sách).
 */
const STOREFRONT_SCRIPTS = ['public/domain.js', 'public/core.js', 'public/app.js'];
const ADMIN_SCRIPTS = ['public/domain.js', 'public/core.js', 'public/admin.js'];

function loadPage(htmlFile, scriptFiles, { fetch: fetchMock } = {}) {
  const html = fs.readFileSync(htmlFile, 'utf8');
  const dom = new JSDOM(html, { url: 'https://xbook.test', runScripts: 'outside-only' });
  const { window } = dom;
  window.lucide = { createIcons() {} };
  window.alert = () => {};
  window.confirm = () => true;
  // Phải gán fetch TRƯỚC khi eval script: script tự khởi động ngay khi nạp
  if (fetchMock) window.fetch = fetchMock;
  // Eval GỘP 1 lần: trên trình duyệt thật các thẻ <script> dùng chung 1 phạm vi toàn cục
  // (biến `let` của core.js nhìn thấy được từ app.js / admin.js) — jsdom chỉ có hành vi đó
  // khi các file nằm trong cùng một lần eval.
  const bundle = scriptFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n;\n');
  window.eval(bundle);
  return dom;
}

const demoFixture = () => ({
  books: [
    { id: 'shared', title: 'Shared', price: 100 },
    { id: 'it', title: 'IT only', price: 200 },
    { id: 'other', title: 'Other', price: 300 }
  ],
  settings: {
    isRegistrationOpen: true,
    departments: ['IT', 'Business'],
    classes: [
      { name: 'A', department: 'IT', bookIds: ['shared', 'it'] },
      { name: 'A', department: 'Business', bookIds: ['shared'] },
      { name: 'B', department: 'IT', bookIds: [] }
    ]
  }
});

test('home page filters the catalog by curriculum and keeps no admin UI at all', async () => {
  const fixture = demoFixture();
  const dom = loadPage('public/index.html', STOREFRONT_SCRIPTS, {
    fetch: async (url, options) => {
      const reply = (payload) => ({ status: 200, headers: { get: () => null }, json: async () => payload });
      if (url === '/api/admin/settings') {
        fixture.settings = { ...fixture.settings, ...JSON.parse(options.body) };
        return reply({ success: true, settings: fixture.settings });
      }
      return reply({ success: true, ...fixture });
    }
  });
  const { window } = dom;
  await window.fetchBooksAndSettings();

  assert.equal(window.document.querySelectorAll('#bookGrid h3').length, 3);
  window.setDepartmentFilter('Business');
  assert.equal(window.document.querySelectorAll('#bookGrid h3').length, 1);
  // Dropdown lớp ở trang chủ là component tự vẽ; bấm chọn là lọc sách ngay
  const homePicker = window.document.getElementById('classFilterSelect');
  assert.ok(homePicker.querySelector('[data-xbook-trigger]'));
  homePicker.querySelector('[data-xbook-trigger]').click();
  assert.equal(homePicker.querySelector('[data-xbook-panel]').classList.contains('hidden'), false);
  [...homePicker.querySelectorAll('[data-xbook-option]')]
    .find(o => o.dataset.value === window.XBookDomain.classKey(fixture.settings.classes[1])).click();
  assert.equal(homePicker.querySelector('[data-xbook-panel]').classList.contains('hidden'), true);
  assert.equal(window.document.querySelectorAll('#bookGrid h3').length, 1);
  window.setClassFilter(window.XBookDomain.classKey(fixture.settings.classes[1]));
  assert.equal(window.document.querySelector('#bookGrid h3').textContent, 'Shared');
  window.setDepartmentFilter('IT');
  assert.equal(window.document.querySelectorAll('#bookGrid h3').length, 2);
  window.setClassFilter(window.XBookDomain.classKey(fixture.settings.classes[2]));
  assert.match(window.document.querySelector('#bookGrid').textContent, /Chưa có sách/);

  // 1. TOÀN BỘ giao diện quản lý đã rời trang chủ: không còn modal quản trị nào trong DOM
  assert.equal(window.document.getElementById('adminModal'), null);
  assert.equal(window.document.getElementById('adminLoginModal'), null);
  assert.equal(window.document.getElementById('bookFormModal'), null);
  assert.equal(window.document.getElementById('adminTabBar'), null);
  assert.equal(window.document.getElementById('adminPasswordInput'), null);
  assert.match(window.document.body.innerHTML, /^((?!handleClickAdmin).)*$/s);

  // 2. Nút "Quản Lý" trên header giờ là link sang trang quản trị riêng
  const adminLink = window.document.querySelector('header a[href="/admin.html"]');
  assert.ok(adminLink, 'header trang chủ có link sang /admin.html');
  assert.match(adminLink.textContent, /Quản Lý/);

  // 3. Code quản trị KHÔNG được nạp ở trang chủ (chỉ core.js + app.js)
  assert.equal(typeof window.handleAdminLogin, 'undefined');
  assert.equal(typeof window.refreshAdminData, 'undefined');
  assert.equal(typeof window.openBookForm, 'undefined');
  assert.equal(typeof window.exportToExcel, 'undefined');
  // Phần dùng chung vẫn có ở trang chủ
  assert.equal(typeof window.fetchBooksAndSettings, 'function');
  assert.equal(typeof window.renderXBookSelect, 'function');

  // 4. Ô chọn lớp trong form đặt mua vẫn là dropdown tự vẽ (không dùng select mặc định)
  assert.equal(window.document.querySelectorAll('select').length, 0);
  window.renderCheckoutClassPicker();
  const classLabels = window.xbookSelectOptions('formCustomerClass').map(o => o.label);
  assert.ok(classLabels.includes('Business / A'));
  assert.ok(classLabels.includes('IT / A'));
  assert.ok(window.document.getElementById('formCustomerDeliveryDate') !== null);
  window.toggleCartBook('shared');
  window.openCheckoutModal();
  assert.ok(window.document.getElementById('formCustomerDeliveryDate').min.length > 0);

  // 5. PWA: manifest + service worker + meta iPhone vẫn khai báo ở trang chủ
  assert.ok(window.document.querySelector('link[rel="manifest"]').getAttribute('href').includes('manifest.webmanifest'));
  assert.equal(window.document.querySelector('meta[name="apple-mobile-web-app-capable"]').getAttribute('content'), 'yes');
  assert.ok(window.document.querySelector('link[rel="apple-touch-icon"]'));
  assert.equal(window.document.getElementById('iosInstallHint'), null);
  dom.window.close();
});

test('admin page owns login + dashboard and edits class curricula / book form', async () => {
  const fixture = demoFixture();
  const dom = loadPage('public/admin.html', ADMIN_SCRIPTS, {
    fetch: async (url, options) => {
      const reply = (payload) => ({ status: 200, headers: { get: () => null }, json: async () => payload });
      if (url === '/api/admin/settings') {
        fixture.settings = { ...fixture.settings, ...JSON.parse(options.body) };
        return reply({ success: true, settings: fixture.settings });
      }
      return reply({ success: true, ...fixture });
    }
  });
  const { window } = dom;

  // 1. Trang quản trị là 1 TRANG RIÊNG: có khối đăng nhập + Bảng Quản Lý, không dính giao diện trang chủ
  assert.ok(window.document.getElementById('adminLoginPanel'));
  assert.ok(window.document.getElementById('adminPanel'));
  assert.ok(window.document.getElementById('bookFormModal'));
  assert.equal(window.document.getElementById('adminModal'), null);
  assert.equal(window.document.getElementById('adminLoginModal'), null);
  assert.equal(window.document.getElementById('checkoutModal'), null);
  assert.equal(window.document.getElementById('bookGrid'), null);
  assert.equal(window.document.getElementById('qrPaymentModal'), null);

  // 2. Chưa đăng nhập → hiện form mật khẩu, ẩn Bảng Quản Lý
  assert.equal(window.isAdminAuthed(), false);
  assert.equal(window.document.getElementById('adminLoginPanel').classList.contains('hidden'), false);
  assert.equal(window.document.getElementById('adminPanel').classList.contains('hidden'), true);
  assert.ok(window.document.getElementById('adminPasswordInput'));
  assert.ok(window.document.getElementById('adminRememberInput'));

  await window.fetchBooksAndSettings();
  window.renderAdminManageTab();
  // Ô chọn lớp là dropdown tự vẽ (không dùng select mặc định của trình duyệt)
  assert.equal(window.document.querySelectorAll('select').length, 0);
  window.setXBookSelectValue('classBookEditorSelect', window.XBookDomain.classKey(fixture.settings.classes[1]), { silent: true });
  window.renderClassBookChoices();
  assert.equal(window.document.querySelector('#classBookChoices input[value="shared"]').checked, true);
  window.document.querySelector('#classBookChoices input[value="it"]').checked = true;
  await window.saveClassBooks({ preventDefault() {} });
  assert.deepEqual(fixture.settings.classes[1].bookIds, ['shared', 'it']);

  // 3. Form thêm/sửa sách là modal của riêng trang quản trị
  window.openBookForm('shared');
  assert.equal(window.document.getElementById('formBookTitle').value, 'Shared');
  assert.equal(window.document.getElementById('formBookDepartment'), null);
  assert.equal(window.document.getElementById('formBookClasses'), null);
  assert.equal(window.document.getElementById('bookFormModal').classList.contains('hidden'), false);
  window.closeModal('bookFormModal');
  assert.equal(window.document.getElementById('bookFormModal').classList.contains('hidden'), true);
  dom.window.close();
});

test('admin session token, book scope editor and book library filters', async () => {
  const fixture = demoFixture();
  const calls = [];
  const reply = (payload, status = 200, headers = {}) => ({
    status,
    headers: { get: (name) => headers[name.toLowerCase()] || null },
    json: async () => payload
  });
  const dom = loadPage('public/admin.html', ADMIN_SCRIPTS, {
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      if (url === '/api/admin/login') {
        const body = JSON.parse(options.body);
        return body.password === 'secret'
          ? reply({ success: true, token: 'token-abc', expiresInDays: 30 })
          : reply({ success: false, message: 'Sai mật khẩu' }, 401);
      }
      if (url === '/api/admin/books' || String(url).startsWith('/api/admin/books/')) {
        return reply({ success: true, book: { id: 'new-book', title: 'New', price: 1000 } });
      }
      if (url === '/api/books') return reply({ success: true, ...fixture });
      return reply({ success: true, settings: fixture.settings });
    }
  });
  const { window } = dom;
  await window.fetchBooksAndSettings();

  // 1. Chưa đăng nhập → không có quyền quản trị, trang hiện form mật khẩu
  assert.equal(window.isAdminAuthed(), false);
  assert.equal(window.localStorage.getItem('xbook_admin_token'), null);
  assert.equal(window.document.getElementById('adminPanel').classList.contains('hidden'), true);

  // 2. Đăng nhập có tích "Ghi nhớ" → token lưu localStorage (mở lại trang không cần nhập mật khẩu)
  window.document.getElementById('adminPasswordInput').value = 'secret';
  window.document.getElementById('adminRememberInput').checked = true;
  await window.handleAdminLogin({ preventDefault() {} });
  assert.equal(window.localStorage.getItem('xbook_admin_token'), 'token-abc');
  assert.equal(window.isAdminAuthed(), true);
  // Đăng nhập xong → ẩn form mật khẩu, hiện thẳng Bảng Quản Lý trên cùng trang
  assert.equal(window.document.getElementById('adminLoginPanel').classList.contains('hidden'), true);
  assert.equal(window.document.getElementById('adminPanel').classList.contains('hidden'), false);

  // 3. Bỏ tích "Ghi nhớ" → chỉ lưu trong phiên (sessionStorage), không ghi ra ổ đĩa
  window.document.getElementById('adminPasswordInput').value = 'secret';
  window.document.getElementById('adminRememberInput').checked = false;
  await window.handleAdminLogin({ preventDefault() {} });
  assert.equal(window.localStorage.getItem('xbook_admin_token'), null);
  assert.equal(window.sessionStorage.getItem('xbook_admin_token'), 'token-abc');

  // 4. Mọi API quản trị gửi kèm token phiên, không gửi mật khẩu
  calls.length = 0;
  await window.adminFetch('/api/admin/statistics');
  const statsCall = calls.find(c => c.url === '/api/admin/statistics');
  assert.equal(statsCall.options.headers['x-admin-token'], 'token-abc');
  assert.equal('x-admin-password' in statsCall.options.headers, false);

  // 5. Form sách: tích "khoa/lớp cần học" của sách + lưu lên server
  window.openBookForm('shared');
  const classKeyOf = (dept, name) => JSON.stringify([dept, name]);
  const boxOf = (dept, name) => window.document.querySelector(`#bookScopeClasses input[value='${classKeyOf(dept, name)}']`);
  assert.ok(window.document.querySelector('#bookScopeDepartments input[data-scope-dept="IT"]'));
  assert.equal(boxOf('IT', 'A').checked, true);
  assert.equal(boxOf('Business', 'A').checked, true);
  assert.equal(boxOf('IT', 'B').checked, false);
  // Tích cả khoa Business → mọi lớp của khoa đó được chọn
  const businessDept = window.document.querySelector('#bookScopeDepartments input[data-scope-dept="Business"]');
  businessDept.checked = true;
  window.toggleBookScopeDepartment(businessDept);
  assert.equal(boxOf('Business', 'A').checked, true);
  assert.match(window.document.getElementById('bookScopeSummary').innerText, /sách cần học/);

  window.document.getElementById('formBookTitle').value = 'Shared 2';
  window.document.getElementById('formBookPrice').value = '150';
  calls.length = 0;
  await window.handleBookFormSubmit({ preventDefault() {} });
  const saved = JSON.parse(calls.find(c => String(c.url).startsWith('/api/admin/books')).options.body);
  assert.deepEqual(saved.departments, ['Business']);
  assert.deepEqual(saved.classKeys, [classKeyOf('IT', 'A')]);

  // 6. Thư viện sách: lọc theo khoa / lớp / từ khóa
  window.renderAdminManageTab();
  assert.ok(window.xbookSelectOptions('manageDeptFilter').some(o => o.value === 'Business'));
  window.setManageDeptFilter('Business');
  assert.equal(window.document.querySelectorAll('#adminBooksTableBody tr').length, 1);
  assert.match(window.document.getElementById('manageBooksCount').innerText, /1\/3/);
  window.setManageDeptFilter('__ALL__');
  window.setManageBookSearch('other');
  assert.equal(window.document.querySelectorAll('#adminBooksTableBody tr').length, 1);
  window.setManageBookSearch('');
  assert.equal(window.document.querySelectorAll('#adminBooksTableBody tr').length, 3);

  // 7. Khóa lại → xóa token và quay về form mật khẩu ngay trên trang quản trị
  window.handleAdminLogout();
  assert.equal(window.isAdminAuthed(), false);
  assert.equal(window.localStorage.getItem('xbook_admin_token'), null);
  assert.equal(window.sessionStorage.getItem('xbook_admin_token'), null);
  assert.equal(window.document.getElementById('adminPanel').classList.contains('hidden'), true);
  assert.equal(window.document.getElementById('adminLoginPanel').classList.contains('hidden'), false);
  dom.window.close();
});

test('checkout requires name, phone and class — picked from the custom dropdown, never a native select', async () => {
  const fixture = {
    books: [{ id: 'shared', title: 'Shared', price: 100 }],
    settings: { isRegistrationOpen: true, departments: ['IT', 'Business'], classes: [
      { name: 'A', department: 'IT', bookIds: ['shared'] },
      { name: 'A', department: 'Business', bookIds: ['shared'] }
    ] }
  };
  let orderBody = null;
  const reply = (payload) => ({ status: 200, headers: { get: () => null }, json: async () => payload });
  const dom = loadPage('public/index.html', STOREFRONT_SCRIPTS, {
    fetch: async (url, options = {}) => {
      if (url === '/api/orders/create-payment-link') {
        orderBody = JSON.parse(options.body);
        return reply({ success: true, data: { orderCode: 1, amount: 100, quantity: 1, bookTitle: 'Shared', qrCode: '', accountNumber: '', bin: '', accountName: '', description: 'XB1' } });
      }
      if (url === '/api/books') return reply({ success: true, ...fixture });
      return reply({ success: true });
    }
  });
  const { window } = dom;
  await window.fetchBooksAndSettings();
  window.toggleCartBook('shared');
  window.openCheckoutModal();

  // 1. Toàn bộ ô chọn khoa/lớp là dropdown tự vẽ — không còn <select> gốc của trình duyệt
  assert.equal(window.document.querySelectorAll('select').length, 0);
  assert.equal(window.document.querySelectorAll('datalist').length, 0);
  const picker = window.document.getElementById('formCustomerClass');
  assert.ok(picker.querySelector('[data-xbook-trigger]'));
  assert.ok(picker.querySelector('[data-xbook-panel]'));

  // 2. Mở dropdown → panel hiện, chọn lớp Business / A bằng click
  picker.querySelector('[data-xbook-trigger]').click();
  assert.equal(picker.querySelector('[data-xbook-panel]').classList.contains('hidden'), false);
  const option = [...picker.querySelectorAll('[data-xbook-option]')].find(o => o.dataset.value === window.XBookDomain.classKey(fixture.settings.classes[1]));
  option.click();
  assert.equal(window.xbookSelectValue('formCustomerClass'), window.XBookDomain.classKey(fixture.settings.classes[1]));
  assert.equal(picker.querySelector('[data-xbook-panel]').classList.contains('hidden'), true);

  // 3. Thiếu họ tên / số điện thoại / lớp → báo lỗi tại chỗ, KHÔNG gửi đơn
  const name = window.document.getElementById('formCustomerName');
  const phone = window.document.getElementById('formCustomerPhone');
  const date = window.document.getElementById('formCustomerDeliveryDate');
  name.value = 'An';
  phone.value = '0987 654 321';
  date.value = date.min || '2030-01-01';
  await window.handleCreatePayment({ preventDefault() {} });
  assert.equal(window.document.getElementById('formCustomerNameError').classList.contains('hidden'), false);
  assert.equal(orderBody, null);

  name.value = 'Nguyễn Văn An';
  phone.value = '';
  await window.handleCreatePayment({ preventDefault() {} });
  assert.equal(window.document.getElementById('formCustomerPhoneError').classList.contains('hidden'), false);
  assert.equal(orderBody, null);

  phone.value = '12345';
  await window.handleCreatePayment({ preventDefault() {} });
  assert.equal(window.document.getElementById('formCustomerPhoneError').classList.contains('hidden'), false);
  assert.equal(orderBody, null);

  window.setXBookSelectValue('formCustomerClass', '', { silent: true });
  phone.value = '0987 654 321';
  await window.handleCreatePayment({ preventDefault() {} });
  assert.equal(window.document.getElementById('formCustomerClassError').classList.contains('hidden'), false);
  assert.equal(orderBody, null);

  // 4. Đủ 3 thông tin → gửi đơn kèm đúng lớp (tên lớp + khoa) và SĐT đã chuẩn hóa
  window.setXBookSelectValue('formCustomerClass', window.XBookDomain.classKey(fixture.settings.classes[1]), { silent: true });
  await window.handleCreatePayment({ preventDefault() {} });
  assert.equal(orderBody.customerName, 'Nguyễn Văn An');
  assert.equal(orderBody.customerPhone, '0987654321');
  assert.equal(orderBody.customerClass, 'A');
  assert.equal(orderBody.customerDepartment, 'Business');
  dom.window.close();
});

test('admin filters orders by order date / payment date and settles per day', async () => {
  const today = new Date();
  const dayKey = (offset) => {
    const d = new Date(today.getTime() + offset * 86400000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const at = (offset, hour = 10) => new Date(`${dayKey(offset)}T${String(hour).padStart(2, '0')}:00:00`).toISOString();

  const item = (bookId, bookTitle, quantity, unitPrice) => ({ bookId, bookTitle, quantity, unitPrice });
  const order = (orderCode, createdAt, paidAt, items) => ({
    orderCode, status: 'PAID', customerName: `Bạn ${orderCode}`, customerClass: 'A', customerDepartment: 'IT',
    customerPhone: '0987654321', amount: items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0),
    createdAt, paidAt, isDelivered: false, items
  });

  const stats = {
    totalOrders: 4, paidOrdersCount: 3, totalBooksPaid: 5, totalRevenue: 300000,
    bookSummary: [], settings: { isRegistrationOpen: true, departments: ['IT', 'Business'], classes: [] },
    allOrders: [
      // 1: hôm nay, 100k, Shared x1
      order(1, at(0), at(0), [item('shared', 'Shared', 1, 100000)]),
      // 2: đặt hôm qua / trả hôm nay, 150k, Shared x1 + Other x2
      order(2, at(-1), at(0), [item('shared', 'Shared', 1, 50000), item('other', 'Other', 2, 50000)]),
      // 3: hôm qua, 50k, Other x1
      order(3, at(-1), at(-1), [item('other', 'Other', 1, 50000)]),
      // 4: chưa thanh toán
      { ...order(4, at(-5), null, [item('shared', 'Shared', 1, 70000)]), status: 'PENDING', paidAt: null }
    ]
  };

  const reply = (payload) => ({ status: 200, headers: { get: () => null }, json: async () => payload });
  const dom = loadPage('public/admin.html', ADMIN_SCRIPTS, {
    fetch: async () => reply({ success: true, data: stats, books: [], settings: stats.settings })
  });
  const { window } = dom;

  window.allAdminOrders = stats.allOrders;
  window.cachedPaidOrders = stats.allOrders.filter(o => o.status === 'PAID');
  window.renderAdminDateFilter();
  window.renderAdminTabsWithFilter();

  // Bắt sự kiện cho thanh lọc ngày (delegation) rồi nạp dữ liệu quản trị
  window.initAdminDelegatedEvents();
  assert.ok(window.document.querySelector('#adminDatePresetChips [data-date-preset]'));

  // 1. Mặc định: tất cả thời gian — số liệu và bảng quyết toán tính toàn bộ
  assert.equal(window.isAdminDateFilterActive(), false);
  assert.equal(window.filteredPaidOrders.length, 3);
  assert.match(window.document.getElementById('adminDateSummary').textContent, /Tất cả thời gian/);
  assert.equal(window.document.getElementById('settlementDayCount').innerText, '2');
  assert.equal(window.document.getElementById('settlementOrders').innerText, '3');
  assert.equal(window.document.getElementById('settlementBooks').innerText, '5');
  assert.equal(window.document.getElementById('settlementAmount').innerText, '300.000 đ');

  // 1b. Thanh lọc ngày nằm NGOÀI các tab (hiện ở mọi tab) + có tab "Quyết toán" riêng
  const filterBar = window.document.getElementById('adminDatePresetChips');
  assert.equal(window.document.querySelector('#adminTabOrders #adminDatePresetChips'), null);
  assert.equal(window.document.getElementById('adminTabOrders').contains(filterBar), false);
  assert.ok(window.document.querySelector('[data-tab="settlement"]'));
  assert.ok(window.document.getElementById('adminTabSettlement').contains(window.document.getElementById('adminDailyBreakdownBody')));
  window.switchAdminTab('settlement');
  assert.equal(window.document.getElementById('adminTabSettlement').classList.contains('hidden'), false);
  assert.equal(window.document.getElementById('adminTabOrders').classList.contains('hidden'), true);
  window.switchAdminTab('orders');

  // 2. Bảng quyết toán từng ngày: gộp đúng theo ngày đặt, có thanh tỷ trọng + dòng TỔNG CỘNG
  let rows = [...window.document.querySelectorAll('#adminDailyBreakdownBody tr')];
  assert.equal(rows.length, 3); // hôm nay, hôm qua, TỔNG CỘNG
  const todayRow = rows.find(r => r.textContent.includes(window.formatDateKeyVN(dayKey(0))));
  assert.match(todayRow.textContent, /1\s*1\s*100\.000 đ/);
  assert.ok(todayRow.querySelector('.bg-emerald-500'), 'mỗi ngày có thanh tỷ trọng doanh thu');
  const yesterdayRow = rows.find(r => r.textContent.includes(window.formatDateKeyVN(dayKey(-1))));
  assert.match(yesterdayRow.textContent, /2\s*4\s*200\.000 đ/); // 2 đơn · 4 cuốn · 200k
  assert.match(rows[rows.length - 1].textContent, /TỔNG CỘNG/);

  // 2b. SÁCH ĐÃ BÁN: mỗi đầu sách bao nhiêu cuốn + tỷ trọng + TỔNG CỘNG
  let soldRows = [...window.document.querySelectorAll('#adminSoldBooksBody tr')];
  assert.equal(soldRows.length, 3); // Other, Shared, TỔNG CỘNG (xếp theo SL giảm dần)
  assert.match(soldRows[0].textContent, /Other/);
  assert.match(soldRows[0].textContent, /3/);          // 3 cuốn Other
  assert.match(soldRows[0].textContent, /60%/);        // 3/5
  assert.match(soldRows[0].textContent, /150\.000 đ/);
  assert.match(soldRows[1].textContent, /Shared/);
  assert.match(soldRows[1].textContent, /2/);          // 2 cuốn Shared
  assert.match(soldRows[1].textContent, /40%/);        // 2/5
  assert.match(soldRows[2].textContent, /TỔNG CỘNG \(2 đầu sách\)/);
  assert.match(soldRows[2].textContent, /5/);
  assert.match(soldRows[2].textContent, /300\.000 đ/);
  assert.equal(window.document.getElementById('settlementBookTitles').innerText, '2 đầu sách · 5 cuốn · 300.000 đ');
  assert.ok(soldRows[0].querySelector('.bg-emerald-500'), 'có thanh tỷ trọng theo đầu sách');

  // 2c. Bấm một đầu sách → nhảy sang tab Đơn hàng và lọc đúng người mua cuốn đó (bấm lại để bỏ)
  soldRows[1].click();
  // Bấm đầu sách → tự chuyển sang tab Đơn hàng và điền sẵn tên sách vào ô tìm kiếm
  assert.equal(window.document.getElementById('adminTabOrders').classList.contains('hidden'), false);
  assert.equal(window.document.getElementById('adminTabSettlement').classList.contains('hidden'), true);
  assert.equal(window.document.getElementById('adminSearchStudentInput').value, 'Shared');
  assert.deepEqual(window.getFilteredPaidOrders().map(o => o.orderCode).sort(), [1, 2]);
  window.filterBySoldBook('Shared');
  assert.equal(window.document.getElementById('adminSearchStudentInput').value, '');

  // 2d. Lọc riêng một ngày → bảng "sách đã bán" chỉ còn các cuốn bán trong ngày đó
  window.setAdminDateSingleDay(dayKey(-1));
  const soldYesterday = [...window.document.querySelectorAll('#adminSoldBooksBody tr')];
  assert.match(soldYesterday[0].textContent, /Other/);
  assert.match(soldYesterday[0].textContent, /3/);   // Other x3 trong ngày hôm qua
  assert.match(soldYesterday[1].textContent, /Shared/);
  assert.match(soldYesterday[1].textContent, /1/);   // Shared x1
  window.setAdminDatePreset('all');

  // 3. Chip "Hôm nay" trên thanh lọc → số liệu, 4 thẻ quyết toán và bảng đều theo đúng ngày đó
  [...window.document.querySelectorAll('#adminDatePresetChips button')].find(b => b.textContent === 'Hôm nay').click();
  assert.equal(window.filteredPaidOrders.length, 1);
  assert.equal(window.filteredPaidOrders[0].orderCode, 1);
  assert.match(window.document.getElementById('adminDateSummary').textContent, /100\.000 đ/);
  assert.equal(window.document.getElementById('settlementDayCount').innerText, '1');
  assert.equal(window.document.getElementById('settlementOrders').innerText, '1');
  assert.equal(window.document.getElementById('settlementBooks').innerText, '1');
  assert.equal(window.document.getElementById('settlementAmount').innerText, '100.000 đ');
  assert.equal(window.document.querySelectorAll('#adminDailyBreakdownBody tr').length, 1);
  const soldToday = [...window.document.querySelectorAll('#adminSoldBooksBody tr')];
  assert.match(soldToday[0].textContent, /Shared/);
  assert.match(soldToday[0].textContent, /100%/);
  assert.equal(window.document.getElementById('settlementBookTitles').innerText, '1 đầu sách · 1 cuốn · 100.000 đ');

  // 4. Bấm một dòng ngày để lọc đúng ngày đó — bấm lại để bỏ lọc
  window.setAdminDatePreset('all');
  rows = [...window.document.querySelectorAll('#adminDailyBreakdownBody tr')];
  rows.find(r => r.textContent.includes(window.formatDateKeyVN(dayKey(-1)))).click();
  const clickedState = window.adminDateFilterState();
  assert.equal(clickedState.preset, 'yesterday');
  assert.equal(clickedState.from, dayKey(-1));
  assert.equal(clickedState.to, dayKey(-1));
  assert.deepEqual(window.filteredPaidOrders.map(o => o.orderCode).sort(), [2, 3]);
  window.setAdminDateSingleDay(dayKey(-1));
  assert.equal(window.isAdminDateFilterActive(), false);

  // 5. Đổi sang NGÀY THANH TOÁN: hôm nay = 2 đơn (1 + 2), hôm qua = 1 đơn
  window.setAdminDateBasis('paid');
  window.setAdminDatePreset('today');
  assert.deepEqual(window.filteredPaidOrders.map(o => o.orderCode).sort(), [1, 2]);
  assert.match(window.document.getElementById('adminDateSummary').textContent, /250\.000 đ/);
  window.setAdminDatePreset('yesterday');
  assert.deepEqual(window.filteredPaidOrders.map(o => o.orderCode), [3]);

  // 6. Khoảng tùy chọn (Từ ngày → Đến ngày) và tự đảo nếu nhập ngược
  window.setAdminDateBasis('created');
  window.document.getElementById('adminDateFromInput').value = dayKey(-1);
  window.document.getElementById('adminDateToInput').value = dayKey(0);
  window.handleAdminDateRangeInput();
  assert.equal(window.adminDateFilterState().preset, 'custom');
  assert.equal(window.filteredPaidOrders.length, 3);
  assert.match(window.adminDateRangeLabel(), /Từ .* đến .*/);
  window.document.getElementById('adminDateFromInput').value = dayKey(0);
  window.document.getElementById('adminDateToInput').value = dayKey(-1);
  window.handleAdminDateRangeInput();
  assert.deepEqual([window.adminDateFilterState().from, window.adminDateFilterState().to], [dayKey(-1), dayKey(0)]);

  // 7. Bảng tổng hợp sách + số liệu đầu trang đổi theo khoảng lọc
  window.setAdminDatePreset('yesterday');
  assert.match(window.document.getElementById('adminPaidCount').innerText, /2 đơn đã nộp \(4 cuốn\)/);
  assert.match(window.document.getElementById('adminTotalRevenue').innerText, /200\.000 đ/);
  const summary = window.computeBookSummary(window.filteredPaidOrders);
  assert.equal(summary.find(b => b.id === 'shared').totalQuantity, 1);
  assert.equal(summary.find(b => b.id === 'other').totalQuantity, 3);

  // 8. Khoảng không có đơn nào → mọi số liệu về 0, bảng quyết toán báo trống
  window.document.getElementById('adminDateFromInput').value = dayKey(30);
  window.document.getElementById('adminDateToInput').value = dayKey(30);
  window.handleAdminDateRangeInput();
  assert.equal(window.filteredPaidOrders.length, 0);
  assert.match(window.document.getElementById('adminDateSummary').textContent, /0 đơn đã nộp/);
  assert.match(window.document.getElementById('adminPaidCount').innerText, /0 đơn đã nộp \(0 cuốn\)/);
  assert.equal(window.document.getElementById('settlementAmount').innerText, '0 đ');
  assert.match(window.document.getElementById('adminDailyBreakdownBody').textContent, /Chưa có đơn nào đã thanh toán/);
  assert.match(window.document.getElementById('adminSoldBooksBody').textContent, /Chưa có sách nào được bán/);
  assert.equal(window.document.getElementById('settlementBookTitles').innerText, '0 đầu sách · 0 cuốn · 0 đ');

  // 9. Bỏ lọc → trở lại toàn bộ dữ liệu gốc
  window.setAdminDatePreset('all');
  assert.equal(window.filteredPaidOrders.length, 3);
  assert.equal(window.isAdminDateFilterActive(), false);
  dom.window.close();
});
