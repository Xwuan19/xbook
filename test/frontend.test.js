const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

test('UI filters by curriculum, edits class lists and has no book ownership field', async () => {
  const html = fs.readFileSync('public/index.html', 'utf8');
  const dom = new JSDOM(html, { url: 'https://xbook.test', runScripts: 'outside-only' });
  const { window } = dom;
  window.lucide = { createIcons() {} };
  window.alert = () => {};
  const fixture = {
    books: [{ id: 'shared', title: 'Shared', price: 100 }, { id: 'it', title: 'IT only', price: 200 }, { id: 'other', title: 'Other', price: 300 }],
    settings: { isRegistrationOpen: true, departments: ['IT', 'Business'], classes: [
      { name: 'A', department: 'IT', bookIds: ['shared', 'it'] },
      { name: 'A', department: 'Business', bookIds: ['shared'] },
      { name: 'B', department: 'IT', bookIds: [] }
    ] }
  };
  window.fetch = async (url, options) => {
    const reply = (payload) => ({ status: 200, headers: { get: () => null }, json: async () => payload });
    if (url === '/api/admin/settings') {
      fixture.settings = { ...fixture.settings, ...JSON.parse(options.body) };
      return reply({ success: true, settings: fixture.settings });
    }
    return reply({ success: true, ...fixture });
  };
  window.eval(fs.readFileSync('public/domain.js', 'utf8'));
  window.eval(fs.readFileSync('public/app.js', 'utf8'));
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
  window.renderAdminManageTab();
  // Ô chọn lớp là dropdown tự vẽ (không dùng select mặc định của trình duyệt)
  assert.equal(window.document.querySelectorAll('select').length, 0);
  window.setXBookSelectValue('classBookEditorSelect', window.XBookDomain.classKey(fixture.settings.classes[1]), { silent: true });
  window.renderClassBookChoices();
  assert.equal(window.document.querySelector('#classBookChoices input[value="shared"]').checked, true);
  window.document.querySelector('#classBookChoices input[value="it"]').checked = true;
  await window.saveClassBooks({ preventDefault() {} });
  assert.deepEqual(fixture.settings.classes[1].bookIds, ['shared', 'it']);
  window.openBookForm('shared');
  assert.equal(window.document.getElementById('formBookTitle').value, 'Shared');
  assert.equal(window.document.getElementById('formBookDepartment'), null);
  assert.equal(window.document.getElementById('formBookClasses'), null);
  window.renderCheckoutClassPicker();
  const classLabels = window.xbookSelectOptions('formCustomerClass').map(o => o.label);
  assert.ok(classLabels.includes('Business / A'));
  assert.ok(classLabels.includes('IT / A'));
  assert.ok(window.document.getElementById('formCustomerDeliveryDate') !== null);
  window.toggleCartBook('shared');
  window.openCheckoutModal();
  assert.ok(window.document.getElementById('formCustomerDeliveryDate').min.length > 0);
  dom.window.close();
});

test('admin session token, book scope editor and book library filters', async () => {
  const html = fs.readFileSync('public/index.html', 'utf8');
  const dom = new JSDOM(html, { url: 'https://xbook.test', runScripts: 'outside-only' });
  const { window } = dom;
  window.lucide = { createIcons() {} };
  window.alert = () => {};
  window.confirm = () => true;

  const fixture = {
    books: [
      { id: 'shared', title: 'Shared', price: 100 },
      { id: 'it', title: 'IT only', price: 200 },
      { id: 'other', title: 'Other', price: 300 }
    ],
    settings: { isRegistrationOpen: true, departments: ['IT', 'Business'], classes: [
      { name: 'A', department: 'IT', bookIds: ['shared', 'it'] },
      { name: 'A', department: 'Business', bookIds: ['shared'] },
      { name: 'B', department: 'IT', bookIds: [] }
    ] }
  };
  const calls = [];
  const reply = (payload, status = 200, headers = {}) => ({
    status,
    headers: { get: (name) => headers[name.toLowerCase()] || null },
    json: async () => payload
  });
  window.fetch = async (url, options = {}) => {
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
  };

  window.eval(fs.readFileSync('public/domain.js', 'utf8'));
  window.eval(fs.readFileSync('public/app.js', 'utf8'));
  await window.fetchBooksAndSettings();

  // 1. Chưa đăng nhập → không có quyền quản trị
  assert.equal(window.isAdminAuthed(), false);
  assert.equal(window.localStorage.getItem('xbook_admin_token'), null);

  // 2. Đăng nhập có tích "Ghi nhớ" → token lưu localStorage (mở lại web không cần nhập mật khẩu)
  window.document.getElementById('adminPasswordInput').value = 'secret';
  window.document.getElementById('adminRememberInput').checked = true;
  await window.handleAdminLogin({ preventDefault() {} });
  assert.equal(window.localStorage.getItem('xbook_admin_token'), 'token-abc');
  assert.equal(window.isAdminAuthed(), true);

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

  // 7. PWA: đã khai báo manifest + service worker + meta iPhone
  assert.ok(window.document.querySelector('link[rel="manifest"]').getAttribute('href').includes('manifest.webmanifest'));
  assert.equal(window.document.querySelector('meta[name="apple-mobile-web-app-capable"]').getAttribute('content'), 'yes');
  assert.ok(window.document.querySelector('link[rel="apple-touch-icon"]'));
  assert.ok(window.document.getElementById('iosInstallHint'));

  window.handleAdminLogout();
  assert.equal(window.isAdminAuthed(), false);
  assert.equal(window.localStorage.getItem('xbook_admin_token'), null);
  assert.equal(window.sessionStorage.getItem('xbook_admin_token'), null);
  dom.window.close();
});

test('checkout requires name, phone and class — picked from the custom dropdown, never a native select', async () => {
  const html = fs.readFileSync('public/index.html', 'utf8');
  const dom = new JSDOM(html, { url: 'https://xbook.test', runScripts: 'outside-only' });
  const { window } = dom;
  window.lucide = { createIcons() {} };
  window.alert = () => {};

  const fixture = {
    books: [{ id: 'shared', title: 'Shared', price: 100 }],
    settings: { isRegistrationOpen: true, departments: ['IT', 'Business'], classes: [
      { name: 'A', department: 'IT', bookIds: ['shared'] },
      { name: 'A', department: 'Business', bookIds: ['shared'] }
    ] }
  };
  let orderBody = null;
  const reply = (payload) => ({ status: 200, headers: { get: () => null }, json: async () => payload });
  window.fetch = async (url, options = {}) => {
    if (url === '/api/orders/create-payment-link') {
      orderBody = JSON.parse(options.body);
      return reply({ success: true, data: { orderCode: 1, amount: 100, quantity: 1, bookTitle: 'Shared', qrCode: '', accountNumber: '', bin: '', accountName: '', description: 'XB1' } });
    }
    if (url === '/api/books') return reply({ success: true, ...fixture });
    return reply({ success: true });
  };

  window.eval(fs.readFileSync('public/domain.js', 'utf8'));
  window.eval(fs.readFileSync('public/app.js', 'utf8'));
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
