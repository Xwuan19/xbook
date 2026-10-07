(function (root) {
  const DAY = 86400000;
  function deliveryAt(createdAt, date) {
    const minimum = new Date(createdAt).getTime() + DAY;
    const configured = date ? Date.parse(`${date}T00:00:00+07:00`) : 0;
    return new Date(Math.max(minimum, configured || 0)).toISOString();
  }
  // A class is identified by both department and name, including duplicate names across faculties.
  function classKey(entry) { return JSON.stringify([entry.department, entry.name]); }
  function classes(raw, departments = ['Khoa CNTT']) {
    const result = [];
    for (const entry of raw || []) {
      if (!entry) continue;
      const name = String(typeof entry === 'string' ? entry : entry.name || '').trim();
      const department = String(typeof entry === 'string' ? departments[0] || 'Khoa CNTT' : entry.department || '').trim();
      if (!name || !department) continue;
      const bookIds = [...new Set((Array.isArray(entry.bookIds) ? entry.bookIds : []).map(String))];
      const existing = result.find(c => c.name === name && c.department === department);
      if (existing) existing.bookIds = [...new Set([...existing.bookIds, ...bookIds])];
      else result.push({ name, department, bookIds });
    }
    return result;
  }
  // One-time migration: preserve legacy assignments, then never infer ownership from books again.
  function migrateSettings(settings, legacyBooks) {
    const migrated = { ...settings, classes: classes(settings.classes, settings.departments), catalogVersion: 2 };
    if (settings.catalogVersion === 2) return migrated;
    for (const book of legacyBooks) {
      const department = book.department || settings.departments?.[0] || 'Khoa CNTT';
      for (const name of book.classes || []) {
        let entry = migrated.classes.find(c => c.name === name && c.department === department);
        if (!entry) {
          entry = { name, department, bookIds: [] };
          migrated.classes.push(entry);
        }
        if (!entry.bookIds.includes(book.id)) entry.bookIds.push(book.id);
      }
    }
    return migrated;
  }
  function filterBooks(books, settings, department = '__ALL__', key = '__ALL__') {
    if (department === '__ALL__' && key === '__ALL__') return books;
    const selected = classes(settings.classes, settings.departments).filter(c =>
      (department === '__ALL__' || c.department === department) && (key === '__ALL__' || classKey(c) === key));
    const ids = new Set(selected.flatMap(c => c.bookIds));
    return books.filter(b => ids.has(b.id));
  }
  // Sách nằm trong danh mục chung (không thuộc khoa nào). Khi admin "add sách vào khoa/lớp"
  // thì sách đó trở thành sách cần học của (các) lớp ấy.
  function bookScope(settings, bookId) {
    const assigned = classes(settings.classes, settings.departments).filter(c => c.bookIds.includes(bookId));
    return { classes: assigned, departments: [...new Set(assigned.map(c => c.department))] };
  }
  // Gán 1 cuốn vào khoa/lớp: chọn cả KHOA → áp dụng cho mọi lớp của khoa đó;
  // chọn từng LỚP → chỉ lớp đó. Trả về danh sách lớp mới (đã chuẩn hóa).
  function assignBookToClasses(rawClasses, bookId, options = {}) {
    const selectedKeys = new Set((options.classKeys || []).map(String));
    const selectedDepartments = new Set((options.departments || []).map(String));
    return classes(rawClasses).map(c => {
      const inScope = selectedDepartments.has(c.department) || selectedKeys.has(classKey(c));
      const ids = new Set(c.bookIds);
      if (inScope) ids.add(bookId);
      else ids.delete(bookId);
      return { ...c, bookIds: [...ids] };
    });
  }
  const api = { deliveryAt, classKey, classes, migrateSettings, filterBooks, bookScope, assignBookToClasses };
  if (typeof module !== 'undefined') module.exports = api;
  else root.XBookDomain = api;
})(typeof window !== 'undefined' ? window : globalThis);
