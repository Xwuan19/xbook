const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('API supports global books shared across faculties, class curricula and immutable order delivery', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xbook-test-'));
  for (const file of ['server.js', 'database.js']) fs.copyFileSync(path.join(__dirname, '..', file), path.join(dir, file));
  fs.mkdirSync(path.join(dir, 'public'));
  fs.copyFileSync(path.join(__dirname, '../public/domain.js'), path.join(dir, 'public/domain.js'));
  fs.symlinkSync(path.join(__dirname, '../node_modules'), path.join(dir, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  process.env.DATABASE_URL = '';
  process.env.ADMIN_PASSWORD = 'test-password';
  const app = require(path.join(dir, 'server.js'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const request = async (url, method = 'GET', body) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${url}`, { method, headers: { 'Content-Type': 'application/json', 'x-admin-password': 'test-password' }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json() };
  };
  try {
    const departments = ['Khoa CNTT', 'Khoa Kinh tế'];
    const classes = [
      { name: 'A', department: departments[0], bookIds: ['sach-04'] },
      { name: 'A', department: departments[1], bookIds: ['sach-04'] },
      { name: 'B', department: departments[0], bookIds: [] }
    ];
    assert.equal((await request('/api/admin/settings', 'PUT', { departments, classes, deliveryDate: '2020-01-01' })).status, 200);
    const updatedBook = await request('/api/admin/books/sach-04', 'PUT', { title: 'Shared book', price: 35000 });
    assert.equal(updatedBook.status, 200);
    assert.equal('department' in updatedBook.data.book, false);
    assert.equal('classes' in updatedBook.data.book, false);
    const globalBook = await request('/api/admin/books', 'POST', { title: 'Global book', price: 10000 });
    assert.equal(globalBook.status, 200);
    const catalog = await request('/api/books');
    assert.deepEqual(catalog.data.settings.classes, classes);
    assert.equal(catalog.data.settings.catalogVersion, 2);
    const body = { customerName: 'Nguyen An', customerClass: 'A', items: [{ bookId: 'sach-04', quantity: 1 }] };
    // Ambiguous names must not pick a random faculty.
    assert.equal((await request('/api/orders/create-payment-link', 'POST', body)).status, 400);
    const before = Date.now();
    assert.equal((await request('/api/orders/create-payment-link', 'POST', { ...body, customerDepartment: departments[1], deliveryDate: 'invalid-date' })).status, 400);
    const customOrder = await request('/api/orders/create-payment-link', 'POST', { ...body, customerDepartment: departments[1], deliveryDate: '2032-12-25' });
    assert.equal(customOrder.status, 200);
    assert.equal(customOrder.data.data.deliveryAt, '2032-12-24T17:00:00.000Z');
    const created = await request('/api/orders/create-payment-link', 'POST', { ...body, customerDepartment: departments[1] });
    assert.equal(created.status, 200);
    assert.equal(created.data.data.customerDepartment, departments[1]);
    assert.ok(Date.parse(created.data.data.deliveryAt) >= before + 86400000);
    await request('/api/admin/settings', 'PUT', { deliveryDate: '2030-01-01' });
    const saved = await request(`/api/orders/${created.data.data.orderCode}`);
    assert.equal(saved.data.data.deliveryAt, created.data.data.deliveryAt);
    assert.equal(saved.data.data.customerDepartment, departments[1]);
    // Filters are guidance, not purchasing restrictions: unassigned books are still purchasable.
    assert.equal((await request('/api/orders/create-payment-link', 'POST', { ...body, customerClass: 'B', items: [{ bookId: globalBook.data.book.id, quantity: 1 }] })).status, 200);
    assert.equal((await request('/api/orders/create-payment-link', 'POST', { ...body, customerClass: '' })).status, 200);
    assert.equal((await request('/api/admin/settings', 'PUT', { classes: [{ ...classes[0], bookIds: ['unknown'] }] })).status, 400);
    assert.equal((await request('/api/admin/settings', 'PUT', { departments: ['Khoa CNTT'] })).status, 400);
    assert.equal((await request('/api/admin/settings', 'PUT', { classes: [{ ...classes[0], bookIds: [] }] })).status, 200);
    assert.deepEqual((await request('/api/books')).data.settings.classes, [{ ...classes[0], bookIds: [] }]);
    // Deleting a book removes references, without deleting the class or changing existing orders.
    await request('/api/admin/settings', 'PUT', { classes: [classes[0]] });
    assert.equal((await request('/api/admin/books/sach-04', 'DELETE')).status, 200);
    assert.deepEqual((await request('/api/books')).data.settings.classes[0].bookIds, []);
    assert.equal((await request(`/api/orders/${created.data.data.orderCode}`)).data.data.bookTitle, 'Shared book');
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
