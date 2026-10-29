/**
 * ============================================================================
 * KIỂM THỬ LUỒNG THANH TOÁN PAYOS (webhook, polling, đối soát thủ công)
 * ============================================================================
 * Bối cảnh lỗi thực tế: khách đã chuyển tiền nhưng web không ghi nhận đơn,
 * vì `payos.webhooks.verify()` của SDK v2 là hàm async mà code cũ không `await`
 * → `verifiedData` là 1 Promise → orderCode = undefined → "Đơn không tồn tại".
 *
 * Bộ test này chạy với 1 PayOS server giả (PAYOS_BASE_URL) nên KHÔNG gọi mạng thật:
 *  1. Tạo đơn qua API thật (lưu PENDING trước khi phát mã QR).
 *  2. Webhook có chữ ký đúng → đơn chuyển PAID + lưu sao kê + tính vào doanh thu.
 *  3. Webhook cho đơn không có trong DB → tự tạo bản ghi PAID (không mất tiền).
 *  4. Chữ ký sai / số tiền lệch → không đổi dữ liệu.
 *  5. Gửi lại webhook nhiều lần → idempotent.
 *  6. Nút "Đối soát PayOS" của admin: đơn chưa thanh toán / đã thanh toán / đơn mất.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');

const CHECKSUM_KEY = 'test-checksum-key-xbook';
const ADMIN_PASSWORD = 'test-password';

/** Ký webhook giống @payos/node: sort key → `k=v&k=v` → HMAC-SHA256 hex */
function signWebhookData(data) {
  const payload = Object.keys(data)
    .sort()
    .filter((key) => data[key] !== undefined)
    .map((key) => {
      let value = data[key];
      if (Array.isArray(value)) value = JSON.stringify(value);
      if ([null, undefined, 'undefined', 'null'].includes(value)) value = '';
      return `${key}=${value}`;
    })
    .join('&');
  return crypto.createHmac('sha256', CHECKSUM_KEY).update(payload).digest('hex');
}

test('PayOS payments are always recorded: webhook signature, recovery, idempotency and manual reconcile', async () => {
  // ---------------------------------------------------------------- PayOS giả
  const payosLinks = new Map();
  const payosServer = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const send = (status, payload) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    };
    if (req.method === 'POST' && url.pathname === '/v2/payment-requests') {
      let raw = '';
      req.on('data', (chunk) => { raw += chunk; });
      req.on('end', () => {
        const body = JSON.parse(raw || '{}');
        const link = {
          id: `link-${body.orderCode}`,
          orderCode: body.orderCode,
          amount: body.amount,
          description: body.description,
          accountNumber: '0123456789',
          accountName: 'LE VAN QUYEN - XBOOK',
          bin: '970422',
          checkoutUrl: `https://pay.payos.vn/web/${body.orderCode}`,
          qrCode: `QR-${body.orderCode}`,
          status: 'PENDING',
          createdAt: new Date().toISOString(),
          transactions: []
        };
        payosLinks.set(Number(body.orderCode), link);
        return send(200, { code: '00', desc: 'success', data: link });
      });
      return;
    }
    const match = url.pathname.match(/^\/v2\/payment-requests\/(\d+)$/);
    if (req.method === 'GET' && match) {
      const link = payosLinks.get(Number(match[1]));
      if (!link) return send(400, { code: '01', desc: 'Không tìm thấy link thanh toán', data: null });
      return send(200, { code: '00', desc: 'success', data: link });
    }
    return send(404, { code: '01', desc: 'not found', data: null });
  });
  await new Promise((resolve) => payosServer.listen(0, '127.0.0.1', resolve));
  const payosBaseUrl = `http://127.0.0.1:${payosServer.address().port}`;

  // ------------------------------------------------------- Server XBook tạm
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xbook-payment-'));
  for (const file of ['server.js', 'database.js']) fs.copyFileSync(path.join(__dirname, '..', file), path.join(dir, file));
  fs.mkdirSync(path.join(dir, 'public'));
  fs.copyFileSync(path.join(__dirname, '../public/domain.js'), path.join(dir, 'public/domain.js'));
  fs.symlinkSync(path.join(__dirname, '../node_modules'), path.join(dir, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');

  process.env.DATABASE_URL = '';
  process.env.PAYOS_CLIENT_ID = '11111111-2222-3333-4444-555555555555';
  process.env.PAYOS_API_KEY = 'test-api-key';
  process.env.PAYOS_CHECKSUM_KEY = CHECKSUM_KEY;
  process.env.PAYOS_BASE_URL = payosBaseUrl;
  process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;

  const app = require(path.join(dir, 'server.js'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const request = async (url, method = 'GET', body, headers = {}) => {
    const res = await fetch(`${base}${url}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-admin-password': ADMIN_PASSWORD, ...headers },
      body: body ? JSON.stringify(body) : undefined
    });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };

  const webhookPayload = (orderCode, amount, overrides = {}) => {
    const data = {
      orderCode,
      amount,
      description: `XB${orderCode}`,
      accountNumber: '0123456789',
      reference: `FT${orderCode}`,
      transactionDateTime: '2026-10-29 10:15:00',
      currency: 'VND',
      paymentLinkId: `link-${orderCode}`,
      code: '00',
      desc: 'success',
      counterAccountBankId: '970422',
      counterAccountName: 'NGUYEN VAN A',
      counterAccountNumber: '0987654321',
      virtualAccountName: '',
      virtualAccountNumber: '',
      ...overrides
    };
    return { code: '00', desc: 'success', success: true, data, signature: signWebhookData(data) };
  };

  try {
    // Bắt buộc phải có lớp để đặt được đơn
    await request('/api/admin/settings', 'PUT', {
      departments: ['Khoa CNTT'],
      classes: [{ name: 'CNTT K15', department: 'Khoa CNTT', bookIds: ['sach-04'] }]
    });

    // ---------------- 1. Đặt đơn: phải LƯU PENDING trước khi trả mã QR ----------
    const created = await request('/api/orders/create-payment-link', 'POST', {
      customerName: 'Nguyen Van A',
      customerPhone: '0987654321',
      customerClass: 'CNTT K15',
      customerDepartment: 'Khoa CNTT',
      items: [{ bookId: 'sach-04', quantity: 2 }]
    });
    assert.equal(created.status, 200, 'đặt đơn thành công');
    const { orderCode, amount } = created.data.data;
    assert.equal(amount, 70000);
    assert.ok(orderCode > 0);
    assert.ok(created.data.data.checkoutUrl, 'trả về link thanh toán PayOS');

    const statsAfterCreate = (await request('/api/admin/statistics')).data.data;
    const pendingOrder = statsAfterCreate.allOrders.find((o) => o.orderCode === orderCode);
    assert.ok(pendingOrder, 'đơn đã được lưu vào web ngay khi tạo mã QR');
    assert.equal(pendingOrder.status, 'PENDING');
    assert.equal(pendingOrder.checkoutUrl, `https://pay.payos.vn/web/${orderCode}`, 'link QR được gắn vào đơn đã lưu');

    // ---------------- 2. Webhook chữ ký đúng → ghi nhận thanh toán -------------
    const hook = await request('/api/payos-webhook', 'POST', webhookPayload(orderCode, amount));
    assert.equal(hook.status, 200);
    assert.equal(hook.data.success, true);
    assert.equal(hook.data.data.status, 'PAID');

    let stats = (await request('/api/admin/statistics')).data.data;
    const paidOrder = stats.allOrders.find((o) => o.orderCode === orderCode);
    assert.equal(paidOrder.status, 'PAID', 'đơn chuyển sang đã thanh toán');
    assert.equal(paidOrder.paidAt, '2026-10-29T03:15:00.000Z', 'giờ thanh toán hiểu đúng múi giờ Việt Nam (+07)');
    assert.equal(paidOrder.bankReference, `FT${orderCode}`);
    assert.equal(stats.paidOrdersCount, 1);
    assert.equal(stats.totalRevenue, amount, 'doanh thu ghi nhận đúng');

    const dbDump = JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf-8'));
    assert.equal(dbDump.transactions.length, 1, 'lưu sao kê giao dịch');
    assert.equal(dbDump.transactions[0].orderCode, orderCode);
    assert.equal(dbDump.webhook_logs.length, 1, 'lưu nhật ký webhook');
    assert.equal(dbDump.webhook_logs[0].isVerified, true);

    // ---------------- 3. Gửi lại webhook (PayOS retry) → idempotent -------------
    const retry = await request('/api/payos-webhook', 'POST', webhookPayload(orderCode, amount));
    assert.equal(retry.status, 200);
    assert.match(retry.data.message, /Đã xử lý trước đó/);
    stats = (await request('/api/admin/statistics')).data.data;
    assert.equal(stats.paidOrdersCount, 1, 'không nhân đôi đơn');
    assert.equal(stats.totalRevenue, amount);

    // ---------------- 4. Chữ ký sai → không động vào dữ liệu -------------------
    const other = await request('/api/orders/create-payment-link', 'POST', {
      customerName: 'Tran Thi B',
      customerPhone: '0912345678',
      customerClass: 'CNTT K15',
      customerDepartment: 'Khoa CNTT',
      items: [{ bookId: 'sach-04', quantity: 1 }]
    });
    const otherCode = other.data.data.orderCode;
    const forged = webhookPayload(otherCode, 35000);
    forged.signature = 'a'.repeat(64);
    const forgedRes = await request('/api/payos-webhook', 'POST', forged);
    assert.equal(forgedRes.status, 400, 'từ chối webhook giả mạo');
    let afterForged = (await request('/api/admin/statistics')).data.data;
    assert.equal(afterForged.allOrders.find((o) => o.orderCode === otherCode).status, 'PENDING');

    // ---------------- 5. Số tiền lệch → không xác nhận -------------------------
    const wrongAmount = webhookPayload(otherCode, 1000);
    const wrongRes = await request('/api/payos-webhook', 'POST', wrongAmount);
    assert.equal(wrongRes.status, 400, 'báo lệch số tiền');
    afterForged = (await request('/api/admin/statistics')).data.data;
    assert.equal(afterForged.allOrders.find((o) => o.orderCode === otherCode).status, 'PENDING');

    // ---------------- 6. Webhook cho đơn KHÔNG có trong DB → tự cứu tiền -------
    const lostCode = 987654321;
    const recovery = await request('/api/payos-webhook', 'POST', webhookPayload(lostCode, 120000, { description: `XB${lostCode}` }));
    assert.equal(recovery.status, 200, 'webhook vẫn được xác nhận để PayOS không gửi lại');
    assert.equal(recovery.data.data.recovered, true);
    stats = (await request('/api/admin/statistics')).data.data;
    const rescued = stats.allOrders.find((o) => o.orderCode === lostCode);
    assert.ok(rescued, 'đơn lạc được tạo bản ghi thay vì bỏ mất');
    assert.equal(rescued.status, 'PAID');
    assert.equal(rescued.amount, 120000);
    assert.equal(stats.totalRevenue, amount + 120000);

    // ---------------- 7. Đối soát thủ công: đơn PENDING nhưng PayOS đã PAID ----
    const link = payosLinks.get(otherCode);
    link.status = 'PAID';
    link.transactions = [{ reference: `FT${otherCode}`, amount: 35000, transactionDateTime: '2026-10-29 11:00:00', counterAccountName: 'TRAN THI B' }];
    const reconcile = await request('/api/admin/orders/reconcile', 'POST', { orderCode: `XB${otherCode}` });
    assert.equal(reconcile.status, 200);
    assert.equal(reconcile.data.changed, true);
    assert.equal(reconcile.data.recovered, false);
    stats = (await request('/api/admin/statistics')).data.data;
    assert.equal(stats.allOrders.find((o) => o.orderCode === otherCode).status, 'PAID');

    // Đối soát lần 2 → không đổi gì
    const reconcileAgain = await request('/api/admin/orders/reconcile', 'POST', { orderCode: String(otherCode) });
    assert.equal(reconcileAgain.status, 200);
    assert.equal(reconcileAgain.data.changed, false);
    assert.match(reconcileAgain.data.message, /đã ở trạng thái đã thanh toán/);

    // ---------------- 8. Đối soát đơn chưa thanh toán → không đổi -------------
    const unpaid = await request('/api/orders/create-payment-link', 'POST', {
      customerName: 'Le Van C',
      customerPhone: '0900111222',
      customerClass: 'CNTT K15',
      customerDepartment: 'Khoa CNTT',
      items: [{ bookId: 'sach-04', quantity: 1 }]
    });
    const unpaidCode = unpaid.data.data.orderCode;
    const notPaid = await request('/api/admin/orders/reconcile', 'POST', { orderCode: String(unpaidCode) });
    assert.equal(notPaid.status, 200);
    assert.equal(notPaid.data.changed, false);
    assert.match(notPaid.data.message, /PENDING|chưa/);

    // ---------------- 9. Đối soát đơn mất hẳn khỏi web -------------------------
    const orphanCode = 555666777;
    payosLinks.set(orphanCode, {
      id: `link-${orphanCode}`,
      orderCode: orphanCode,
      amount: 45000,
      description: `XB${orphanCode}`,
      accountNumber: '0123456789',
      checkoutUrl: `https://pay.payos.vn/web/${orphanCode}`,
      status: 'PAID',
      createdAt: new Date().toISOString(),
      transactions: [{ reference: 'FT555', amount: 45000, transactionDateTime: '2026-10-28 09:00:00' }]
    });
    const orphan = await request('/api/admin/orders/reconcile', 'POST', { orderCode: String(orphanCode) });
    assert.equal(orphan.status, 200);
    assert.equal(orphan.data.changed, true);
    assert.equal(orphan.data.recovered, true, 'tạo mới đơn từ PayOS');
    stats = (await request('/api/admin/statistics')).data.data;
    assert.equal(stats.allOrders.find((o) => o.orderCode === orphanCode).status, 'PAID');

    // ---------------- 10. Đối soát sai mã / không có quyền --------------------
    assert.equal((await request('/api/admin/orders/reconcile', 'POST', { orderCode: 'linh tinh' })).status, 400);
    const noAuth = await fetch(`${base}/api/admin/orders/reconcile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': 'sai-mat-khau' },
      body: JSON.stringify({ orderCode: String(orphanCode) })
    });
    assert.equal(noAuth.status, 401);

    // ---------------- 11. Khách SỬA NỘI DUNG CK → ghi nhận thủ công -------------
    // Tình huống thật: chuyển 20.000đ với nội dung "TRAN QUOC chuyen tien" (không có mã XB...)
    // → PayOS không ghép được đơn, không có webhook; admin phải ghi nhận tay.
    const manualOrder = await request('/api/orders/create-payment-link', 'POST', {
      customerName: 'Tran Quoc',
      customerPhone: '0933222111',
      customerClass: 'CNTT K15',
      customerDepartment: 'Khoa CNTT',
      items: [{ bookId: 'sach-04', quantity: 1 }]
    });
    const manualCode = manualOrder.data.data.orderCode;
    const manualAmount = manualOrder.data.data.amount;

    // Tìm đơn ứng viên theo đúng số tiền đã nhận
    const candidates = await request(`/api/admin/orders/pending?amount=${manualAmount}&days=14`);
    assert.equal(candidates.status, 200);
    assert.ok(candidates.data.data.orders.some(o => o.orderCode === manualCode), 'tìm thấy đơn đang chờ đúng số tiền');
    assert.equal((await request(`/api/admin/orders/pending?amount=1&days=14`)).data.data.orders.length, 0, 'số tiền khác thì không khớp');

    // Ghi nhận thủ công cho đơn đó
    const manual = await request('/api/admin/orders/manual-paid', 'POST', {
      amount: manualAmount,
      orderCode: `XB${manualCode}`,
      customerName: 'TRAN QUOC',
      note: 'Chuyển lúc 14:50 ngày 29/10, MB Bank, nội dung bị sửa'
    });
    assert.equal(manual.status, 200);
    assert.equal(manual.data.created, false);
    assert.equal(manual.data.order.status, 'PAID');
    assert.match(manual.data.order.note, /Ghi nhận thủ công/, 'lưu vết thao tác của admin');
    assert.match(manual.data.order.note, /TRAN QUOC/);
    assert.equal(manual.data.order.bankReference, 'MANUAL');

    stats = (await request('/api/admin/statistics')).data.data;
    assert.equal(stats.allOrders.find(o => o.orderCode === manualCode).status, 'PAID');
    const dumpAfterManual = JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf-8'));
    assert.ok(dumpAfterManual.transactions.some(t => t.orderCode === manualCode && /MANUAL/.test(t.description)), 'lưu sao kê ghi nhận thủ công');
    // Không có link PayOS nào bị coi là đã thanh toán (tiền về ngoài hệ thống PayOS)
    assert.equal(payosLinks.get(manualCode).status, 'PENDING');

    // Không ghi nhận lại đơn đã thanh toán
    const again = await request('/api/admin/orders/manual-paid', 'POST', { amount: manualAmount, orderCode: String(manualCode) });
    assert.equal(again.status, 409);

    // Khách chưa có mã đơn → tạo bản ghi PAID để vẫn vào sổ sách
    const createdManually = await request('/api/admin/orders/manual-paid', 'POST', {
      amount: 20000,
      customerName: 'TRAN QUOC',
      note: 'Khách chuyển trước khi đặt, không có mã đơn'
    });
    assert.equal(createdManually.status, 200);
    assert.equal(createdManually.data.created, true);
    assert.equal(createdManually.data.order.status, 'PAID');
    assert.equal(createdManually.data.order.amount, 20000);
    stats = (await request('/api/admin/statistics')).data.data;
    assert.ok(stats.allOrders.some(o => o.orderCode === createdManually.data.order.orderCode && o.status === 'PAID'));

    // Thiếu dữ liệu / sai dữ liệu → 400, không ghi bậy
    assert.equal((await request('/api/admin/orders/manual-paid', 'POST', { amount: 0, orderCode: String(manualCode) })).status, 400);
    assert.equal((await request('/api/admin/orders/manual-paid', 'POST', { amount: 20000 })).status, 400, 'cần mã đơn hoặc tên người chuyển');
    assert.equal((await request('/api/admin/orders/manual-paid', 'POST', { amount: 20000, orderCode: 'linh tinh' })).status, 400);
    const noAuthManual = await fetch(`${base}/api/admin/orders/manual-paid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': 'sai-mat-khau' },
      body: JSON.stringify({ amount: 20000, customerName: 'Hacker' })
    });
    assert.equal(noAuthManual.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await new Promise((resolve) => payosServer.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
