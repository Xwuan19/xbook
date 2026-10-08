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

/**
 * Kích thước trigger theo size — trên MOBILE luôn cao ≥ 40px để bấm bằng ngón cái
 * (py-2.5 + text-base 16px: đủ lớn và không bị iPhone phóng to trang khi chạm vào).
 */
const XBOOK_SELECT_SIZES = {
  sm: 'px-2.5 py-2 sm:py-1.5 text-xs min-h-[40px] sm:min-h-0',
  md: 'px-3 py-2.5 sm:py-2 text-xs min-h-[44px] sm:min-h-0',
  lg: 'px-3.5 py-3 sm:py-2.5 text-sm min-h-[48px] sm:min-h-0'
};

/** Đang xem trên màn hình nhỏ (điện thoại) không? — jsdom/SSR không có matchMedia thì coi như desktop */
function isSmallScreen() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(max-width: 639px)').matches;
}

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
    const trigger = container && container.querySelector('[data-xbook-trigger]');
    if (isSmallScreen()) {
      // Điện thoại: KHÔNG tự focus ô tìm nhanh (bàn phím bật lên sẽ che mất danh sách lớp),
      // chỉ kéo ô chọn vào giữa màn hình để panel hiện trọn.
      if (trigger && typeof trigger.scrollIntoView === 'function') trigger.scrollIntoView({ block: 'center' });
    } else if (input) {
      input.focus();
    }
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
        class="w-full text-left flex items-center justify-between gap-2 px-2.5 py-2.5 sm:py-2 rounded-xl text-sm sm:text-xs font-semibold transition ${
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
      ${showSearch ? `<input data-xbook-search value="${escapeHtml(st.search)}" placeholder="Tìm nhanh khoa / lớp..." class="w-full mb-1 px-3 py-2.5 sm:px-2.5 sm:py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-brand-500" />` : ''}
      <div data-xbook-options class="max-h-[45vh] sm:max-h-56 overflow-y-auto overscroll-contain">
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
/**
 * Modal / bottom-sheet dùng chung:
 *  - Mở: khóa cuộn nền (body.xb-modal-open) để khách không cuộn nhầm ra sau sheet,
 *    nhớ vị trí cuộn để đóng lại trả về đúng chỗ.
 *  - Đóng: bấm ra nền tối (data-modal-backdrop) hoặc phím Esc — chuẩn thao tác trên mobile.
 */
let xbOpenModals = [];
let xbSavedScrollY = 0;

function xbLockBodyScroll() {
  if (document.body.classList.contains('xb-modal-open')) return;
  xbSavedScrollY = window.scrollY || window.pageYOffset || 0;
  document.body.classList.add('xb-modal-open');
}

function xbUnlockBodyScroll() {
  if (xbOpenModals.length > 0) return;
  document.body.classList.remove('xb-modal-open');
  // Chỉ trả lại vị trí cuộn khi trang thật sự đã bị kéo xuống (tránh gọi scrollTo thừa)
  if (xbSavedScrollY > 0 && typeof window.scrollTo === 'function') window.scrollTo(0, xbSavedScrollY);
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  if (!xbOpenModals.includes(id)) xbOpenModals.push(id);
  xbLockBodyScroll();
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  xbOpenModals = xbOpenModals.filter(openId => openId !== id);
  xbUnlockBodyScroll();
  // Đóng modal mã QR thì dừng vòng kiểm tra tiền về (hàm nằm ở app.js của trang chủ)
  if (id === 'qrPaymentModal' && typeof stopOrderPolling === 'function') stopOrderPolling();
}

/** Đang mở modal nào không? (dùng cho test + logic khóa cuộn) */
function openModalIds() { return [...xbOpenModals]; }

// Bấm ra nền tối → đóng sheet (chỉ khi chạm đúng lớp nền, không phải nội dung bên trong)
document.addEventListener('click', (event) => {
  const backdrop = event.target && typeof event.target.closest === 'function'
    ? event.target.closest('[data-modal-backdrop]')
    : null;
  if (backdrop) closeModal(backdrop.dataset.modalBackdrop);
});

// Phím Esc → đóng modal đang mở trên cùng
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || xbOpenModals.length === 0) return;
  closeModal(xbOpenModals[xbOpenModals.length - 1]);
});

// ============================ TOAST PHẢN HỒI (MOBILE) ============================
/**
 * Thông báo ngắn ở đáy màn hình: thêm/bớt sách thành công, đã chép nội dung...
 * Trên điện thoại không có hover nên cần phản hồi rõ ràng bằng toast + rung nhẹ.
 */
function showToast(message, { icon = 'check', timeout = 2200 } = {}) {
  const host = document.getElementById('toastHost');
  if (!host) return null;

  const toast = document.createElement('div');
  toast.className = 'xb-toast pointer-events-auto flex max-w-sm items-center gap-2 rounded-2xl bg-slate-900/95 px-3.5 py-2.5 text-xs font-bold text-white shadow-xl border border-slate-700';
  toast.setAttribute('role', 'status');
  toast.innerHTML = `<i data-lucide="${escapeHtml(icon)}" class="h-4 w-4 flex-shrink-0 text-emerald-300"></i><span>${escapeHtml(message)}</span>`;
  host.appendChild(toast);
  if (typeof lucide !== 'undefined') lucide.createIcons();

  // Chỉ giữ 2 toast gần nhất để không che mất thanh giỏ hàng
  while (host.children.length > 2) host.removeChild(host.firstElementChild);

  setTimeout(() => {
    toast.classList.add('xb-toast-out');
    setTimeout(() => toast.remove(), 220);
  }, timeout);
  return toast;
}

/** Rung nhẹ khi chạm (Android/Chrome). iPhone không hỗ trợ thì bỏ qua, không báo lỗi. */
function hapticTap(ms = 10) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(ms);
  } catch (error) { /* trình duyệt không hỗ trợ */ }
}

/**
 * Bàn phím ảo trên điện thoại (đặc biệt iPhone) che mất nửa dưới màn hình,
 * làm nút "Tạo mã QR" biến mất khi khách đang gõ tên/SĐT.
 * → đo chiều cao bàn phím qua VisualViewport rồi đẩy sheet lên đúng bằng đó
 *   (biến --xb-keyboard dùng trong CSS .xb-sheet-lift / .xb-sheet-max).
 */
function initSheetKeyboardFix() {
  if (typeof window === 'undefined' || !window.visualViewport) return;

  const apply = () => {
    const viewport = window.visualViewport;
    const hidden = Math.max(0, Math.round(window.innerHeight - viewport.offsetTop - viewport.height));
    document.documentElement.style.setProperty('--xb-keyboard', `${hidden}px`);
  };

  window.visualViewport.addEventListener('resize', apply);
  window.visualViewport.addEventListener('scroll', apply);
  apply();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initSheetKeyboardFix);
  else initSheetKeyboardFix();
}

/**
 * Sao chép nội dung chuyển khoản.
 * Trên điện thoại vào bằng http:// (mạng LAN) thì `navigator.clipboard` không tồn tại
 * → phải có đường dự phòng bằng textarea tạm, nếu không nút "Chép nội dung" sẽ chết.
 */
function copyToClipboard(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const text = (el.innerText || '').trim();

  const feedback = (ok) => {
    if (ok) {
      hapticTap(12);
      if (typeof showToast === 'function') showToast(`Đã chép: ${text}`, { icon: 'clipboard-check' });
      else alert(`Đã copy: "${text}"`);
    } else {
      alert(`Không chép được. Nội dung cần chép: ${text}`);
    }
  };

  const legacyCopy = () => {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (error) { ok = false; }
    area.remove();
    feedback(ok);
  };

  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    navigator.clipboard.writeText(text).then(() => feedback(true)).catch(legacyCopy);
  } else {
    legacyCopy();
  }
}
