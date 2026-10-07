/**
 * ============================================================================
 * XBOOK - CORE.JS: PHẦN DÙNG CHUNG CHO TRANG CHỦ (/) VÀ TRANG QUẢN TRỊ (/admin.html)
 * ============================================================================
 * - Trạng thái danh mục sách + cài đặt (khoa / lớp / trạng thái đăng ký).
 * - Hàm tiện ích: tiền tệ, ngày tháng, escape HTML, sắp xếp theo tên.
 * - Component dropdown tự vẽ XBookSelect (thay <select> mặc định của trình duyệt).
 * - Tiện ích modal (mở / đóng) + copy clipboard.
 * ⚠️ File này KHÔNG gắn với trang nào: trang chủ nạp core.js + app.js,
 *    trang quản trị nạp core.js + admin.js.
 * ============================================================================
 */

// ============================ TRẠNG THÁI DÙNG CHUNG ============================
let allBooks = [];
let currentSettings = { isRegistrationOpen: true, departments: [], classes: [] };

// ============================ TIỆN ÍCH ĐỊNH DẠNG ============================
const formatMoney = (n) => `${(Number(n) || 0).toLocaleString('vi-VN')} đ`;

// Định dạng ngày "YYYY-MM-DD" → "08/10" (cùng năm) hoặc "08/10/2027"
function formatDateVN(ymd) {
  if (!ymd) return '';
  const d = new Date(`${ymd}T00:00:00`);
  if (isNaN(d.getTime())) return ymd;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return d.getFullYear() === new Date().getFullYear() ? `${dd}/${mm}` : `${dd}/${mm}/${d.getFullYear()}`;
}

function formatDelivery(value) {
  if (!value) return 'Chưa có lịch giao';
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// ============================ TIỆN ÍCH NGÀY THÁNG (DÙNG CHUNG) ============================
/** Khóa ngày theo giờ địa phương của máy: 'YYYY-MM-DD' */
function localDateKey(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function shiftDateKey(days) {
  const d = new Date(Date.now() + days * 86400000);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function formatDateKeyVN(key) {
  if (!key) return '';
  const [y, m, d] = key.split('-');
  return `${d}/${m}/${y}`;
}

// ============================ TIỆN ÍCH DỮ LIỆU ĐƠN HÀNG / DANH MỤC ============================
function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// Sắp xếp theo TÊN (từ cuối cùng của họ tên) chuẩn danh sách lớp
function compareByLastName(a, b) {
  const lastName = (fullName) => {
    const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
    return (parts[parts.length - 1] || '').toLowerCase();
  };
  return lastName(a).localeCompare(lastName(b), 'vi');
}

function orderBookCount(order) {
  const items = Array.isArray(order.items) && order.items.length > 0
    ? order.items
    : [{ quantity: order.quantity || 1 }];
  return items.reduce((s, it) => s + (Number(it.quantity) || 1), 0);
}

function orderItemsLabel(order) {
  const items = Array.isArray(order.items) && order.items.length > 0
    ? order.items
    : [{ bookTitle: order.bookTitle, quantity: order.quantity || 1 }];
  return items.map(it => `${it.bookTitle} (x${it.quantity || 1})`).join(', ');
}

function orderDepartments(order) {
  return order.customerDepartment ? [order.customerDepartment] : [];
}
function classLabel(entry) { return `${entry.department} / ${entry.name}`; }
function catalogClasses() { return XBookDomain.classes(currentSettings.classes, currentSettings.departments); }
function classesUsingBook(id) { return catalogClasses().filter(c => c.bookIds.includes(id)); }
function orderClassLabel(order) {
  return order.customerClass ? [order.customerDepartment, order.customerClass].filter(Boolean).join(' / ') : '';
}

// ============================ DROPDOWN TỰ VẼ (ĐỒNG BỘ GIAO DIỆN WEB) ============================
/**
 * Thay thế hoàn toàn <select> mặc định của trình duyệt cho các ô chọn KHOA / LỚP:
 *  - Trigger bo tròn theo theme xbook (emerald), panel nổi chia nhóm theo khoa.
 *  - Có ô tìm nhanh (khi nhiều lựa chọn), điều khiển được bằng bàn phím
 *    (Enter/Space mở, ↑ ↓ di chuyển, Enter chọn, Esc đóng), bấm ra ngoài tự đóng.
 *  - Giá trị vẫn là chuỗi XBookDomain.classKey(["Khoa","Lớp"]) nên đồng bộ với toàn bộ web.
 */
const xbookSelectState = new Map();

function xbookSelect(id) { return xbookSelectState.get(id) || null; }
function xbookSelectValue(id) { const st = xbookSelect(id); return st ? st.value : ''; }
function xbookSelectOptions(id) { const st = xbookSelect(id); return st ? st.options : []; }

function ensureXBookSelectState(id) {
  let st = xbookSelectState.get(id);
  if (!st) {
    st = { id, options: [], value: '', placeholder: 'Chọn...', open: false, search: '', highlight: -1, filtered: [], onChange: null, size: 'md' };
    xbookSelectState.set(id, st);
  }
  return st;
}

/** Bỏ dấu tiếng Việt để tìm nhanh không phân biệt dấu (vd: "kinh te" khớp "Kinh tế") */
function normalizeForSearch(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

const XBOOK_SELECT_SIZES = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-3 py-2 text-xs',
  lg: 'px-3.5 py-2.5 text-sm'
};

function xbookSelectPanelOpen(id) {
  const st = ensureXBookSelectState(id);
  st.open = true;
  st.highlight = -1;
  renderXBookSelect(id);
}

function toggleXBookSelect(id) {
  const st = ensureXBookSelectState(id);
  st.open = !st.open;
  st.search = '';
  st.highlight = -1;
  renderXBookSelect(id);
  if (st.open) {
    const container = document.getElementById(id);
    const input = container && container.querySelector('[data-xbook-search]');
    if (input) input.focus();
  }
}

function closeXBookSelects(exceptId) {
  let changed = false;
  for (const [id, st] of xbookSelectState) {
    if (st.open && id !== exceptId) { st.open = false; st.search = ''; renderXBookSelect(id); changed = true; }
  }
  return changed;
}

function selectXBookOption(id, value) {
  const st = ensureXBookSelectState(id);
  st.value = value;
  st.open = false;
  st.search = '';
  st.highlight = -1;
  renderXBookSelect(id);
  if (st.onChange) st.onChange(st.value);
}

function setXBookSelectValue(id, value, options = {}) {
  const st = ensureXBookSelectState(id);
  st.value = value || '';
  if (!st.options.some(o => o.value === st.value)) st.value = '';
  st.open = false;
  st.search = '';
  st.highlight = -1;
  renderXBookSelect(id);
  if (!options.silent && st.onChange) st.onChange(st.value);
}

/** Vẽ (hoặc vẽ lại) 1 dropdown. Chỉ truyền phần cấu hình cần đổi — trạng thái mở/tìm kiếm được giữ nguyên. */
function renderXBookSelect(id, config = {}) {
  const container = document.getElementById(id);
  if (!container) return;
  const st = ensureXBookSelectState(id);
  if (Array.isArray(config.options)) st.options = config.options;
  if (config.value !== undefined) st.value = config.value || '';
  if (config.placeholder) st.placeholder = config.placeholder;
  if (config.onChange !== undefined) st.onChange = config.onChange;
  if (config.size) st.size = config.size;
  if (!st.options.some(o => o.value === st.value)) st.value = '';

  const keyword = normalizeForSearch(st.search);
  const filtered = keyword
    ? st.options.filter(o => normalizeForSearch(`${o.label} ${o.group || ''}`).includes(keyword))
    : st.options;
  st.filtered = filtered;

  const selected = st.options.find(o => o.value === st.value);
  const sizeClass = XBOOK_SELECT_SIZES[st.size] || XBOOK_SELECT_SIZES.md;
  const showSearch = st.options.length > 7;

  let lastGroup = null;
  const rows = filtered.map((o) => {
    const header = o.group && o.group !== lastGroup
      ? `<div class="px-2.5 pt-2 pb-1 text-[10px] font-black uppercase tracking-wider text-slate-400">${escapeHtml(o.group)}</div>`
      : '';
    lastGroup = o.group || null;
    const index = filtered.indexOf(o);
    const active = o.value === st.value;
    const highlighted = index === st.highlight;
    return `${header}
      <button type="button" data-xbook-option data-value="${escapeHtml(o.value)}" role="option" aria-selected="${active}"
        class="w-full text-left flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-xs font-semibold transition ${
          active ? 'bg-emerald-50 text-emerald-800' : highlighted ? 'bg-slate-100 text-slate-800' : 'text-slate-700 hover:bg-slate-100'
        }">
        <span class="truncate">${escapeHtml(o.label)}</span>
        ${active ? '<span class="text-emerald-600 font-black flex-shrink-0">✓</span>' : ''}
      </button>`;
  }).join('');

  container.classList.add('relative');
  container.dataset.xbookSelect = id;
  container.innerHTML = `
    <button type="button" data-xbook-trigger data-xbook-select="${escapeHtml(id)}" aria-haspopup="listbox" aria-expanded="${st.open}"
      class="w-full flex items-center justify-between gap-2 ${sizeClass} rounded-xl border transition focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${
        st.open ? 'bg-white border-brand-500' : 'bg-slate-50 border-slate-300 hover:border-emerald-400'
      }">
      <span class="truncate font-semibold text-left ${selected ? 'text-slate-800' : 'text-slate-400'}">${escapeHtml(selected ? selected.label : st.placeholder)}</span>
      <i data-lucide="chevron-down" class="w-3.5 h-3.5 flex-shrink-0 text-slate-400 transition-transform ${st.open ? 'rotate-180' : ''}"></i>
    </button>
    <div data-xbook-panel data-xbook-select="${escapeHtml(id)}" role="listbox" class="absolute z-[70] left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-2xl p-1.5 ${st.open ? '' : 'hidden'}">
      ${showSearch ? `<input data-xbook-search value="${escapeHtml(st.search)}" placeholder="Tìm nhanh khoa / lớp..." class="w-full mb-1 px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-brand-500" />` : ''}
      <div data-xbook-options class="max-h-56 overflow-y-auto">
        ${rows || `<p class="px-2.5 py-2 text-xs text-slate-400">${st.options.length ? 'Không tìm thấy lựa chọn phù hợp' : 'Chưa có lựa chọn nào'}</p>`}
      </div>
    </div>
  `;

  bindXBookSelectEvents(id, container);
  if (st.open) {
    const active = container.querySelector('[data-xbook-option][aria-selected="true"]');
    if (active && typeof active.scrollIntoView === 'function') active.scrollIntoView({ block: 'nearest' });
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function bindXBookSelectEvents(id, container) {
  if (container.dataset.xbookBound === '1') return;
  container.dataset.xbookBound = '1';

  container.addEventListener('click', (event) => {
    const optionEl = event.target.closest('[data-xbook-option]');
    if (optionEl) { selectXBookOption(id, optionEl.dataset.value); return; }
    if (event.target.closest('[data-xbook-panel]')) return; // bấm trong panel (ô tìm nhanh) — giữ nguyên
    toggleXBookSelect(id);
  });

  container.addEventListener('input', (event) => {
    if (!event.target.matches('[data-xbook-search]')) return;
    const st = ensureXBookSelectState(id);
    st.search = event.target.value;
    st.highlight = -1;
    renderXBookSelect(id);
    const input = container.querySelector('[data-xbook-search]');
    if (input) {
      input.focus();
      if (typeof input.setSelectionRange === 'function') input.setSelectionRange(input.value.length, input.value.length);
    }
  });

  container.addEventListener('keydown', (event) => {
    const st = ensureXBookSelectState(id);
    const options = st.filtered || [];
    if (event.key === 'Escape') {
      if (st.open) { st.open = false; st.search = ''; renderXBookSelect(id); }
      return;
    }
    if (!st.open && (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown')) {
      event.preventDefault();
      xbookSelectPanelOpen(id);
      return;
    }
    if (!st.open) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (options.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      st.highlight = st.highlight < 0
        ? (step === 1 ? 0 : options.length - 1)
        : (st.highlight + step + options.length) % options.length;
      const highlightValue = st.highlight;
      renderXBookSelect(id);
      const el = container.querySelectorAll('[data-xbook-option]')[highlightValue];
      if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const pick = options[st.highlight] || options[0];
      if (pick) selectXBookOption(id, pick.value);
    }
  });
}

/**
 * Tìm dropdown chứa cú bấm. Dùng composedPath() vì đường đi của sự kiện được chụp ngay
 * lúc phát sinh — cần thiết khi trigger vừa bị vẽ lại (nút cũ đã tách khỏi DOM).
 */
function xbookSelectClickOrigin(event) {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
  for (const node of path) {
    const id = node && node.getAttribute && node.getAttribute('data-xbook-select');
    if (id) return id;
  }
  const target = event.target;
  const origin = target && typeof target.closest === 'function' ? target.closest('[data-xbook-select]') : null;
  return origin ? origin.dataset.xbookSelect : null;
}

document.addEventListener('click', (event) => {
  const originId = xbookSelectClickOrigin(event);
  for (const [id, st] of xbookSelectState) {
    if (!st.open || id === originId) continue;
    st.open = false;
    st.search = '';
    renderXBookSelect(id);
  }
});

// ============================ DANH MỤC KHOA / LỚP ============================
/** Danh sách khoa đầy đủ: từ settings + từ các giáo trình đang có */
function getAllDepartments() {
  return [...new Set(currentSettings.departments || [])];
}

function getClassesForDepartment(department = '__ALL__') {
  return catalogClasses().filter(c => department === '__ALL__' || c.department === department);
}

/**
 * 2. BANNER ĐÓNG / MỞ ĐĂNG KÝ

/**
 * LẤY DANH MỤC SÁCH & CÀI ĐẶT (KHOA / LỚP / TRẠNG THÁI ĐĂNG KÝ)
 * Trang nào đang mở thì vẽ lại giao diện của trang đó:
 *  - trang chủ (/) có renderStorefrontCatalog() trong app.js,
 *  - trang quản trị (/admin.html) có renderAdminCatalog() trong admin.js.
 */
async function fetchBooksAndSettings() {
  try {
    const res = await fetch('/api/books');
    const data = await res.json();
    if (data.success) {
      allBooks = data.books || [];
      currentSettings = {
        isRegistrationOpen: true,
        departments: [],
        classes: [],
        ...(data.settings || {})
      };

      renderCatalogViews();
    }
  } catch (error) {
    console.error("Lỗi khi tải dữ liệu giáo trình:", error);
    const grid = document.getElementById('bookGrid');
    if (grid) {
      grid.innerHTML = `
        <div class="col-span-full text-center py-10 text-rose-500 font-bold text-sm">
          Không thể kết nối đến máy chủ. Vui lòng thử lại sau!
        </div>
      `;
    }
  }
}

/** Vẽ lại giao diện của trang đang mở sau khi danh mục sách / cài đặt thay đổi */
function renderCatalogViews() {
  if (typeof renderStorefrontCatalog === 'function') renderStorefrontCatalog(); // trang chủ
  if (typeof renderAdminCatalog === 'function') renderAdminCatalog();           // trang quản trị
}

// ============================ TIỆN ÍCH MODAL ============================
function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  // Đóng modal mã QR thì dừng vòng kiểm tra tiền về (hàm nằm ở app.js của trang chủ)
  if (id === 'qrPaymentModal' && typeof stopOrderPolling === 'function') stopOrderPolling();
}

function copyToClipboard(elementId) {
  const text = document.getElementById(elementId).innerText;
  navigator.clipboard.writeText(text).then(() => {
    alert(`Đã copy: "${text}"`);
  });
}
