const { test } = require('node:test');
const assert = require('node:assert/strict');
const { deliveryAt, classes, classKey, filterBooks, migrateSettings } = require('../public/domain');
test('delivery never earlier than 24 hours including stale settings and month rollover', () => {
  for (const date of ['', '2020-01-01', '2026-11-01']) {
    assert.equal(deliveryAt('2026-10-31T16:30:00Z', date), '2026-11-01T16:30:00.000Z');
  }
});
test('later configured delivery uses Vietnam timezone', () => {
  assert.equal(deliveryAt('2026-10-07T12:00:00Z', '2026-10-10'), '2026-10-09T17:00:00.000Z');
});
test('classes preserve curriculum lists and distinguish identical names across faculties', () => {
  assert.deepEqual(classes(['A', { name: 'A', department: 'IT', bookIds: ['shared', 'shared'] }, { name: 'A', department: 'Business' }], ['IT']), [
    { name: 'A', department: 'IT', bookIds: ['shared'] }, { name: 'A', department: 'Business', bookIds: [] }
  ]);
});
test('global books filter through class lists, including shared books and empty curricula', () => {
  const books = [{ id: 'shared' }, { id: 'it' }, { id: 'business' }, { id: 'unassigned' }];
  const settings = { departments: ['IT', 'Business'], classes: [
    { name: 'A', department: 'IT', bookIds: ['shared', 'it'] },
    { name: 'A', department: 'Business', bookIds: ['shared', 'business'] },
    { name: 'B', department: 'IT', bookIds: [] }
  ] };
  assert.deepEqual(filterBooks(books, settings), books);
  assert.deepEqual(filterBooks(books, settings, 'IT'), books.slice(0, 2));
  assert.deepEqual(filterBooks(books, settings, 'Business', classKey(settings.classes[1])), [books[0], books[2]]);
  assert.deepEqual(filterBooks(books, settings, 'IT', classKey(settings.classes[1])), []);
  assert.deepEqual(filterBooks(books, settings, 'IT', classKey(settings.classes[2])), []);
  assert.deepEqual(filterBooks(books, settings, 'Unknown'), []);
});
test('legacy book assignments migrate once and never reappear after removal', () => {
  const legacy = [{ id: 'shared', department: 'IT', classes: ['A', 'B'] }];
  const migrated = migrateSettings({ departments: ['IT'], classes: ['A'] }, legacy);
  assert.equal(migrated.catalogVersion, 2);
  assert.deepEqual(migrated.classes, [
    { name: 'A', department: 'IT', bookIds: ['shared'] },
    { name: 'B', department: 'IT', bookIds: ['shared'] }
  ]);
  migrated.classes = [{ ...migrated.classes[0], bookIds: [] }];
  assert.deepEqual(migrateSettings(migrated, legacy), migrated);
});
