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
    if (url === '/api/admin/settings') {
      fixture.settings = { ...fixture.settings, ...JSON.parse(options.body) };
      return { json: async () => ({ success: true, settings: fixture.settings }) };
    }
    return { json: async () => ({ success: true, ...fixture }) };
  };
  window.eval(fs.readFileSync('public/domain.js', 'utf8'));
  window.eval(fs.readFileSync('public/app.js', 'utf8'));
  await window.fetchBooksAndSettings();
  assert.equal(window.document.querySelectorAll('#bookGrid h3').length, 3);
  window.setDepartmentFilter('Business');
  assert.equal(window.document.querySelectorAll('#bookGrid h3').length, 1);
  window.setClassFilter(window.XBookDomain.classKey(fixture.settings.classes[1]));
  assert.equal(window.document.querySelector('#bookGrid h3').textContent, 'Shared');
  window.setDepartmentFilter('IT');
  assert.equal(window.document.querySelectorAll('#bookGrid h3').length, 2);
  window.setClassFilter(window.XBookDomain.classKey(fixture.settings.classes[2]));
  assert.match(window.document.querySelector('#bookGrid').textContent, /Chưa có sách/);
  window.renderAdminManageTab();
  const editor = window.document.getElementById('classBookEditorSelect');
  editor.value = window.XBookDomain.classKey(fixture.settings.classes[1]);
  window.renderClassBookChoices();
  assert.equal(window.document.querySelector('#classBookChoices input[value="shared"]').checked, true);
  window.document.querySelector('#classBookChoices input[value="it"]').checked = true;
  await window.saveClassBooks({ preventDefault() {} });
  assert.deepEqual(fixture.settings.classes[1].bookIds, ['shared', 'it']);
  window.openBookForm('shared');
  assert.equal(window.document.getElementById('formBookTitle').value, 'Shared');
  assert.equal(window.document.getElementById('formBookDepartment'), null);
  assert.equal(window.document.getElementById('formBookClasses'), null);
  window.populateClassDatalist();
  const options = [...window.document.querySelectorAll('#formCustomerClass option')];
  assert.ok(options.some(o => o.textContent === 'Business / A'));
  assert.ok(options.some(o => o.textContent === 'IT / A'));
  assert.ok(window.document.getElementById('formCustomerDeliveryDate') !== null);
  window.toggleCartBook('shared');
  window.openCheckoutModal();
  assert.ok(window.document.getElementById('formCustomerDeliveryDate').min.length > 0);
  dom.window.close();
});
