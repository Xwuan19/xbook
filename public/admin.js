/**
 * ============================================================================
 * XBOOK - ADMIN.JS: GIAO DIỆN TRANG QUẢN TRỊ RIÊNG (/admin.html, route /admin)
 * ============================================================================
 * - Đăng nhập quản trị (token phiên 30 ngày, ghi nhớ đăng nhập) ngay trên trang.
 * - Bảng Quản Lý: Đơn hàng · Theo tên · Theo lớp · Theo khoa · Quyết toán · Quản lý sách.
 * - Lọc theo ngày đặt hàng / ngày thanh toán, quyết toán từng ngày, sách đã bán.
 * - Chốt sổ / mở lại đăng ký, ngày nhận sách, đánh dấu đã phát, thêm-sửa-xóa sách,
 *   quản lý khoa & lớp, thiết lập sách cần học theo lớp, xuất Excel (.xlsx), in danh sách.
 * ⚠️ Trang chủ (/) KHÔNG còn chứa giao diện quản lý nào — file này chỉ chạy cùng
 *    core.js trên trang /admin.html.
 * ============================================================================
 */

// ============================ TRẠNG THÁI TRANG QUẢN TRỊ ============================
// Bộ lọc bảng quản trị
let adminClassFilterValue = '__ALL__';
let currentAdminTab = 'orders';

// Bộ lọc theo ngày trong bảng quản trị (quyết toán từng ngày)
let adminDatePreset = 'all';      // all | today | yesterday | 7d | 30d | custom
let adminDateFrom = '';           // YYYY-MM-DD
let adminDateTo = '';             // YYYY-MM-DD
let adminDateBasis = 'created';   // created = ngày đặt hàng | paid = ngày thanh toán

// ============================ LỌC THEO NGÀY (QUYẾT TOÁN TỪNG NGÀY) ============================
/** Ngày dùng để lọc: ngày đặt hàng (createdAt) hoặc ngày tiền về (paidAt) */
function orderFilterDateKey(order, basis = adminDateBasis) {
  if (basis === 'paid') return localDateKey(order.paidAt);
  return localDateKey(order.createdAt);
}

/** Nhãn ngắn cho khoảng đang lọc (hiển thị ở dòng tóm tắt + file Excel) */
function adminDateRangeLabel() {
  const basisLabel = adminDateBasis === 'paid' ? 'ngày thanh toán' : 'ngày đặt hàng';
  if (adminDatePreset === 'all') return `Tất cả thời gian (theo ${basisLabel})`;
  if (adminDatePreset === 'today') return `Hôm nay ${formatDateKeyVN(adminDateFrom)} (theo ${basisLabel})`;
  if (adminDatePreset === 'yesterday') return `Hôm qua ${formatDateKeyVN(adminDateFrom)} (theo ${basisLabel})`;
  if (adminDateFrom === adminDateTo) return `Ngày ${formatDateKeyVN(adminDateFrom)} (theo ${basisLabel})`;
  return `Từ ${formatDateKeyVN(adminDateFrom)} đến ${formatDateKeyVN(adminDateTo)} (theo ${basisLabel})`;
}

/** Trạng thái bộ lọc ngày (dùng cho kiểm thử & debug) */
function adminDateFilterState() {
  return { preset: adminDatePreset, from: adminDateFrom, to: adminDateTo, basis: adminDateBasis };
}

function isAdminDateFilterActive() {
  return adminDatePreset !== 'all' && Boolean(adminDateFrom && adminDateTo);
}

/** Lọc danh sách đơn theo khoảng ngày đang chọn */
function filterOrdersByAdminDate(orders) {
  if (!isAdminDateFilterActive()) return orders;
  return orders.filter(order => {
    const key = orderFilterDateKey(order);
    return key && key >= adminDateFrom && key <= adminDateTo;
  });
}

/** Gộp đơn đã thanh toán theo từng ngày để quyết toán */
function groupOrdersByDay(orders) {
  const map = new Map();
  orders.forEach(order => {
    const key = orderFilterDateKey(order);
    if (!key) return;
    if (!map.has(key)) map.set(key, { date: key, orders: 0, books: 0, amount: 0 });
    const day = map.get(key);
    day.orders += 1;
    day.books += orderBookCount(order);
    day.amount += Number(order.amount) || 0;
  });
  return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
}

/** Tổng hợp số lượng từng cuốn từ danh sách đơn (theo khoảng ngày đang lọc) */
function computeBookSummary(orders) {
  const summary = {};
  allBooks.forEach(b => {
    summary[b.id] = { id: b.id, title: b.title, price: b.price, totalQuantity: 0, totalRevenue: 0 };
  });
  orders.forEach(order => {
    const items = Array.isArray(order.items) && order.items.length > 0
      ? order.items
      : [{ bookId: order.bookId, bookTitle: order.bookTitle, quantity: order.quantity || 1, unitPrice: order.unitPrice || 0 }];
    items.forEach(it => {
      const key = it.bookId && summary[it.bookId] ? it.bookId : (it.bookId || it.bookTitle || 'khac');
      if (!summary[key]) {
        summary[key] = { id: it.bookId || key, title: it.bookTitle || 'Sách khác', price: it.unitPrice || 0, totalQuantity: 0, totalRevenue: 0 };
      }
      const qty = Number(it.quantity) || 1;
      summary[key].totalQuantity += qty;
      summary[key].totalRevenue += qty * (Number(it.unitPrice) || 0);
    });
  });
  return Object.values(summary);
}

// ============================ BẢNG QUẢN TRỊ ============================
/**
 * PHIÊN ĐĂNG NHẬP QUẢN TRỊ
 * - Đăng nhập đúng mật khẩu → server cấp token có hạn (mặc định 30 ngày).
 * - Tích "Ghi nhớ đăng nhập" → lưu token vào localStorage: mở lại web (kể cả tắt máy) KHÔNG cần nhập lại mật khẩu.
 * - Không tích → chỉ lưu sessionStorage (đóng trình duyệt là hết phiên).
 * - Mật khẩu gõ tay chỉ giữ trong bộ nhớ tạm, không ghi ra ổ đĩa.
 */
const ADMIN_TOKEN_KEY = 'xbook_admin_token';
const ADMIN_REMEMBER_KEY = 'xbook_admin_remember';

function readStoredAdminToken() {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY) || sessionStorage.getItem(ADMIN_TOKEN_KEY) || '';
  } catch (e) {
    return '';
  }
}

let adminToken = readStoredAdminToken();
let adminAuthPassword = '';
let adminRemember = (() => {
  try { return localStorage.getItem(ADMIN_REMEMBER_KEY) !== '0'; } catch (e) { return true; }
})();

function isAdminAuthed() {
  return Boolean(adminToken || adminAuthPassword);
}

function storeAdminToken(token, remember) {
  adminToken = token || '';
  adminRemember = Boolean(remember);
  try {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.setItem(ADMIN_REMEMBER_KEY, adminRemember ? '1' : '0');
    if (adminToken) (adminRemember ? localStorage : sessionStorage).setItem(ADMIN_TOKEN_KEY, adminToken);
  } catch (e) {
    // Trình duyệt chặn lưu trữ (chế độ riêng tư) → chỉ dùng token trong bộ nhớ
  }
}

function clearAdminAuth() {
  adminToken = '';
  adminAuthPassword = '';
  try {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch (e) { /* bỏ qua */ }
}

/** Header xác thực: ưu tiên token phiên, chưa có token thì dùng mật khẩu vừa nhập */
function adminAuthHeaders() {
  return adminToken ? { 'x-admin-token': adminToken } : { 'x-admin-password': adminAuthPassword };
}

/** fetch kèm xác thực quản trị (tự nhận + lưu token mới do server cấp qua header) */
async function adminFetch(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { ...(options.headers || {}), ...adminAuthHeaders() } });
  const freshToken = res.headers && typeof res.headers.get === 'function' ? res.headers.get('x-admin-token') : null;
  if (freshToken) storeAdminToken(freshToken, adminRemember);
  if (res.status === 401) clearAdminAuth();
  return res;
}

/**
 * Hiện form nhập mật khẩu quản trị.
 * Trang quản trị là 1 trang riêng (/admin.html) nên đây KHÔNG còn là modal trên trang chủ:
 * chỉ cần ẩn Bảng Quản Lý và hiện khối đăng nhập ngay trên trang.
 */
function askAdminLogin(message) {
  const loginPanel = document.getElementById('adminLoginPanel');
  const dashboard = document.getElementById('adminPanel');
  if (dashboard) dashboard.classList.add('hidden');
  if (loginPanel) loginPanel.classList.remove('hidden');

  const errorEl = document.getElementById('adminLoginError');
  const rememberEl = document.getElementById('adminRememberInput');
  if (rememberEl) rememberEl.checked = adminRemember;
  if (errorEl) {
    if (message) { errorEl.innerText = message; errorEl.classList.remove('hidden'); }
    else errorEl.classList.add('hidden');
  }
  const passwordInput = document.getElementById('adminPasswordInput');
  if (passwordInput) {
    passwordInput.value = '';
    setTimeout(() => passwordInput.focus(), 150);
  }
}

/** Đã có phiên đăng nhập → hiện Bảng Quản Lý, ẩn form mật khẩu */
function showAdminDashboard() {
  const loginPanel = document.getElementById('adminLoginPanel');
  const dashboard = document.getElementById('adminPanel');
  if (loginPanel) loginPanel.classList.add('hidden');
  if (dashboard) dashboard.classList.remove('hidden');
}

async function handleAdminLogin(event) {
  event.preventDefault();
  const inputPwd = document.getElementById('adminPasswordInput').value.trim();
  const rememberEl = document.getElementById('adminRememberInput');
  const errorEl = document.getElementById('adminLoginError');
  const btnSubmit = document.getElementById('btnAdminLoginSubmit');

  btnSubmit.disabled = true;
  errorEl.classList.add('hidden');

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: inputPwd })
    });
    const data = await res.json();

    if (data.success) {
      // Lưu phiên để lần sau không phải nhập lại mật khẩu
      if (data.token) storeAdminToken(data.token, rememberEl ? rememberEl.checked : true);
      else adminAuthPassword = inputPwd;
      showAdminDashboard();
      await refreshAdminData();
    } else {
      errorEl.innerText = data.message || "Mật khẩu quản trị không đúng!";
      errorEl.classList.remove('hidden');
    }
  } catch (err) {
    errorEl.innerText = "Lỗi kết nối máy chủ";
    errorEl.classList.remove('hidden');
  } finally {
    btnSubmit.disabled = false;
  }
}

function handleAdminLogout() {
  clearAdminAuth();
  fetch('/api/admin/logout', { method: 'POST' }).catch(() => {});
  window.currentAdminStats = null;
  askAdminLogin();
  alert("🔒 Đã khóa lại Bảng Quản Trị!\nLần sau mở trang quản trị sẽ cần nhập lại mật khẩu.");
}

/** Chuyển tab trong bảng quản trị */
function switchAdminTab(tabName) {
  currentAdminTab = tabName;
  document.querySelectorAll('.admin-tab-panel').forEach(p => p.classList.add('hidden'));
  const panel = document.getElementById('adminTab' + tabName.charAt(0).toUpperCase() + tabName.slice(1));
  if (panel) panel.classList.remove('hidden');

  document.querySelectorAll('.admin-tab-btn').forEach(btn => {
    const active = btn.dataset.tab === tabName;
    btn.className = `admin-tab-btn flex-shrink-0 px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center space-x-1.5 ${
      active ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
    }`;
  });
  lucide.createIcons();
}

/**
 * TẢI DỮ LIỆU BẢNG QUẢN TRỊ & RENDER TẤT CẢ CÁC TAB
 * opts.booksData: dùng dữ liệu /api/books vừa fetch xong (tránh fetch 2 lần)
 */
async function refreshAdminData(opts = {}) {
  try {
    // Fetch 2 API ĐỒNG THỜI để giảm tối đa thời gian chờ (mỗi lần đi mạng ~1 RTT)
    const statsPromise = adminFetch('/api/admin/statistics');
    const booksPromise = opts.booksData
      ? Promise.resolve(opts.booksData)
      : fetch('/api/books').then(r => r.json()).catch(() => null);

    const res = await statsPromise;
    const booksData = await booksPromise;

    if (res.status === 401) {
      askAdminLogin('Phiên đăng nhập đã hết hạn — vui lòng nhập lại mật khẩu quản trị.');
      return;
    }

    const result = await res.json();
    if (!result.success) return;

    const stats = result.data;
    currentSettings = { ...currentSettings, ...(stats.settings || {}) };

    // Danh mục sách (phục vụ tab quản lý & theo khoa)
    if (booksData && booksData.success) {
      allBooks = booksData.books || [];
      currentSettings = { ...currentSettings, ...(booksData.settings || {}) };
    }

    window.currentAdminStats = stats;

    // Nút bật/tắt chốt sổ
    const btnToggle = document.getElementById('btnToggleRegistration');
    if (stats.settings.isRegistrationOpen) {
      btnToggle.className = 'w-full py-2.5 px-4 rounded-xl text-xs font-black transition flex items-center justify-center space-x-2 shadow-sm bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300';
      btnToggle.innerHTML = `<i data-lucide="lock" class="w-4 h-4"></i><span>Bấm để ĐÓNG / CHỐT SỔ ĐĂNG KÝ</span>`;
    } else {
      btnToggle.className = 'w-full py-2.5 px-4 rounded-xl text-xs font-black transition flex items-center justify-center space-x-2 shadow-sm bg-emerald-600 hover:bg-emerald-700 text-white';
      btnToggle.innerHTML = `<i data-lucide="unlock" class="w-4 h-4"></i><span>Bấm để MỞ LẠI ĐĂNG KÝ (ngày nhận sách tự đặt = ngày mai, chỉnh được bên dưới)</span>`;
    }

    // Điền lại ngày nhận sách + lưu ý (không làm mất giá trị admin vừa gõ)
    const dateInput = document.getElementById('deliveryDateInput');
    const noteInput = document.getElementById('deliveryNoteInput');
    if (dateInput && document.activeElement !== dateInput) dateInput.value = stats.settings.deliveryDate || '';
    if (noteInput && document.activeElement !== noteInput) noteInput.value = stats.settings.deliveryNote || '';

    // Dữ liệu gốc (chưa lọc) để bộ lọc ngày tính lại mọi thống kê
    const paidOrders = (stats.allOrders || []).filter(o => o.status === 'PAID');
    paidOrders.sort((a, b) => compareByLastName(a.customerName, b.customerName));
    window.allAdminOrders = stats.allOrders || [];
    window.cachedPaidOrders = paidOrders;

    // Bộ lọc ngày + toàn bộ các tab (bảng quyết toán, danh sách phát sách, theo tên/lớp/khoa)
    renderAdminDateFilter();
    renderAdminTabsWithFilter();
    renderAdminManageTab();

    lucide.createIcons();
  } catch (err) {
    console.error("Lỗi admin:", err);
  }
}

/**
 * Bắt sự kiện cho thanh lọc ngày & bảng quyết toán bằng DELEGATION (gắn 1 lần vào
 * khối Bảng Quản Lý của trang /admin.html, không dùng onclick inline)
 * → hoạt động ổn định kể cả khi vùng đó được vẽ lại nhiều lần.
 */
function initAdminDelegatedEvents() {
  const panel = document.getElementById('adminPanel');
  if (!panel || panel.dataset.dateDelegated === '1') return;
  panel.dataset.dateDelegated = '1';

  panel.addEventListener('click', (event) => {
    const target = event.target && typeof event.target.closest === 'function' ? event.target : null;
    if (!target) return;

    const presetChip = target.closest('[data-date-preset]');
    if (presetChip) { setAdminDatePreset(presetChip.dataset.datePreset); return; }

    const basisChip = target.closest('[data-date-basis]');
    if (basisChip) { setAdminDateBasis(basisChip.dataset.dateBasis); return; }

    const dayRow = target.closest('[data-date-day]');
    if (dayRow) { setAdminDateSingleDay(dayRow.dataset.dateDay); return; }

    const goto = target.closest('[data-goto-settlement]');
    if (goto) { switchAdminTab('settlement'); return; }

    const soldBookRow = target.closest('[data-sold-book]');
    if (soldBookRow) { filterBySoldBook(soldBookRow.dataset.soldBook); return; }
  });
}

// ============================ BỘ LỌC NGÀY TRONG BẢNG QUẢN TRỊ ============================
const ADMIN_DATE_PRESETS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'today', label: 'Hôm nay' },
  { value: 'yesterday', label: 'Hôm qua' },
  { value: '7d', label: '7 ngày' },
  { value: '30d', label: '30 ngày' }
];

function setAdminDatePreset(preset) {
  adminDatePreset = preset;
  const today = localDateKey(new Date());
  if (preset === 'today') { adminDateFrom = today; adminDateTo = today; }
  else if (preset === 'yesterday') { adminDateFrom = shiftDateKey(-1); adminDateTo = shiftDateKey(-1); }
  else if (preset === '7d') { adminDateFrom = shiftDateKey(-6); adminDateTo = today; }
  else if (preset === '30d') { adminDateFrom = shiftDateKey(-29); adminDateTo = today; }
  else if (preset === 'all') { adminDateFrom = ''; adminDateTo = ''; }
  renderAdminDateFilter();
  renderAdminTabsWithFilter();
}

/** Bấm vào một ngày trong bảng quyết toán → lọc đúng ngày đó (bấm lại vào ngày đang lọc để bỏ lọc) */
function setAdminDateSingleDay(dateKey) {
  if (isAdminDateFilterActive() && adminDateFrom === dateKey && adminDateTo === dateKey) {
    setAdminDatePreset('all');
    return;
  }
  adminDatePreset = dateKey === localDateKey(new Date()) ? 'today'
    : dateKey === shiftDateKey(-1) ? 'yesterday' : 'custom';
  adminDateFrom = dateKey;
  adminDateTo = dateKey;
  renderAdminDateFilter();
  renderAdminTabsWithFilter();
}

function handleAdminDateRangeInput() {
  const fromEl = document.getElementById('adminDateFromInput');
  const toEl = document.getElementById('adminDateToInput');
  adminDateFrom = (fromEl?.value || '').trim();
  adminDateTo = (toEl?.value || '').trim();
  if (adminDateFrom && adminDateTo && adminDateFrom > adminDateTo) {
    [adminDateFrom, adminDateTo] = [adminDateTo, adminDateFrom];
  }
  adminDatePreset = adminDateFrom || adminDateTo ? 'custom' : 'all';
  if (!adminDateFrom || !adminDateTo) { adminDateFrom = adminDateFrom || adminDateTo; adminDateTo = adminDateTo || adminDateFrom; }
  renderAdminDateFilter();
  renderAdminTabsWithFilter();
}

function setAdminDateBasis(basis) {
  adminDateBasis = basis === 'paid' ? 'paid' : 'created';
  renderAdminDateFilter();
  renderAdminTabsWithFilter();
}

/** Vẽ chips khoảng ngày, chips loại ngày, ô Từ/Đến, dòng tóm tắt & bảng quyết toán từng ngày */
function renderAdminDateFilter() {
  const presetWrap = document.getElementById('adminDatePresetChips');
  if (presetWrap) {
    presetWrap.innerHTML = ADMIN_DATE_PRESETS.map(p => {
      const active = adminDatePreset === p.value;
      return `<button type="button" data-date-preset="${p.value}"
        class="flex-shrink-0 px-2.5 py-1.5 rounded-full text-[11px] font-extrabold border transition ${
          active ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-600/30' : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-400 hover:text-emerald-700'
        }">${p.label}</button>`;
    }).join('');
  }

  const basisWrap = document.getElementById('adminDateBasisChips');
  if (basisWrap) {
    basisWrap.innerHTML = [
      { value: 'created', label: 'Ngày đặt hàng' },
      { value: 'paid', label: 'Ngày thanh toán' }
    ].map(b => {
      const active = adminDateBasis === b.value;
      return `<button type="button" data-date-basis="${b.value}" title="Đổi cách tính ngày để lọc/quyết toán"
        class="px-2.5 py-1.5 rounded-full text-[11px] font-extrabold border transition ${
          active ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
        }">${b.label}</button>`;
    }).join('');
  }

  const fromEl = document.getElementById('adminDateFromInput');
  const toEl = document.getElementById('adminDateToInput');
  if (fromEl && document.activeElement !== fromEl) fromEl.value = adminDateFrom;
  if (toEl && document.activeElement !== toEl) toEl.value = adminDateTo;

  // Bảng quyết toán từng ngày + Sách đã bán (chỉ tính đơn đã thanh toán, trong khoảng ngày đang chọn)
  const tbody = document.getElementById('adminDailyBreakdownBody');
  if (tbody) {
    const paidInRange = filterOrdersByAdminDate(window.cachedPaidOrders || []);
    const days = groupOrdersByDay(paidInRange);
    renderSoldBooksTable(paidInRange);
    const maxAmount = days.reduce((max, d) => Math.max(max, d.amount), 0);
    tbody.innerHTML = days.length === 0
      ? `<tr><td colspan="6" class="p-3 text-center text-slate-400">Chưa có đơn nào đã thanh toán</td></tr>`
      : days.map(day => {
          const active = isAdminDateFilterActive() && adminDateFrom === day.date && adminDateTo === day.date;
          const width = maxAmount ? Math.max(4, Math.round((day.amount / maxAmount) * 100)) : 0;
          return `<tr class="cursor-pointer transition ${active ? 'bg-emerald-50' : 'hover:bg-slate-50'}" title="Bấm để lọc đúng ngày này" data-date-day="${day.date}">
            <td class="p-2.5 font-bold text-slate-700 whitespace-nowrap">
              ${formatDateKeyVN(day.date)}
              <span class="text-[10px] font-normal text-slate-400">${escapeHtml(weekdayLabel(day.date))}</span>
              ${active ? '<span class="ml-1 text-[10px] font-black text-emerald-700">• đang lọc</span>' : ''}
            </td>
            <td class="p-2.5 text-center font-semibold text-slate-600">${day.orders}</td>
            <td class="p-2.5 text-center font-semibold text-slate-600">${day.books}</td>
            <td class="p-2.5 hidden sm:table-cell">
              <div class="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div class="h-full bg-emerald-500 rounded-full" style="width:${width}%"></div>
              </div>
            </td>
            <td class="p-2.5 text-right font-black text-emerald-600 whitespace-nowrap">${formatMoney(day.amount)}</td>
            <td class="p-2.5 text-right text-slate-500 font-semibold whitespace-nowrap hidden sm:table-cell">${formatMoney(day.orders ? Math.round(day.amount / day.orders) : 0)}</td>
          </tr>`;
        }).join('') + (days.length > 1 ? `<tr class="bg-slate-50 font-black">
            <td class="p-2.5 text-slate-700 whitespace-nowrap">TỔNG CỘNG (${days.length} ngày)</td>
            <td class="p-2.5 text-center text-slate-700">${days.reduce((s, d) => s + d.orders, 0)}</td>
            <td class="p-2.5 text-center text-slate-700">${days.reduce((s, d) => s + d.books, 0)}</td>
            <td class="hidden sm:table-cell"></td>
            <td class="p-2.5 text-right text-emerald-700 whitespace-nowrap">${formatMoney(days.reduce((s, d) => s + d.amount, 0))}</td>
            <td class="hidden sm:table-cell"></td>
          </tr>` : '');

    // 4 thẻ tổng hợp nhanh của tab Quyết toán
    const setText = (id, value) => { const el = document.getElementById(id); if (el) el.innerText = value; };
    setText('settlementDayCount', String(days.length));
    setText('settlementOrders', String(days.reduce((s, d) => s + d.orders, 0)));
    setText('settlementBooks', String(days.reduce((s, d) => s + d.books, 0)));
    setText('settlementAmount', formatMoney(days.reduce((s, d) => s + d.amount, 0)));
  }

  lucide.createIcons();
}

/**
 * SÁCH ĐÃ BÁN — mỗi đầu sách đã bán bao nhiêu cuốn trong khoảng ngày đang lọc.
 * Kèm tỷ trọng và doanh thu từng đầu sách; bấm một dòng để lọc danh sách người mua cuốn đó.
 */
function renderSoldBooksTable(paidOrders) {
  const tbody = document.getElementById('adminSoldBooksBody');
  const badge = document.getElementById('settlementBookTitles');
  if (!tbody) return;

  const soldBooks = computeBookSummary(paidOrders)
    .filter(b => Number(b.totalQuantity) > 0)
    .sort((a, b) => (b.totalQuantity - a.totalQuantity) || a.title.localeCompare(b.title, 'vi'));
  const totalQuantity = soldBooks.reduce((sum, b) => sum + Number(b.totalQuantity || 0), 0);
  const totalRevenue = soldBooks.reduce((sum, b) => sum + Number(b.totalRevenue || 0), 0);

  if (badge) {
    badge.innerText = `${soldBooks.length} đầu sách · ${totalQuantity} cuốn · ${formatMoney(totalRevenue)}`;
  }

  if (soldBooks.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-3 text-center text-slate-400">Chưa có sách nào được bán trong khoảng này</td></tr>`;
    return;
  }

  tbody.innerHTML = soldBooks.map(b => {
    const quantity = Number(b.totalQuantity) || 0;
    const revenue = Number(b.totalRevenue) || 0;
    const share = totalQuantity ? Math.round((quantity / totalQuantity) * 100) : 0;
    const searching = (document.getElementById('adminSearchStudentInput')?.value || '').trim() === b.title;
    const unitPrice = quantity ? Math.round(revenue / quantity) : (Number(b.price) || 0);
    return `<tr class="transition cursor-pointer ${searching ? 'bg-emerald-50' : 'hover:bg-slate-50'}"
        title="Bấm để xem danh sách bạn đã mua cuốn này" data-sold-book="${escapeHtml(b.title)}">
      <td class="p-2.5 font-bold text-slate-800">
        ${escapeHtml(b.title)}
        ${searching ? '<span class="ml-1 text-[10px] font-black text-emerald-700">• đang xem</span>' : ''}
      </td>
      <td class="p-2.5 text-center"><span class="inline-block min-w-[2rem] px-2 py-0.5 rounded-lg bg-emerald-600 text-white text-xs font-black">${quantity}</span></td>
      <td class="p-2.5 hidden sm:table-cell">
        <div class="flex items-center gap-2">
          <div class="h-2 flex-1 bg-slate-100 rounded-full overflow-hidden">
            <div class="h-full bg-emerald-500 rounded-full" style="width:${Math.max(3, share)}%"></div>
          </div>
          <span class="text-[10px] font-bold text-slate-500 w-8 text-right">${share}%</span>
        </div>
      </td>
      <td class="p-2.5 text-right font-black text-emerald-600 whitespace-nowrap">${formatMoney(revenue)}</td>
      <td class="p-2.5 text-right text-slate-500 font-semibold whitespace-nowrap hidden sm:table-cell">${formatMoney(unitPrice)}</td>
    </tr>`;
  }).join('') + `<tr class="bg-slate-50 font-black">
      <td class="p-2.5 text-slate-700">TỔNG CỘNG (${soldBooks.length} đầu sách)</td>
      <td class="p-2.5 text-center text-slate-800">${totalQuantity}</td>
      <td class="hidden sm:table-cell"></td>
      <td class="p-2.5 text-right text-emerald-700 whitespace-nowrap">${formatMoney(totalRevenue)}</td>
      <td class="hidden sm:table-cell"></td>
    </tr>`;
}

/** Bấm một đầu sách → lọc danh sách phát sách theo đúng cuốn đó (bấm lại để bỏ) */
function filterBySoldBook(bookTitle) {
  const input = document.getElementById('adminSearchStudentInput');
  if (!input) return;
  input.value = input.value.trim() === bookTitle ? '' : bookTitle;
  renderAdminOrderList();
  renderAdminDateFilter();
  switchAdminTab('orders');
}

function weekdayLabel(dateKey) {
  const d = new Date(`${dateKey}T00:00:00`);
  if (isNaN(d.getTime())) return '';
  return ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()];
}

/** Vẽ lại toàn bộ số liệu của bảng quản trị theo khoảng ngày đang lọc */
function renderAdminTabsWithFilter() {
  const allOrders = window.allAdminOrders || [];
  const paidOrders = filterOrdersByAdminDate(allOrders.filter(o => o.status === 'PAID'));
  window.filteredPaidOrders = paidOrders;

  const totalBooks = paidOrders.reduce((sum, o) => sum + orderBookCount(o), 0);
  const totalAmount = paidOrders.reduce((sum, o) => sum + (Number(o.amount) || 0), 0);

  const revEl = document.getElementById('adminTotalRevenue');
  if (revEl) revEl.innerText = `Tổng tiền: ${formatMoney(totalAmount)}`;

  const paidCountEl = document.getElementById('adminPaidCount');
  if (paidCountEl) paidCountEl.innerText = `${paidOrders.length} đơn đã nộp (${totalBooks} cuốn)`;

  const summaryEl = document.getElementById('adminDateSummary');
  if (summaryEl) {
    summaryEl.innerHTML = `📅 <strong>${escapeHtml(adminDateRangeLabel())}</strong> — ${paidOrders.length} đơn đã nộp · ${totalBooks} cuốn · <span class="text-emerald-700 font-black">${formatMoney(totalAmount)}</span>`;
  }

  renderAdminBookSummary({ bookSummary: computeBookSummary(paidOrders) });
  populateAdminClassFilter(paidOrders);
  renderAdminOrderList();
  renderAdminCustomerTab(paidOrders);
  renderAdminClassTab(paidOrders);
  renderAdminDepartmentTab({ allOrders: filterOrdersByAdminDate(allOrders) });
}

/** TAB ĐƠN HÀNG — tổng số lượng từng cuốn trong danh mục chung */
function renderAdminBookSummary(stats) {
  const container = document.getElementById('adminBookSummaryCards');
  if (!container) return;
  container.innerHTML = `<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">${(stats.bookSummary || []).map(b => `
    <div class="bg-slate-50 border border-slate-200 p-2.5 rounded-2xl text-center">
      <div class="text-xs font-bold truncate" title="${escapeHtml(b.title)}">${escapeHtml(b.title)}</div>
      <div class="text-xl font-black text-emerald-600">${b.totalQuantity} cuốn</div>
      <div class="text-xs text-slate-400">${formatMoney(b.totalRevenue)}</div>
    </div>`).join('')}</div>`;
}

/** Dropdown lọc danh sách phát sách theo lớp (trong tab Đơn hàng) */
function populateAdminClassFilter(paidOrders) {
  const classes = [...new Set(paidOrders.map(o => orderClassLabel(o).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
  if (adminClassFilterValue !== '__ALL__' && !classes.includes(adminClassFilterValue)) {
    adminClassFilterValue = '__ALL__';
  }
  renderXBookSelect('adminClassFilterSelect', {
    size: 'sm',
    placeholder: 'Mọi lớp',
    value: adminClassFilterValue,
    onChange: (value) => setAdminClassFilter(value),
    options: [
      { value: '__ALL__', label: 'Mọi lớp' },
      ...classes.map(c => ({ value: c, label: c }))
    ]
  });
}

function setAdminClassFilter(value) {
  adminClassFilterValue = value;
  renderAdminOrderList();
}

function getFilteredPaidOrders() {
  const keyword = (document.getElementById('adminSearchStudentInput')?.value || '').toLowerCase().trim();
  return (window.filteredPaidOrders || window.cachedPaidOrders || []).filter(o => {
    const okClass = adminClassFilterValue === '__ALL__' || orderClassLabel(o).trim() === adminClassFilterValue;
    const okSearch = !keyword ||
      (o.customerName || '').toLowerCase().includes(keyword) ||
      orderClassLabel(o).toLowerCase().includes(keyword) ||
      (o.customerPhone || '').includes(keyword) ||
      orderItemsLabel(o).toLowerCase().includes(keyword);
    return okClass && okSearch;
  });
}

function filterAdminStudentList() {
  renderAdminOrderList();
}

/** TAB ĐƠN HÀNG — danh sách phát sách (desktop table + mobile cards) */
function renderAdminOrderList() {
  const orders = getFilteredPaidOrders();
  const tbody = document.getElementById('adminOrderTableBody');
  const mobileContainer = document.getElementById('adminOrderMobileList');

  if (tbody) {
    if (orders.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-slate-400">Không tìm thấy bạn nào</td></tr>`;
    } else {
      tbody.innerHTML = orders.map((o, index) => {
        const deliveredClass = o.isDelivered ? 'line-through text-slate-400' : 'text-slate-900';
        return `
          <tr class="hover:bg-slate-50 transition border-b border-slate-100">
            <td class="p-2.5 text-center font-bold text-slate-400 text-xs">${index + 1}</td>
            <td class="p-2.5 font-extrabold text-sm ${deliveredClass}">
              ${escapeHtml(o.customerName)}<div class="text-[10px] text-emerald-700">Giao dự kiến: ${escapeHtml(formatDelivery(o.deliveryAt))}</div>
              ${o.customerPhone ? `<div class="text-[10px] text-slate-400 font-normal">SĐT: ${escapeHtml(o.customerPhone)}</div>` : ''}
            </td>
            <td class="p-2.5 text-xs font-bold text-slate-600">${o.customerClass ? escapeHtml(orderClassLabel(o)) : '<span class="text-slate-300">—</span>'}</td>
            <td class="p-2.5 font-medium text-xs max-w-xs">
              ${escapeHtml(orderItemsLabel(o))}
              ${orderDepartments(o).map(d => `<span class="ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 align-middle">${escapeHtml(d)}</span>`).join('')}
            </td>
            <td class="p-2.5 text-[11px] font-bold text-slate-500 whitespace-nowrap">
              ${escapeHtml(formatDateKeyVN(localDateKey(o.createdAt)))}
              <div class="text-[9px] font-normal text-slate-400">${o.paidAt ? `TT: ${escapeHtml(formatDateKeyVN(localDateKey(o.paidAt)))}` : 'chưa TT'}</div>
            </td>
            <td class="p-2.5 font-black text-emerald-600 text-xs whitespace-nowrap">${formatMoney(o.amount)}</td>
            <td class="p-2.5 text-center print:hidden">
              <label class="inline-flex items-center space-x-1.5 cursor-pointer bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg">
                <input type="checkbox" ${o.isDelivered ? 'checked' : ''} onchange="toggleDelivered(${o.orderCode})"
                  class="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer" />
                <span class="text-[11px] font-bold ${o.isDelivered ? 'text-emerald-700' : 'text-slate-600'}">
                  ${o.isDelivered ? '✓ Đã phát' : 'Chưa'}
                </span>
              </label>
            </td>
          </tr>
        `;
      }).join('');
    }
  }

  if (mobileContainer) {
    if (orders.length === 0) {
      mobileContainer.innerHTML = `
        <div class="p-6 text-center text-slate-400 text-xs bg-white rounded-2xl border border-dashed border-slate-200">
          Chưa có ai nộp tiền
        </div>`;
    } else {
      mobileContainer.innerHTML = orders.map((o, index) => {
        const isDelivered = !!o.isDelivered;
        const nameClass = isDelivered ? 'line-through text-slate-400' : 'text-slate-900';
        const cardBg = isDelivered ? 'bg-slate-100/70 border-slate-200' : 'bg-white border-slate-200 shadow-sm';
        const btnClass = isDelivered
          ? 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold'
          : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200 font-semibold';

        return `
          <div class="p-3 rounded-2xl border ${cardBg} transition flex items-center justify-between gap-2.5">
            <div class="flex items-start space-x-2.5 min-w-0">
              <span class="w-6 h-6 rounded-full bg-slate-200/90 text-slate-700 font-extrabold text-[11px] flex items-center justify-center flex-shrink-0 mt-0.5">${index + 1}</span>
              <div class="min-w-0">
                <div class="font-extrabold text-sm ${nameClass} truncate">${escapeHtml(o.customerName)}<div class="text-[10px] text-emerald-700">Giao dự kiến: ${escapeHtml(formatDelivery(o.deliveryAt))}</div></div>
                ${o.customerClass ? `<div class="text-[10px] font-bold text-sky-600 mt-0.5">${escapeHtml(orderClassLabel(o))}</div>` : ''}
                <div class="text-[11px] text-slate-500 mt-0.5">${escapeHtml(orderItemsLabel(o))}</div>
                <div class="text-[10px] font-bold text-slate-400 mt-0.5">
                  Đặt: ${escapeHtml(formatDateKeyVN(localDateKey(o.createdAt)))}${o.paidAt ? ` · TT: ${escapeHtml(formatDateKeyVN(localDateKey(o.paidAt)))}` : ''}
                </div>
                <div class="text-xs font-black text-emerald-600 mt-0.5">${formatMoney(o.amount)}</div>
              </div>
            </div>
            <button onclick="toggleDelivered(${o.orderCode})"
              class="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs border transition flex items-center space-x-1 ${btnClass}">
              <span>${isDelivered ? '✓ Đã phát' : 'Chưa phát'}</span>
            </button>
          </div>
        `;
      }).join('');
    }
  }
  lucide.createIcons();
}

/** TAB THEO TÊN — gộp các đơn của cùng 1 người (1 người mua nhiều cuốn khác nhau) */
function groupOrdersByCustomer(paidOrders) {
  const map = new Map();
  paidOrders.forEach(o => {
    const key = (o.customerName || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!map.has(key)) {
      map.set(key, {
        displayName: (o.customerName || '').trim(),
        customerClass: orderClassLabel(o) || '',
        customerPhone: o.customerPhone || '',
        orders: [],
        totalBooks: 0,
        totalAmount: 0
      });
    }
    const g = map.get(key);
    if (!g.customerClass && o.customerClass) g.customerClass = o.customerClass;
    if (!g.customerPhone && o.customerPhone) g.customerPhone = o.customerPhone;
    g.orders.push(o);
    g.totalBooks += orderBookCount(o);
    g.totalAmount += o.amount;
  });
  const groups = [...map.values()];
  groups.sort((a, b) => compareByLastName(a.displayName, b.displayName));
  return groups;
}

function renderAdminCustomerTab(paidOrders) {
  const container = document.getElementById('adminCustomerList');
  const countEl = document.getElementById('adminCustomerCount');
  if (!container) return;

  const groups = groupOrdersByCustomer(paidOrders);
  if (countEl) countEl.innerText = `${groups.length} người mua`;

  if (groups.length === 0) {
    container.innerHTML = `<div class="p-6 text-center text-slate-400 text-xs bg-slate-50 rounded-2xl border border-dashed border-slate-200">Chưa có ai thanh toán</div>`;
    return;
  }

  container.innerHTML = groups.map((g, idx) => {
    const allDelivered = g.orders.every(o => o.isDelivered);
    const deliveredCount = g.orders.filter(o => o.isDelivered).length;
    return `
      <div class="bg-white border ${allDelivered ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200'} rounded-2xl p-3 sm:p-3.5 shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div class="flex items-center space-x-2 min-w-0">
            <span class="w-7 h-7 rounded-full bg-emerald-600 text-white font-black text-xs flex items-center justify-center flex-shrink-0">${idx + 1}</span>
            <div class="min-w-0">
              <div class="font-black text-sm text-slate-900 truncate">${escapeHtml(g.displayName)}</div>
              <div class="text-[10px] text-slate-400 font-semibold">
                ${g.customerClass ? `<span class="text-sky-600 font-bold">${escapeHtml(g.customerClass)}</span> · ` : ''}
                ${g.customerPhone ? `SĐT: ${escapeHtml(g.customerPhone)} · ` : ''}
                ${g.orders.length} đơn · ${g.totalBooks} cuốn
              </div>
            </div>
          </div>
          <div class="flex items-center space-x-2">
            <span class="text-sm font-black text-emerald-600">${formatMoney(g.totalAmount)}</span>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${allDelivered ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' : 'bg-slate-100 text-slate-500 border border-slate-200'}">
              ${allDelivered ? '✓ Đã nhận đủ' : `Đã phát ${deliveredCount}/${g.orders.length} đơn`}
            </span>
          </div>
        </div>

        <div class="space-y-1.5">
          ${g.orders.map(o => `
            <div class="flex items-center justify-between gap-2 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
              <div class="text-xs text-slate-700 min-w-0">
                <span class="font-semibold">${escapeHtml(orderItemsLabel(o))}</span>
                <span class="text-slate-400"> — ${formatMoney(o.amount)}</span>
              </div>
              <button onclick="toggleDelivered(${o.orderCode})"
                class="flex-shrink-0 text-[10px] font-bold px-2 py-1 rounded-lg border transition ${o.isDelivered ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100'}">
                ${o.isDelivered ? '✓ Đã phát' : 'Chưa phát'}
              </button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
  lucide.createIcons();
}

/** TAB THEO LỚP — thống kê từng lớp */
function groupOrdersByClass(paidOrders) {
  const map = new Map();
  paidOrders.forEach(o => {
    const key = orderClassLabel(o).trim() || 'Chưa khai báo lớp';
    if (!map.has(key)) {
      map.set(key, { className: key, students: new Set(), orders: [], totalBooks: 0, totalAmount: 0 });
    }
    const g = map.get(key);
    g.students.add((o.customerName || '').trim().toLowerCase());
    g.orders.push(o);
    g.totalBooks += orderBookCount(o);
    g.totalAmount += o.amount;
  });
  const groups = [...map.values()];
  groups.sort((a, b) => a.className.localeCompare(b.className, 'vi'));
  return groups;
}

function renderAdminClassTab(paidOrders) {
  const container = document.getElementById('adminClassList');
  const countEl = document.getElementById('adminClassCount');
  if (!container) return;

  const groups = groupOrdersByClass(paidOrders);
  if (countEl) countEl.innerText = `${groups.length} lớp`;

  if (groups.length === 0) {
    container.innerHTML = `<div class="p-6 text-center text-slate-400 text-xs bg-slate-50 rounded-2xl border border-dashed border-slate-200">Chưa có ai thanh toán</div>`;
    return;
  }

  container.innerHTML = groups.map(g => {
    const students = g.orders
      .slice()
      .sort((a, b) => compareByLastName(a.customerName, b.customerName));
    return `
      <div class="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div class="flex items-center justify-between gap-2 bg-slate-50 border-b border-slate-100 px-3.5 py-2.5">
          <div class="flex items-center space-x-2 min-w-0">
            <i data-lucide="users" class="w-4 h-4 text-emerald-600 flex-shrink-0"></i>
            <span class="font-black text-sm text-slate-900 truncate">${escapeHtml(g.className)}</span>
          </div>
          <div class="flex items-center space-x-2 text-[10px] font-bold text-slate-500 whitespace-nowrap">
            <span class="px-2 py-0.5 rounded-full bg-white border border-slate-200">${g.students.size} bạn</span>
            <span class="px-2 py-0.5 rounded-full bg-white border border-slate-200">${g.totalBooks} cuốn</span>
            <span class="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">${formatMoney(g.totalAmount)}</span>
          </div>
        </div>
        <div class="divide-y divide-slate-100">
          ${students.map(o => `
            <div class="flex items-center justify-between gap-2 px-3.5 py-2">
              <div class="min-w-0">
                <span class="text-xs font-extrabold text-slate-900">${escapeHtml(o.customerName)}<div class="text-[10px] text-emerald-700">Giao dự kiến: ${escapeHtml(formatDelivery(o.deliveryAt))}</div></span>
                <span class="text-[11px] text-slate-500"> — ${escapeHtml(orderItemsLabel(o))}</span>
              </div>
              <div class="flex items-center space-x-2 flex-shrink-0">
                <span class="text-xs font-black text-emerald-600">${formatMoney(o.amount)}</span>
                <button onclick="toggleDelivered(${o.orderCode})"
                  class="text-[10px] font-bold px-2 py-1 rounded-lg border transition ${o.isDelivered ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'}">
                  ${o.isDelivered ? '✓' : 'Chưa phát'}
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
  lucide.createIcons();
}

/** TAB THEO KHOA — list giáo trình cần thiết của từng khoa kèm số lượng đã đặt */
function renderAdminDepartmentTab(stats) {
  const container = document.getElementById('adminDepartmentList');
  if (!container) return;
  const departments = getAllDepartments();
  document.getElementById('adminDepartmentCount').innerText = `${departments.length} khoa`;
  container.innerHTML = departments.map(dept => {
    const classes = getClassesForDepartment(dept);
    // stats.allOrders ở đây đã được lọc theo khoảng ngày đang chọn (xem renderAdminTabsWithFilter)
  const orders = (stats.allOrders || []).filter(o => o.status === 'PAID' && o.customerDepartment === dept);
    const quantity = orders.reduce((sum, o) => sum + orderBookCount(o), 0);
    return `<section class="bg-white border rounded-2xl p-4 space-y-3">
      <h4 class="font-bold">${escapeHtml(dept)} <span class="text-xs text-emerald-700">Đã đặt: ${quantity} cuốn · ${formatMoney(orders.reduce((sum, o) => sum + o.amount, 0))}</span></h4>
      ${classes.length ? classes.map(c => {
        const books = allBooks.filter(b => c.bookIds.includes(b.id));
        return `<div class="border-t pt-2"><h5 class="text-sm font-bold text-sky-700">${escapeHtml(c.name)} · ${books.length} sách cần học</h5>
          <p class="text-xs text-slate-600">${books.length ? books.map(b => escapeHtml(b.title)).join(' · ') : 'Chưa thiết lập danh sách sách cho lớp.'}</p></div>`;
      }).join('') : '<p class="text-xs text-slate-400">Chưa có lớp.</p>'}
    </section>`;
  }).join('');
}

/** TAB QUẢN LÝ — danh mục giáo trình + danh sách khoa/lớp */
/** Thumbnail ảnh bìa sách (dùng chung cho bảng desktop & mobile) */
function bookCoverThumb(b, cls) {
  return b.cover
    ? `<img src="${escapeHtml(b.cover)}" alt="" onerror="this.style.display='none'" class="${cls} object-cover bg-slate-100" loading="lazy" />`
    : `<div class="${cls} bg-slate-100 flex items-center justify-center"><i data-lucide="book" class="w-4 h-4 text-slate-300"></i></div>`;
}

/** Lọc thư viện sách theo khoa / lớp / tên (tab Quản lý sách) */
let manageDeptFilter = '__ALL__';
let manageClassFilter = '__ALL__';
let manageBookSearch = '';

function getManageFilteredBooks() {
  let books = XBookDomain.filterBooks(allBooks, currentSettings, manageDeptFilter, manageClassFilter);
  const keyword = manageBookSearch.trim().toLowerCase();
  if (keyword) books = books.filter(b => `${b.title} ${b.author || ''}`.toLowerCase().includes(keyword));
  return books;
}

function setManageDeptFilter(value) {
  manageDeptFilter = value;
  manageClassFilter = '__ALL__';
  renderManageFilters();
  renderManageBookList();
}

function setManageClassFilter(value) {
  manageClassFilter = value;
  renderManageBookList();
}

/** Gõ từ khóa chỉ vẽ lại danh sách sách (không vẽ lại ô nhập để không mất con trỏ) */
function setManageBookSearch(value) {
  manageBookSearch = value;
  renderManageBookList();
}

function renderAdminManageTab() {
  renderManageFilters();
  renderManageBookList();
  renderSettingsChips();
  renderClassBookEditor();

  // Lớp là bắt buộc khi mua → nhắc quản trị viên nếu chưa khai báo lớp nào
  const noClassWarning = document.getElementById('adminNoClassWarning');
  if (noClassWarning) noClassWarning.classList.toggle('hidden', catalogClasses().length > 0);

  lucide.createIcons();
}

/** Bộ lọc thư viện sách: theo khoa / lớp / từ khóa tên sách */
function renderManageFilters() {
  const departments = currentSettings.departments || [];
  if (manageDeptFilter !== '__ALL__' && !departments.includes(manageDeptFilter)) manageDeptFilter = '__ALL__';

  renderXBookSelect('manageDeptFilter', {
    size: 'sm',
    placeholder: 'Mọi khoa',
    value: manageDeptFilter,
    onChange: (value) => setManageDeptFilter(value),
    options: [
      { value: '__ALL__', label: 'Mọi khoa' },
      ...departments.map(d => ({ value: d, label: d }))
    ]
  });

  const classes = getClassesForDepartment(manageDeptFilter);
  if (manageClassFilter !== '__ALL__' && !classes.some(c => XBookDomain.classKey(c) === manageClassFilter)) manageClassFilter = '__ALL__';
  renderXBookSelect('manageClassFilter', {
    size: 'sm',
    placeholder: classes.length ? 'Mọi lớp' : 'Chưa có lớp',
    value: manageClassFilter,
    onChange: (value) => setManageClassFilter(value),
    options: [
      { value: '__ALL__', label: 'Mọi lớp' },
      ...classes.map(c => ({
        value: XBookDomain.classKey(c),
        label: manageDeptFilter === '__ALL__' ? classLabel(c) : c.name,
        group: manageDeptFilter === '__ALL__' ? c.department : ''
      }))
    ]
  });
}

/** Mô tả ngắn gọn 1 cuốn sách đang là sách cần học của những khoa / lớp nào */
function bookScopeChips(bookId) {
  const scope = XBookDomain.bookScope(currentSettings, bookId);
  const allClasses = catalogClasses();
  const text = scope.departments.map(dept => {
    const inDept = allClasses.filter(c => c.department === dept);
    const used = inDept.filter(c => c.bookIds.includes(bookId));
    return used.length === inDept.length
      ? `${escapeHtml(dept)} (cả khoa)`
      : used.map(c => escapeHtml(c.name)).join(', ');
  }).join(' · ');
  const badge = scope.classes.length
    ? `<span class="inline-flex items-center text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5 mr-1 whitespace-nowrap">${scope.classes.length} lớp</span>`
    : '<span class="inline-flex items-center text-[10px] font-bold text-slate-400 bg-slate-100 border border-slate-200 rounded-full px-1.5 py-0.5 mr-1 whitespace-nowrap">Danh mục chung</span>';
  return { count: scope.classes.length, html: badge + (text || '<span class="text-slate-400">chưa gắn khoa / lớp nào</span>') };
}

function renderManageBookList() {
  const tbody = document.getElementById('adminBooksTableBody');
  const mobileList = document.getElementById('adminBooksMobileList');
  const countEl = document.getElementById('manageBooksCount');

  const books = getManageFilteredBooks();
  if (countEl) {
    const scopeText = manageClassFilter !== '__ALL__'
      ? ` của lớp đang chọn`
      : manageDeptFilter !== '__ALL__' ? ` của ${manageDeptFilter}` : '';
    countEl.innerText = `Hiển thị ${books.length}/${allBooks.length} cuốn sách${scopeText}.`;
  }

  const rows = books.map(b => {
    const scope = bookScopeChips(b.id);
    const classesText = scope.html;
    const meta = [escapeHtml(b.author || ''), escapeHtml(b.year || ''), b.pages ? `${b.pages} trang` : ''].filter(Boolean).join(' · ');
    return { b, classesText, meta };
  });

  if (tbody) {
    tbody.innerHTML = rows.length === 0
      ? `<tr><td colspan="5" class="p-4 text-center text-slate-400">Chưa có sách nào — bấm "Thêm sách" để bắt đầu</td></tr>`
      : rows.map(({ b, classesText, meta }) => `
        <tr class="hover:bg-slate-50 transition">
          <td class="p-2.5">
            ${bookCoverThumb(b, 'w-10 h-14 rounded-lg border border-slate-200')}
          </td>
          <td class="p-2.5">
            <div class="font-extrabold text-slate-900">${escapeHtml(b.title)}</div>
            ${meta ? `<div class="text-[10px] text-slate-400">${meta}</div>` : ''}
          </td>
          <td class="p-2.5 text-[11px] text-slate-600 max-w-[160px]">${classesText}</td>
          <td class="p-2.5 text-right font-black text-emerald-600 whitespace-nowrap">${formatMoney(b.price)}</td>
          <td class="p-2.5 text-center">
            <div class="flex items-center justify-center space-x-1">
              <button onclick="openBookForm('${escapeHtml(b.id)}')" title="Sửa" class="p-1.5 rounded-lg bg-slate-100 hover:bg-amber-100 text-slate-500 hover:text-amber-700 transition">
                <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
              </button>
              <button onclick="handleDeleteBook('${escapeHtml(b.id)}', '${escapeHtml(b.title).replace(/'/g, "\\'")}')" title="Xóa" class="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 transition">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </td>
        </tr>
      `).join('');
  }

  if (mobileList) {
    mobileList.innerHTML = rows.length === 0
      ? `<div class="p-4 text-center text-xs text-slate-400">Chưa có sách nào — bấm "Thêm sách" để bắt đầu</div>`
      : rows.map(({ b, meta, classesText }) => `
        <div class="p-3 flex items-center gap-2.5">
          ${bookCoverThumb(b, 'w-9 h-12 rounded-lg border border-slate-200 flex-shrink-0')}
          <div class="min-w-0 flex-1">
            <div class="text-xs font-extrabold text-slate-900 truncate">${escapeHtml(b.title)}</div>
            <div class="text-[10px] text-slate-400 mt-0.5">
${classesText}
              ${meta ? ` · ${meta}` : ''}
            </div>
            <div class="text-xs font-black text-emerald-600 mt-0.5">${formatMoney(b.price)}</div>
          </div>
          <div class="flex items-center space-x-1 flex-shrink-0">
            <button onclick="openBookForm('${escapeHtml(b.id)}')" class="p-2 rounded-lg bg-slate-100 text-slate-500"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>
            <button onclick="handleDeleteBook('${escapeHtml(b.id)}', '${escapeHtml(b.title).replace(/'/g, "\\'")}')" class="p-2 rounded-lg bg-slate-100 text-slate-500"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
          </div>
        </div>
      `).join('');
  }

}

function renderSettingsChips() {
  const deptWrap = document.getElementById('deptChipsEditor');
  const classWrap = document.getElementById('classChipsEditor');
  if (!deptWrap || !classWrap) return;

  const chipHtml = (name, type) => `
    <span class="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${type === 'dept' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-sky-50 text-sky-700 border border-sky-200'}">
      ${escapeHtml(name)}
      <button onclick="handleRemoveChip('${type}', '${escapeHtml(name).replace(/'/g, "\\'")}')" class="hover:text-rose-600 transition" title="Xóa">
        <i data-lucide="x" class="w-3 h-3"></i>
      </button>
    </span>
  `;

  const departments = currentSettings.departments || [];
  deptWrap.innerHTML = departments.length
    ? departments.map(d => chipHtml(d, 'dept')).join('')
    : `<span class="text-[11px] text-slate-400">Chưa có khoa nào</span>`;

  renderXBookSelect('addClassDepartment', {
    size: 'sm',
    placeholder: departments.length ? 'Chọn khoa' : 'Chưa có khoa',
    value: xbookSelectValue('addClassDepartment') || departments[0] || '',
    options: departments.map(d => ({ value: d, label: d }))
  });
  const classes = XBookDomain.classes(currentSettings.classes, departments);
  classWrap.innerHTML = classes.length
    ? classes.map(c => chipHtml(`${c.department} / ${c.name}`, 'class')).join('')
    : `<span class="text-[11px] text-slate-400">Chưa có lớp nào — hãy bổ sung tên lớp tại đây</span>`;

  lucide.createIcons();
}

/** Gửi settings mới (khoa / lớp) lên server */
async function saveSettingsPatch(patch) {
  const res = await adminFetch('/api/admin/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch)
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Không lưu được cài đặt');
  currentSettings = { ...currentSettings, ...data.settings };
  renderStorefrontCatalogIfPresent();
  renderClassBookEditor();
  return data.settings;
}

async function handleAddDepartment(event) {
  event.preventDefault();
  const input = document.getElementById('addDeptInput');
  const name = input.value.trim();
  if (!name) return;
  const departments = [...new Set([...(currentSettings.departments || []), name])];
  try {
    await saveSettingsPatch({ departments });
    input.value = '';
    renderSettingsChips();
    renderStorefrontCatalogIfPresent();
    renderAdminManageTab();
  } catch (e) { alert("Lỗi: " + e.message); }
}

async function handleRemoveChip(type, name) {
  try {
    if (type === 'dept') {
      await saveSettingsPatch({ departments: (currentSettings.departments || []).filter(d => d !== name) });
    } else {
      await saveSettingsPatch({ classes: XBookDomain.classes(currentSettings.classes, currentSettings.departments).filter(c => `${c.department} / ${c.name}` !== name) });
    }
    renderSettingsChips();
    renderStorefrontCatalogIfPresent();
    renderAdminManageTab();
  } catch (e) { alert("Lỗi: " + e.message); }
}

async function handleAddClass(event) {
  event.preventDefault();
  const input = document.getElementById('addClassInput');
  const name = input.value.trim();
  if (!name) return;
  const department = xbookSelectValue('addClassDepartment');
  const classes = XBookDomain.classes([...(currentSettings.classes || []), { name, department, bookIds: [] }], currentSettings.departments);
  try {
    await saveSettingsPatch({ classes });
    input.value = '';
    renderSettingsChips();
    renderClassBookEditor();
    renderStorefrontCatalogIfPresent();
  } catch (e) { alert("Lỗi: " + e.message); }
}

// Each class owns a curriculum list; a global book can be used across any faculties.
function renderClassBookEditor() {
  const classes = catalogClasses();
  renderXBookSelect('classBookEditorSelect', {
    placeholder: classes.length ? 'Chọn khoa / lớp để thiết lập sách' : 'Chưa có lớp nào',
    options: classes.map(c => ({ value: XBookDomain.classKey(c), label: classLabel(c), group: c.department })),
    onChange: () => renderClassBookChoices()
  });
  renderClassBookChoices();
}
function renderClassBookChoices() {
  const key = xbookSelectValue('classBookEditorSelect');
  const entry = catalogClasses().find(c => XBookDomain.classKey(c) === key);
  const choices = document.getElementById('classBookChoices');
  document.getElementById('saveClassBooksButton').disabled = !entry;
  choices.innerHTML = !entry ? '<p class="text-xs text-slate-400">Hãy chọn lớp ở trên.</p>' : !allBooks.length ? '<p class="text-xs text-slate-400">Hãy thêm sách vào danh mục chung trước.</p>' : allBooks.map(b =>
    `<label class="flex items-center gap-2 text-xs p-2 rounded-lg hover:bg-slate-50"><input type="checkbox" value="${escapeHtml(b.id)}" ${entry.bookIds.includes(b.id) ? 'checked' : ''}><span>${escapeHtml(b.title)} · ${formatMoney(b.price)}</span></label>`).join('');
}
async function saveClassBooks(event) {
  event.preventDefault();
  const key = xbookSelectValue('classBookEditorSelect');
  if (!catalogClasses().some(c => XBookDomain.classKey(c) === key)) return;
  const bookIds = [...document.querySelectorAll('#classBookChoices input:checked')].map(input => input.value);
  const classes = catalogClasses().map(c => XBookDomain.classKey(c) === key ? { ...c, bookIds } : c);
  const button = document.getElementById('saveClassBooksButton');
  button.disabled = true;
  try {
    await saveSettingsPatch({ classes });
    renderAdminManageTab();
    if (window.currentAdminStats) await refreshAdminData();
    alert('Đã lưu danh sách sách cần học của lớp.');
  } catch (error) { alert('Lỗi: ' + error.message); }
  finally { renderClassBookChoices(); }
}

// ============================ CRUD GIÁO TRÌNH ============================
function openBookForm(bookId) {
  const form = document.getElementById('bookForm');
  form.reset();
  document.getElementById('formBookEditId').value = '';
  const statusEl = document.getElementById('coverUploadStatus');
  if (statusEl) statusEl.innerText = '';

  const heading = document.getElementById('bookFormHeading');
  if (bookId) {
    const book = allBooks.find(b => b.id === bookId);
    if (!book) return;
    heading.innerText = 'Sửa thông tin sách';
    document.getElementById('formBookEditId').value = book.id;
    document.getElementById('formBookTitle').value = book.title;
    document.getElementById('formBookPrice').value = book.price;
    document.getElementById('formBookPages').value = book.pages || '';
    document.getElementById('formBookYear').value = book.year || '';
    document.getElementById('formBookAuthor').value = book.author || '';
    document.getElementById('formBookCover').value = book.cover || '';
    document.getElementById('formBookDescription').value = book.description || '';
    updateCoverPreview();
  } else {
    heading.innerText = 'Thêm sách mới';
    updateCoverPreview();
  }

  renderBookScopeEditors(bookId || '');
  renderAdminManageTab();
  openModal('bookFormModal');
}

// ==================== SÁCH CẦN HỌC THEO KHOA / LỚP (CURRICULUM) ====================
/**
 * Sách KHÔNG thuộc khoa nào (danh mục chung). Khi admin "add" sách vào khoa/lớp thì
 * sách đó trở thành sách CẦN CÓ khi học (các) lớp ấy — VD Khoa Kinh tế cũng học Triết.
 */
let bookScopeSelection = { departments: [], classKeys: [] };

function scopeDepartment(key) {
  try { return JSON.parse(key)[0] || ''; } catch (e) { return ''; }
}

/** Nạp lựa chọn hiện tại của sách vào form (khoa nào dùng đủ mọi lớp → tích ở mức khoa) */
function renderBookScopeEditors(bookId) {
  const allClasses = catalogClasses();
  const scope = bookId ? XBookDomain.bookScope(currentSettings, bookId) : { classes: [], departments: [] };
  const usedKeys = new Set(scope.classes.map(XBookDomain.classKey));
  const departmentFullyUsed = (dept) => {
    const list = allClasses.filter(c => c.department === dept);
    return list.length > 0 && list.every(c => usedKeys.has(XBookDomain.classKey(c)));
  };
  bookScopeSelection = {
    departments: (currentSettings.departments || []).filter(departmentFullyUsed),
    classKeys: [...usedKeys].filter(key => !departmentFullyUsed(scopeDepartment(key)))
  };
  renderBookScopeChoices();
}

function renderBookScopeChoices() {
  const deptWrap = document.getElementById('bookScopeDepartments');
  const classWrap = document.getElementById('bookScopeClasses');
  if (!deptWrap || !classWrap) return;

  const departments = currentSettings.departments || [];
  const allClasses = catalogClasses();
  const selectedDepts = bookScopeSelection.departments;
  const selectedKeys = new Set(bookScopeSelection.classKeys);

  deptWrap.innerHTML = departments.length
    ? departments.map(d => {
        const active = selectedDepts.includes(d);
        const total = allClasses.filter(c => c.department === d).length;
        return `
          <label class="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border cursor-pointer transition ${
            active ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-300 hover:border-emerald-400'
          }">
            <input type="checkbox" class="hidden" data-scope-dept="${escapeHtml(d)}" ${active ? 'checked' : ''} onchange="toggleBookScopeDepartment(this)" />
            <span>${escapeHtml(d)}</span>
            <span class="text-[10px] font-black px-1.5 rounded-full ${active ? 'bg-white/25' : 'bg-slate-100 text-slate-500'}">${total} lớp</span>
          </label>`;
      }).join('')
    : '<span class="text-[11px] text-slate-400">Chưa có khoa nào — bổ sung khoa &amp; lớp ở panel bên phải.</span>';

  classWrap.innerHTML = allClasses.length
    ? allClasses.map(c => {
        const key = XBookDomain.classKey(c);
        const coveredByDepartment = selectedDepts.includes(c.department);
        const checked = coveredByDepartment || selectedKeys.has(key);
        return `
          <label class="flex items-center gap-2 text-[11px] p-1.5 rounded-lg ${coveredByDepartment ? 'opacity-50' : 'hover:bg-emerald-50'}">
            <input type="checkbox" value="${escapeHtml(key)}" ${checked ? 'checked' : ''} ${coveredByDepartment ? 'disabled' : ''} onchange="toggleBookScopeClass(this)" class="accent-emerald-600" />
            <span class="font-semibold text-slate-700">${escapeHtml(c.name)}</span>
            <span class="text-slate-400">· ${escapeHtml(c.department)}</span>
          </label>`;
      }).join('')
    : '<p class="text-[11px] text-slate-400 p-1">Chưa có lớp nào — bổ sung lớp ở panel bên phải.</p>';

  const summary = document.getElementById('bookScopeSummary');
  if (summary) {
    const soloKeys = [...selectedKeys];
    const total = selectedDepts.reduce((sum, d) => sum + allClasses.filter(c => c.department === d).length, 0) + soloKeys.length;
    const detail = [];
    if (selectedDepts.length) detail.push(selectedDepts.join(', '));
    if (soloKeys.length) detail.push(`${soloKeys.length} lớp riêng lẻ`);
    if (total === 0) {
      summary.innerText = '📚 Sách nằm trong danh mục chung — chưa gắn khoa/lớp nào (sinh viên vẫn thấy ở mục “Tất cả”).';
    } else {
      summary.innerText = `✅ Sách này là sách cần học của ${total} lớp${detail.length ? ` (${detail.join(' + ')})` : ''}.`;
    }
    // Cảnh báo khi tích khoa nhưng khoa đó chưa có lớp nào → chưa áp dụng được cho ai
    const emptyDepartments = selectedDepts.filter(d => !allClasses.some(c => c.department === d));
    if (emptyDepartments.length) {
      summary.innerText += ` ⚠️ ${emptyDepartments.join(', ')} chưa có lớp nào — hãy thêm lớp ở panel “Danh sách Lớp” rồi lưu lại.`;
    }
  }
}

function toggleBookScopeDepartment(input) {
  const dept = input.dataset.scopeDept;
  if (input.checked) {
    bookScopeSelection.departments = [...new Set([...bookScopeSelection.departments, dept])];
    // Cả khoa đã bao trùm → bỏ các lớp riêng lẻ thuộc khoa đó cho gọn
    bookScopeSelection.classKeys = bookScopeSelection.classKeys.filter(key => scopeDepartment(key) !== dept);
  } else {
    bookScopeSelection.departments = bookScopeSelection.departments.filter(d => d !== dept);
  }
  renderBookScopeChoices();
}

function toggleBookScopeClass(input) {
  const key = input.value;
  bookScopeSelection.classKeys = input.checked
    ? [...new Set([...bookScopeSelection.classKeys, key])]
    : bookScopeSelection.classKeys.filter(k => k !== key);
  renderBookScopeChoices();
}

/** Preview ảnh bìa trong form (theo URL đang nhập) */
function updateCoverPreview() {
  const url = (document.getElementById('formBookCover')?.value || '').trim();
  const img = document.getElementById('coverPreviewImg');
  const placeholder = document.getElementById('coverPreviewPlaceholder');
  if (!img || !placeholder) return;
  if (url) {
    img.src = url;
    img.classList.remove('hidden');
    placeholder.classList.add('hidden');
  } else {
    img.classList.add('hidden');
    img.removeAttribute('src');
    placeholder.classList.remove('hidden');
  }
}

/** Upload ảnh bìa từ máy → lưu lên server → điền link vào ô ảnh */
async function handleCoverUpload(input) {
  const file = input.files && input.files[0];
  const statusEl = document.getElementById('coverUploadStatus');
  if (!file) return;
  if (!isAdminAuthed()) { alert('Cần đăng nhập quản trị để upload ảnh!'); input.value = ''; return; }

  if (statusEl) { statusEl.innerText = 'Đang upload...'; statusEl.className = 'text-[10px] text-amber-600 font-semibold'; }

  const formData = new FormData();
  formData.append('cover', file);

  try {
    const res = await adminFetch('/api/admin/upload', {
      method: 'POST',
      body: formData
    });
    if (res.status === 401) { askAdminLogin('Phiên đăng nhập đã hết hạn — nhập lại mật khẩu để upload ảnh.'); throw new Error('Cần đăng nhập quản trị'); }
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Upload thất bại');
    document.getElementById('formBookCover').value = data.url;
    updateCoverPreview();
    if (statusEl) { statusEl.innerText = `✓ Đã upload: ${file.name}`; statusEl.className = 'text-[10px] text-emerald-600 font-semibold'; }
  } catch (e) {
    if (statusEl) { statusEl.innerText = 'Lỗi upload: ' + e.message; statusEl.className = 'text-[10px] text-rose-600 font-semibold'; }
  } finally {
    input.value = '';
  }
}

async function handleBookFormSubmit(event) {
  event.preventDefault();
  const editId = document.getElementById('formBookEditId').value;
  const payload = {
    title: document.getElementById('formBookTitle').value.trim(),
    price: Number(document.getElementById('formBookPrice').value) || 0,
    pages: Number(document.getElementById('formBookPages').value) || 0,
    year: (document.getElementById('formBookYear')?.value || '').trim(),
    author: document.getElementById('formBookAuthor').value.trim(),
    cover: document.getElementById('formBookCover').value.trim(),
    description: document.getElementById('formBookDescription').value.trim(),
    // Gán sách vào khoa / lớp → lớp đó cần có sách này khi học
    departments: [...bookScopeSelection.departments],
    classKeys: [...bookScopeSelection.classKeys]
  };

  const btn = document.getElementById('btnBookFormSubmit');
  btn.disabled = true;

  try {
    const res = await adminFetch(editId ? `/api/admin/books/${encodeURIComponent(editId)}` : '/api/admin/books', {
      method: editId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.status === 401) { askAdminLogin('Phiên đăng nhập đã hết hạn — nhập lại mật khẩu quản trị.'); return; }
    const data = await res.json();
    if (!data.success) {
      alert("Không lưu được: " + data.message);
      return;
    }
    closeModal('bookFormModal');
    const booksData = await refreshCatalogData();
    if (window.currentAdminStats) await refreshAdminData({ booksData });
  } catch (e) {
    alert("Lỗi kết nối: " + e.message);
  } finally {
    btn.disabled = false;
  }
}

async function handleDeleteBook(bookId, bookTitle) {
  if (!confirm(`Xóa sách "${bookTitle}" khỏi danh mục?`)) return;
  try {
    const res = await adminFetch(`/api/admin/books/${encodeURIComponent(bookId)}`, { method: 'DELETE' });
    if (res.status === 401) { askAdminLogin('Phiên đăng nhập đã hết hạn — nhập lại mật khẩu quản trị.'); return; }
    const data = await res.json();
    if (!data.success) {
      alert("Không xóa được: " + data.message);
      return;
    }
    const booksData = await refreshCatalogData();
    if (window.currentAdminStats) await refreshAdminData({ booksData });
  } catch (e) {
    alert("Lỗi kết nối: " + e.message);
  }
}

/**
 * Tải lại danh mục sách + cài đặt (khoa/lớp) rồi vẽ lại giao diện của trang đang mở.
 * Trả về data vừa fetch để caller dùng lại (tránh fetch /api/books lần 2).
 */
async function refreshCatalogData() {
  let data = null;
  try {
    const res = await fetch('/api/books');
    data = await res.json();
    if (data.success) {
      allBooks = data.books || [];
      currentSettings = { ...currentSettings, ...(data.settings || {}) };
      renderCatalogViews();
    }
  } catch (e) {
    console.error("Lỗi tải lại danh mục:", e);
  }
  return data;
}

// ============================ THAO TÁC CHUNG ============================
async function handleToggleRegistration() {
  try {
    const res = await adminFetch('/api/admin/toggle-registration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (res.status === 401) {
      askAdminLogin('Phiên đăng nhập đã hết hạn — vui lòng nhập lại mật khẩu quản trị.');
      return;
    }
    const data = await res.json();
    if (data.success) {
      currentSettings = { ...currentSettings, ...data.settings };
      renderStorefrontCatalogIfPresent();
      await refreshAdminData();
      if (data.settings.isRegistrationOpen && data.settings.deliveryDate) {
        alert(`Đã mở lại nhận đơn.\nNgày nhận sách hiện tại: ${formatDateVN(data.settings.deliveryDate)} (mặc định = ngày mai, bạn có thể đổi ở ô "Ngày nhận sách").`);
      }
    }
  } catch (e) {
    alert("Lỗi khi đổi trạng thái: " + e.message);
  }
}

/** Lưu ngày nhận sách + lưu ý giao sách (chốt sổ) */
async function handleSaveDelivery() {
  const dateInput = document.getElementById('deliveryDateInput');
  const noteInput = document.getElementById('deliveryNoteInput');
  if (!dateInput) return;
  try {
    await saveSettingsPatch({
      deliveryDate: (dateInput.value || '').trim(),
      deliveryNote: (noteInput ? noteInput.value : '').trim()
    });
    renderStorefrontCatalogIfPresent();
    alert("✅ Đã lưu ngày nhận sách và lưu ý cho sinh viên.");
  } catch (e) {
    alert("Lỗi khi lưu: " + e.message);
  }
}

async function toggleDelivered(orderCode) {
  try {
    await adminFetch('/api/admin/toggle-delivered', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderCode })
    });
    await refreshAdminData();
  } catch (e) {
    console.error("Lỗi toggle phát sách:", e);
  }
}

// ============================ XUẤT EXCEL (.XLSX) ============================

/** Nạp thư viện Excel (SheetJS ~1MB) CHỈ KHI CẦN — không tải trước làm chậm trang */
function loadXlsxLib() {
  return new Promise((resolve, reject) => {
    if (typeof XLSX !== 'undefined') return resolve();
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Không tải được thư viện Excel — kiểm tra mạng rồi thử lại!'));
    document.head.appendChild(s);
  });
}

async function exportToExcel() {
  try {
    if (!isAdminAuthed()) {
      askAdminLogin();
      return;
    }

    try {
      await loadXlsxLib();
    } catch (e) {
      alert(e.message);
      return;
    }

    let stats = window.currentAdminStats;
    if (!stats) {
      const res = await adminFetch('/api/admin/statistics');
      const result = await res.json();
      if (!result.success) {
        alert("Không thể tải dữ liệu để xuất Excel!");
        return;
      }
      stats = result.data;
      window.currentAdminStats = stats;
    }

    // Tôn trọng bộ lọc theo ngày đang chọn trên Bảng Quản Lý (quyết toán từng ngày)
    const allOrdersInRange = filterOrdersByAdminDate(stats.allOrders || []);
    const paidOrders = allOrdersInRange.filter(o => o.status === 'PAID');
    paidOrders.sort((a, b) => compareByLastName(a.customerName, b.customerName));
    const rangeLabel = adminDateRangeLabel();
    const rangeSuffixText = isAdminDateFilterActive() ? ` | Khoảng: ${rangeLabel}` : '';

    const wb = XLSX.utils.book_new();
    const exportTime = new Date().toLocaleString('vi-VN');

    // ========== SHEET 1: DANH SÁCH PHÁT SÁCH (ĐÃ THANH TOÁN) ==========
    const sheet1Rows = [
      ["DANH SÁCH SINH VIÊN ĐĂNG KÝ VÀ ĐÃ THANH TOÁN MUA GIÁO TRÌNH"],
      [`Thời gian xuất: ${exportTime} | ${rangeLabel} | Tổng số đơn: ${paidOrders.length} | Tổng tiền: ${formatMoney(paidOrders.reduce((sum, o) => sum + (Number(o.amount) || 0), 0))}`],
      [],
      [
        "STT", "Mã Đơn", "Họ và Tên", "Lớp", "Khoa (theo sách)", "Số Điện Thoại",
        "Giáo Trình Đã Mua", "Tổng Số Cuốn", "Thành Tiền (đ)",
        "Tình Trạng Phát Sách", "Ngày Đặt", "Ngày Nộp Tiền", "Ghi Chú / Mã GD"
      ]
    ];

    paidOrders.forEach((o, idx) => {
      const depts = orderDepartments(o);
      sheet1Rows.push([
        idx + 1,
        `XB${o.orderCode}`,
        o.customerName || '',
        orderClassLabel(o) || '',
        depts.join(', '),
        o.customerPhone || '',
        orderItemsLabel(o),
        orderBookCount(o),
        Number(o.amount) || 0,
        o.isDelivered ? "Đã nhận sách" : "Chưa nhận",
        formatDateKeyVN(localDateKey(o.createdAt)),
        o.paidAt ? new Date(o.paidAt).toLocaleString('vi-VN') : '',
        o.bankReference || o.note || ''
      ]);
    });

    sheet1Rows.push([]);
    sheet1Rows.push([
      "TỔNG CỘNG", "", `${paidOrders.length} đơn`, "", "", "", "",
      paidOrders.reduce((sum, o) => sum + orderBookCount(o), 0),
      paidOrders.reduce((sum, o) => sum + (Number(o.amount) || 0), 0),
      `${paidOrders.filter(o => o.isDelivered).length} đã nhận`, "", "", ""
    ]);

    const ws1 = XLSX.utils.aoa_to_sheet(sheet1Rows);
    ws1['!cols'] = [
      { wch: 6 }, { wch: 14 }, { wch: 25 }, { wch: 14 }, { wch: 22 }, { wch: 14 },
      { wch: 45 }, { wch: 12 }, { wch: 15 }, { wch: 18 }, { wch: 13 }, { wch: 20 }, { wch: 22 }
    ];
    if (paidOrders.length > 0) ws1['!autofilter'] = { ref: `A4:M${4 + paidOrders.length}` };
    XLSX.utils.book_append_sheet(wb, ws1, "Danh Sách Phát Sách");

    // Global print totals: count each book once, regardless of how many classes use it.
    const sheet2Rows = [
      ["BẢNG TỔNG HỢP SỐ LƯỢNG SÁCH (BÁO IN)"],
      [`Thời gian xuất: ${exportTime}${rangeSuffixText}`], [],
      ["Tên Giáo Trình", "Đơn Giá (đ)", "Tổng Số Cuốn Cần In", "Tổng Doanh Thu (đ)"]
    ];
    const summarySorted = computeBookSummary(paidOrders).sort((a, b) => a.title.localeCompare(b.title, 'vi'));
    summarySorted.forEach(b => sheet2Rows.push([b.title, Number(b.price) || 0, Number(b.totalQuantity) || 0, Number(b.totalRevenue) || 0]));
    sheet2Rows.push([], ["TỔNG CỘNG", "", paidOrders.reduce((s, o) => s + orderBookCount(o), 0), paidOrders.reduce((s, o) => s + (Number(o.amount) || 0), 0)]);
    const ws2 = XLSX.utils.aoa_to_sheet(sheet2Rows);
    ws2['!cols'] = [{ wch: 38 }, { wch: 15 }, { wch: 22 }, { wch: 20 }];
    if (summarySorted.length > 0) ws2['!autofilter'] = { ref: `A4:D${4 + summarySorted.length}` };
    XLSX.utils.book_append_sheet(wb, ws2, "Tổng Hợp Sách");

    // ========== SHEET 3: THEO TÊN NGƯỜI MUA (GỘP NHIỀU CUỐN) ==========
    const customerGroups = groupOrdersByCustomer(paidOrders);
    const sheet3Rows = [
      ["THỐNG KÊ THEO TÊN NGƯỜI MUA (1 NGƯỜI MUA NHIỀU CUỐN KHÁC NHAU)"],
      [`Thời gian xuất: ${exportTime}${rangeSuffixText} | Tổng số người mua: ${customerGroups.length}`],
      [],
      ["STT", "Họ và Tên", "Lớp", "Số Điện Thoại", "Các Giáo Trình Đã Mua", "Tổng Số Cuốn", "Tổng Tiền (đ)", "Đã Nhận Đủ Sách"]
    ];
    customerGroups.forEach((g, idx) => {
      sheet3Rows.push([
        idx + 1,
        g.displayName,
        g.customerClass || '',
        g.customerPhone || '',
        g.orders.map(o => orderItemsLabel(o)).join(' | '),
        g.totalBooks,
        g.totalAmount,
        g.orders.every(o => o.isDelivered) ? "Đã nhận đủ" : "Chưa đủ"
      ]);
    });

    const ws3 = XLSX.utils.aoa_to_sheet(sheet3Rows);
    ws3['!cols'] = [
      { wch: 6 }, { wch: 25 }, { wch: 14 }, { wch: 14 }, { wch: 55 }, { wch: 12 }, { wch: 15 }, { wch: 16 }
    ];
    if (customerGroups.length > 0) ws3['!autofilter'] = { ref: `A4:H${4 + customerGroups.length}` };
    XLSX.utils.book_append_sheet(wb, ws3, "Theo Tên Người Mua");

    // ========== SHEET 4: TOÀN BỘ ĐƠN HÀNG (ĐỐI SOÁT) ==========
    const allOrders = allOrdersInRange;
    if (allOrders.length > 0) {
      const sheet4Rows = [
        ["DANH SÁCH TOÀN BỘ ĐƠN HÀNG (BAO GỒM CHỜ VÀ ĐÃ THANH TOÁN)"],
        [`Thời gian xuất: ${exportTime}${rangeSuffixText} | Tổng số đơn: ${allOrders.length}`],
        [],
        [
          "STT", "Mã Đơn", "Họ và Tên", "Lớp", "Số Điện Thoại", "Giáo Trình & Số Lượng",
          "Tổng Số Cuốn", "Thành Tiền (đ)", "Trạng Thái", "Tình Trạng Phát",
          "Ngày Đặt", "Thời Gian Tạo Đơn", "Thời Gian Thanh Toán"
        ]
      ];

      allOrders.forEach((o, idx) => {
        sheet4Rows.push([
          idx + 1,
          `XB${o.orderCode}`,
          o.customerName || '',
          orderClassLabel(o) || '',
          o.customerPhone || '',
          orderItemsLabel(o),
          orderBookCount(o),
          Number(o.amount) || 0,
          o.status === 'PAID' ? 'Đã thanh toán' : 'Chờ thanh toán (PENDING)',
          o.isDelivered ? 'Đã phát' : 'Chưa phát',
          formatDateKeyVN(localDateKey(o.createdAt)),
          o.createdAt ? new Date(o.createdAt).toLocaleString('vi-VN') : '',
          o.paidAt ? new Date(o.paidAt).toLocaleString('vi-VN') : ''
        ]);
      });

      const ws4 = XLSX.utils.aoa_to_sheet(sheet4Rows);
      ws4['!cols'] = [
        { wch: 6 }, { wch: 14 }, { wch: 25 }, { wch: 14 }, { wch: 14 }, { wch: 45 },
        { wch: 12 }, { wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 13 }, { wch: 20 }, { wch: 20 }
      ];
      ws4['!autofilter'] = { ref: `A4:M${4 + allOrders.length}` };
      XLSX.utils.book_append_sheet(wb, ws4, "Toàn Bộ Đơn Hàng");
    }

    // ========== SHEET 5: QUYẾT TOÁN THEO NGÀY (ĐỐI SOÁT TIỀN VỀ TỪNG NGÀY) ==========
    const daily = groupOrdersByDay(paidOrders);
    const sheet5Rows = [
      ["BẢNG QUYẾT TOÁN THEO NGÀY (CHỈ TÍNH ĐƠN ĐÃ THANH TOÁN)"],
      [`Thời gian xuất: ${exportTime} | ${rangeLabel} | Tính theo: ${adminDateBasis === 'paid' ? 'ngày tiền về' : 'ngày khách đặt'}`],
      [],
      ["Ngày", "Thứ", "Số Đơn Đã Nộp", "Số Cuốn", "Doanh Thu (đ)", "Trung bình / Đơn (đ)"]
    ];
    daily.forEach(d => {
      sheet5Rows.push([
        formatDateKeyVN(d.date),
        weekdayLabel(d.date),
        d.orders,
        d.books,
        d.amount,
        d.orders ? Math.round(d.amount / d.orders) : 0
      ]);
    });
    sheet5Rows.push([]);
    sheet5Rows.push([
      "TỔNG CỘNG",
      `${daily.length} ngày`,
      daily.reduce((s, d) => s + d.orders, 0),
      daily.reduce((s, d) => s + d.books, 0),
      daily.reduce((s, d) => s + d.amount, 0),
      ''
    ]);
    const ws5 = XLSX.utils.aoa_to_sheet(sheet5Rows);
    ws5['!cols'] = [{ wch: 14 }, { wch: 8 }, { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 20 }];
    if (daily.length > 0) ws5['!autofilter'] = { ref: `A4:F${4 + daily.length}` };
    XLSX.utils.book_append_sheet(wb, ws5, "Quyết Toán Theo Ngày");

    // ========== SHEET 6: SÁCH ĐÃ BÁN (MỖI ĐẦU SÁCH BAO NHIÊU CUỐN) ==========
    const soldBooks = computeBookSummary(paidOrders)
      .filter(b => Number(b.totalQuantity) > 0)
      .sort((a, b) => (b.totalQuantity - a.totalQuantity) || a.title.localeCompare(b.title, 'vi'));
    const soldTotalQuantity = soldBooks.reduce((sum, b) => sum + Number(b.totalQuantity || 0), 0);
    const soldTotalRevenue = soldBooks.reduce((sum, b) => sum + Number(b.totalRevenue || 0), 0);
    const sheet6Rows = [
      ["SÁCH ĐÃ BÁN — MỖI ĐẦU SÁCH BAO NHIÊU CUỐN"],
      [`Thời gian xuất: ${exportTime} | ${rangeLabel} | ${soldBooks.length} đầu sách · ${soldTotalQuantity} cuốn`],
      [],
      ["STT", "Tên Sách", "SL Bán (cuốn)", "Tỷ Trọng (%)", "Doanh Thu (đ)", "Đơn Giá TB (đ)"]
    ];
    soldBooks.forEach((b, idx) => {
      sheet6Rows.push([
        idx + 1,
        b.title,
        Number(b.totalQuantity) || 0,
        soldTotalQuantity ? Math.round(((Number(b.totalQuantity) || 0) / soldTotalQuantity) * 1000) / 10 : 0,
        Number(b.totalRevenue) || 0,
        Number(b.totalQuantity) ? Math.round((Number(b.totalRevenue) || 0) / Number(b.totalQuantity)) : 0
      ]);
    });
    sheet6Rows.push([]);
    sheet6Rows.push(["TỔNG CỘNG", `${soldBooks.length} đầu sách`, soldTotalQuantity, 100, soldTotalRevenue, '']);
    const ws6 = XLSX.utils.aoa_to_sheet(sheet6Rows);
    ws6['!cols'] = [{ wch: 6 }, { wch: 38 }, { wch: 15 }, { wch: 14 }, { wch: 16 }, { wch: 16 }];
    if (soldBooks.length > 0) ws6['!autofilter'] = { ref: `A4:F${4 + soldBooks.length}` };
    XLSX.utils.book_append_sheet(wb, ws6, "Sách Đã Bán");

    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const rangeFilePart = isAdminDateFilterActive() ? `_${adminDateFrom.replaceAll('-', '')}${adminDateTo !== adminDateFrom ? '-' + adminDateTo.replaceAll('-', '') : ''}` : '';
    const filename = `XBook_${isAdminDateFilterActive() ? 'QuyetToan' : 'DanhSach'}_${dateStr}${rangeFilePart}.xlsx`;

    XLSX.writeFile(wb, filename);

  } catch (error) {
    console.error("Lỗi xuất Excel:", error);
    alert("Có lỗi khi xuất file Excel: " + error.message);
  }
}

/**
 * Giao diện trang chủ KHÔNG nằm trên trang quản trị nữa (đã tách riêng 2 trang),
 * nên chỉ vẽ lại trang chủ khi hàm của nó tồn tại.
 */
function renderStorefrontCatalogIfPresent() {
  if (typeof renderStorefrontCatalog === 'function') renderStorefrontCatalog();
}

/** Vẽ lại các khối quản trị phụ thuộc danh mục sách + cài đặt khoa/lớp (core.js gọi) */
function renderAdminCatalog() {
  renderAdminManageTab();
  renderAdminDateFilter();
}

// ============================ KHỞI ĐỘNG TRANG QUẢN TRỊ ============================
/**
 * Trang quản trị là 1 trang riêng: mở /admin.html thì
 *  - đã có phiên đăng nhập (token còn hạn) → hiện thẳng Bảng Quản Lý + tải số liệu,
 *  - chưa đăng nhập → hiện form nhập mật khẩu quản trị.
 */
function initAdminPage() {
  initAdminDelegatedEvents();
  if (isAdminAuthed()) {
    showAdminDashboard();
    refreshAdminData();
  } else {
    askAdminLogin();
  }
}

document.addEventListener('DOMContentLoaded', initAdminPage);
// Nếu script được nạp SAU khi DOM đã sẵn sàng (defer/async, cache, hoặc chèn muộn) thì chạy ngay
if (document.readyState !== 'loading') initAdminPage();
