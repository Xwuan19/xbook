const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('admin UI lives on its own page: /admin redirects to /admin.html and the home page is clean', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xbook-routes-'));
  for (const file of ['server.js', 'database.js']) {
    fs.copyFileSync(path.join(__dirname, '..', file), path.join(dir, file));
  }
  fs.mkdirSync(path.join(dir, 'public'));
  for (const file of ['domain.js', 'core.js', 'app.js', 'admin.js', 'index.html', 'admin.html']) {
    fs.copyFileSync(path.join(__dirname, '../public', file), path.join(dir, 'public', file));
  }
  fs.symlinkSync(path.join(__dirname, '../node_modules'), path.join(dir, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  process.env.DATABASE_URL = '';
  process.env.ADMIN_PASSWORD = 'test-password';
  const app = require(path.join(dir, 'server.js'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    // 1. Route /admin chuyển hướng sang trang quản trị riêng
    const redirect = await fetch(`${base}/admin`, { redirect: 'manual' });
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.get('location'), '/admin.html');
    assert.equal((await fetch(`${base}/admin/`, { redirect: 'manual' })).status, 302);

    // 2. /admin.html phục vụ trang quản trị (đăng nhập + Bảng Quản Lý + form sách)
    const adminPage = await fetch(`${base}/admin.html`);
    assert.equal(adminPage.status, 200);
    const adminHtml = await adminPage.text();
    assert.match(adminHtml, /id="adminLoginPanel"/);
    assert.match(adminHtml, /id="adminPanel"/);
    assert.match(adminHtml, /id="bookFormModal"/);
    assert.match(adminHtml, /src="core\.js"/);
    assert.match(adminHtml, /src="admin\.js"/);
    // Trang quản trị không nạp code trang chủ (app.js) và ngược lại không còn vỏ modal cũ
    assert.equal(/src="app\.js"/.test(adminHtml), false);
    assert.equal(/id="adminModal"/.test(adminHtml), false);
    assert.equal(/id="adminLoginModal"/.test(adminHtml), false);

    // 3. Bám theo redirect thì nhận đúng nội dung trang quản trị
    const followed = await fetch(`${base}/admin`);
    assert.equal(followed.status, 200);
    assert.match(await followed.text(), /Bảng Quản Lý/);

    // 4. Trang chủ KHÔNG còn bất kỳ giao diện quản lý nào, chỉ giữ link sang /admin.html
    const homePage = await fetch(`${base}/`);
    assert.equal(homePage.status, 200);
    const homeHtml = await homePage.text();
    assert.equal(/id="adminModal"/.test(homeHtml), false);
    assert.equal(/id="adminLoginModal"/.test(homeHtml), false);
    assert.equal(/id="bookFormModal"/.test(homeHtml), false);
    assert.equal(/id="adminTabBar"/.test(homeHtml), false);
    assert.equal(/handleClickAdmin/.test(homeHtml), false);
    assert.match(homeHtml, /href="\/admin\.html"/);
    assert.match(homeHtml, /src="core\.js"/);
    assert.match(homeHtml, /src="app\.js"/);
    assert.equal(/src="admin\.js"/.test(homeHtml), false);
    // Giao diện sinh viên vẫn còn nguyên trên trang chủ
    assert.match(homeHtml, /id="bookGrid"/);
    assert.match(homeHtml, /id="checkoutModal"/);
    assert.match(homeHtml, /id="qrPaymentModal"/);
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
