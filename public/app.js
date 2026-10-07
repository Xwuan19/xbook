/**
 * ============================================================================
 * XBOOK - APP.JS: HỆ THỐNG ĐĂNG KÝ GIÁO TRÌNH THEO KHOA / LỚP / TÊN
 * ============================================================================
 * - Phân loại KHOA: lọc giáo trình theo khoa, soạn list giáo trình cần thiết.
 * - Phân loại LỚP: danh sách lớp do quản trị bổ sung, gợi ý khi đăng ký.
 * - Phân loại TÊN: 1 người mua nhiều cuốn khác nhau trong 1 đơn / 1 mã QR.
 * - Responsive tối ưu cho cả Mobile & Desktop.
 * ============================================================================
 */

// ============================ TRẠNG THÁI TOÀN CỤC ============================
let allBooks = [];
let currentSettings = { isRegistrationOpen: true, departments: [], classes: [] };
let activeOrderCode = null;
let orderPollingInterval = null;

// Giỏ hàng: mỗi phần tử { bookId, quantity } — 1 người mua nhiều cuốn khác nhau
let cart = [];

// Bộ lọc trang chủ
let activeDepartmentFilter = '__ALL__';
let activeClassFilter = '__ALL__';

// Bộ lọc bảng quản trị
let adminClassFilterValue = '__ALL__';
let currentAdminTab = 'orders';

const formatMoney = (n) => `${(Number(n) || 0).toLocaleString('vi-VN')} đ`;

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
  const items = Array.isArray(order.items) ? order.items : [];
  return [...new Set(items.map(it => it.department).filter(Boolean))];
}

// ============================ KHỞI ĐỘNG ============================
document.addEventListener('DOMContentLoaded', () => {
  fetchBooksAndSettings();
});

/**
 * 1. LẤY DANH SÁCH GIÁO TRÌNH & CÀI ĐẶT (KHOA / LỚP / TRẠNG THÁI ĐĂNG KÝ)
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

      renderRegistrationBanner();
      renderDepartmentChips();
      renderClassFilter();
      renderBooks();
      renderCartUI();
      populateClassDatalist();
    }
  } catch (error) {
    console.error("Lỗi khi tải dữ liệu giáo trình:", error);
    document.getElementById('bookGrid').innerHTML = `
      <div class="col-span-full text-center py-10 text-rose-500 font-bold text-sm">
        Không thể kết nối đến máy chủ. Vui lòng thử lại sau!
      </div>
    `;
  }
}

/** Danh sách khoa đầy đủ: từ settings + từ các giáo trình đang có */
function getAllDepartments() {
  const set = new Set(currentSettings.departments || []);
  allBooks.forEach(b => set.add(b.department || 'Đại cương'));
  return [...set];
}

/** Danh sách lớp đầy đủ: quản trị khai báo + gắn trên giáo trình */
function getAllClassNames() {
  const set = new Set(currentSettings.classes || []);
  allBooks.forEach(b => (b.classes || []).forEach(c => set.add(c)));
  return [...set].sort((a, b) => a.localeCompare(b, 'vi'));
}

/**
 * 2. BANNER ĐÓNG / MỞ ĐĂNG KÝ
 */
function renderRegistrationBanner() {
  const container = document.getElementById('registrationBannerContainer');
  if (!container) return;

  if (currentSettings.isRegistrationOpen) {
    container.innerHTML = `
      <div class="bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border border-emerald-200/90 rounded-2xl p-3.5 sm:p-4 shadow-sm">
        <div class="flex items-center justify-between gap-2 mb-2">
          <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100/90 text-emerald-800 text-[11px] font-extrabold tracking-wide flex-shrink-0">
            <span class="relative flex h-2 w-2 flex-shrink-0">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
            </span>
            <span class="whitespace-nowrap">ĐANG NHẬN ĐƠN MUA GIÁO TRÌNH</span>
          </div>
          <span class="text-[11px] font-semibold text-emerald-700 whitespace-nowrap hidden sm:inline">VietQR tự động</span>
        </div>
        <h3 class="text-sm sm:text-base font-extrabold text-slate-900 leading-snug">Đang mở đăng ký mua giáo trình đợt này</h3>
        <p class="text-xs text-slate-600 mt-1 leading-relaxed">Lọc theo <strong>Khoa</strong> hoặc <strong>Lớp</strong>, chọn nhiều cuốn khác nhau, nhập đúng họ tên và quét mã QR chuyển khoản — hệ thống tự động ghi nhận vào danh sách.</p>
      </div>
    `;
  } else {
    container.innerHTML = `
      <div class="bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border-2 border-amber-300 rounded-2xl p-3.5 sm:p-4 shadow-sm">
        <div class="flex items-center justify-between gap-2 mb-2">
          <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-200 text-amber-900 text-[11px] font-black tracking-wide flex-shrink-0">
            <i data-lucide="lock" class="w-3 h-3 flex-shrink-0"></i>
            <span class="whitespace-nowrap">ĐÃ CHỐT SỔ ĐĂNG KÝ</span>
          </div>
          <span class="text-[11px] font-semibold text-amber-700 whitespace-nowrap">Tạm ngưng nhận đơn</span>
        </div>
        <h3 class="text-sm sm:text-base font-extrabold text-amber-950 leading-snug">Đã chốt danh sách mua giáo trình đợt này</h3>
        <p class="text-xs text-amber-800 mt-1 leading-relaxed">${escapeHtml(currentSettings.closeMessage || 'Tạm dừng nhận đơn để chuẩn bị giáo trình mang lên lớp cho các bạn.')}</p>
      </div>
    `;
  }
  lucide.createIcons();
}

/**
 * 3. BỘ LỌC THEO KHOA (CHIPS) — chọn khoa để xem list giáo trình cần thiết
 */
function renderDepartmentChips() {
  const wrap = document.getElementById('departmentChips');
  if (!wrap) return;
  const departments = getAllDepartments();

  const countFor = (dept) => dept === '__ALL__'
    ? allBooks.length
    : allBooks.filter(b => (b.department || 'Đại cương') === dept).length;

  const chip = (value, label) => {
    const active = activeDepartmentFilter === value;
    return `
      <button
        onclick="setDepartmentFilter('${escapeHtml(value).replace(/'/g, "\\'")}')"
        class="flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-extrabold border transition flex items-center space-x-1.5 ${
          active
            ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-600/30'
            : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-400 hover:text-emerald-700'
        }"
      >
        <i data-lucide="${value === '__ALL__' ? 'layout-grid' : 'graduation-cap'}" class="w-3.5 h-3.5"></i>
        <span>${escapeHtml(label)}</span>
        <span class="text-[10px] font-black px-1.5 py-0.5 rounded-full ${active ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}">${countFor(value)}</span>
      </button>
    `;
  };

  wrap.innerHTML = chip('__ALL__', 'Tất cả') + departments.map(d => chip(d, d)).join('');
  lucide.createIcons();
}

function setDepartmentFilter(value) {
  activeDepartmentFilter = value;
  renderDepartmentChips();
  renderBooks();
}

/**
 * 4. BỘ LỌC THEO LỚP (DROPDOWN)
 */
function renderClassFilter() {
  const wrap = document.getElementById('classFilterWrap');
  const select = document.getElementById('classFilterSelect');
  if (!wrap || !select) return;

  const classes = getAllClassNames();
  if (classes.length === 0) {
    wrap.classList.add('hidden');
    wrap.classList.remove('flex');
    return;
  }
  wrap.classList.remove('hidden');
  wrap.classList.add('flex');

  if (!classes.includes(activeClassFilter) && activeClassFilter !== '__ALL__') {
    activeClassFilter = '__ALL__';
  }
  select.innerHTML = `<option value="__ALL__">Tất cả các lớp</option>` +
    classes.map(c => `<option value="${escapeHtml(c)}" ${activeClassFilter === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
}

function setClassFilter(value) {
  activeClassFilter = value;
  renderBooks();
}

/** Gợi ý lớp trong form đăng ký (datalist) */
function populateClassDatalist() {
  const dl = document.getElementById('classListDatalist');
  if (!dl) return;
  dl.innerHTML = getAllClassNames().map(c => `<option value="${escapeHtml(c)}"></option>`).join('');
}

/**
 * 5. RENDER DANH SÁCH GIÁO TRÌNH (ĐÃ LỌC THEO KHOA + LỚP)
 * Tỷ lệ: 1 cột mobile → 2 cột tablet → 3 cột desktop
 */
function getFilteredBooks() {
  return allBooks.filter(b => {
    const okDept = activeDepartmentFilter === '__ALL__' || (b.department || 'Đại cương') === activeDepartmentFilter;
    const okClass = activeClassFilter === '__ALL__' || (b.classes || []).includes(activeClassFilter);
    return okDept && okClass;
  });
}

function renderBooks() {
  const grid = document.getElementById('bookGrid');
  const countEl = document.getElementById('bookCount');
  const filtered = getFilteredBooks();

  countEl.innerText = `${filtered.length}/${allBooks.length} cuốn`;

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full text-center py-10 text-slate-400">
        <div class="text-3xl mb-2">📚</div>
        Chưa có giáo trình nào phù hợp bộ lọc này.
      </div>`;
    return;
  }

  const isClosed = !currentSettings.isRegistrationOpen;

  grid.innerHTML = filtered.map(book => {
    const inCart = cart.find(c => c.bookId === book.id);
    const classesBadges = (book.classes || []).map(c =>
      `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">${escapeHtml(c)}</span>`
    ).join('');

    const coverHtml = book.cover
      ? `<img src="${escapeHtml(book.cover)}" alt="${escapeHtml(book.title)}" onerror="this.style.display='none'"
           class="w-full h-28 object-cover rounded-xl mb-3 border border-slate-100" loading="lazy" />`
      : '';

    const actionButton = isClosed ? `
      <button disabled class="px-3.5 py-2 bg-slate-100 text-slate-400 text-xs font-bold rounded-xl cursor-not-allowed flex items-center space-x-1.5 border border-slate-200">
        <i data-lucide="lock" class="w-3.5 h-3.5"></i><span>Đã chốt sổ</span>
      </button>`
      : inCart ? `
      <button onclick="toggleCartBook('${escapeHtml(book.id)}')"
        class="px-3.5 py-2 bg-emerald-100 hover:bg-rose-50 hover:text-rose-600 text-emerald-700 text-xs font-bold rounded-xl border border-emerald-300 transition flex items-center space-x-1.5">
        <i data-lucide="check" class="w-4 h-4"></i><span>Đã chọn (x${inCart.quantity}) — Bỏ chọn</span>
      </button>`
      : `
      <button onclick="toggleCartBook('${escapeHtml(book.id)}')"
        class="px-3.5 py-2 bg-brand-600 hover:bg-brand-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-sm transition flex items-center space-x-1.5">
        <i data-lucide="plus" class="w-4 h-4"></i><span>Chọn mua</span>
      </button>`;

    return `
      <div class="bg-white rounded-2xl p-4 sm:p-5 border ${inCart ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-slate-200'} hover:shadow-md transition-all flex flex-col justify-between">
        <div>
          ${coverHtml}
          <div class="flex flex-wrap gap-1 mb-2">
            <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              ${escapeHtml(book.department || 'Đại cương')}
            </span>
            ${classesBadges}
          </div>
          <h3 class="font-extrabold text-slate-900 text-base leading-snug">${escapeHtml(book.title)}</h3>
          <p class="text-xs text-slate-500 mt-1.5 line-clamp-2 leading-relaxed">${escapeHtml(book.description || '')}</p>
        </div>

        <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
          <div>
            <div class="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Đơn giá</div>
            <div class="text-base sm:text-lg font-black text-emerald-600 leading-none">${formatMoney(book.price)}</div>
          </div>
          ${actionButton}
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

// ============================ GIỎ HÀNG ĐA CUỐN ============================
function toggleCartBook(bookId) {
  const idx = cart.findIndex(c => c.bookId === bookId);
  if (idx >= 0) {
    cart.splice(idx, 1);
  } else {
    cart.push({ bookId, quantity: 1 });
  }
  renderBooks();
  renderCartUI();
}

function clearCart() {
  if (cart.length > 0 && !confirm("Xóa toàn bộ giỏ giáo trình?")) return;
  cart = [];
  renderBooks();
  renderCartUI();
}

function cartTotalBooks() {
  return cart.reduce((s, c) => s + c.quantity, 0);
}

function cartTotalAmount() {
  return cart.reduce((s, c) => {
    const book = allBooks.find(b => b.id === c.bookId);
    return s + (book ? book.price * c.quantity : 0);
  }, 0);
}

function renderCartUI() {
  const bar = document.getElementById('cartBar');
  const headerBadge = document.getElementById('headerCartBadge');
  const totalBooks = cartTotalBooks();

  if (totalBooks === 0) {
    bar.classList.add('hidden');
    headerBadge.classList.add('hidden');
    return;
  }

  headerBadge.classList.remove('hidden');
  headerBadge.innerText = totalBooks;

  bar.classList.remove('hidden');
  document.getElementById('cartCountBadge').innerText = totalBooks;
  document.getElementById('cartSummaryText').innerText = `${totalBooks} cuốn giáo trình`;
  document.getElementById('cartTotalText').innerText = formatMoney(cartTotalAmount());
  lucide.createIcons();
}

// ============================ MODAL ĐĂNG KÝ MUA ============================
function openCheckoutModal() {
  if (cart.length === 0) {
    alert("Giỏ hàng đang trống. Hãy chọn giáo trình cần mua trước nhé!");
    return;
  }
  if (!currentSettings.isRegistrationOpen) {
    alert(currentSettings.closeMessage || "Đã chốt sổ đăng ký đợt này!");
    return;
  }

  // Nhớ thông tin cũ để lần sau điền nhanh hơn
  const last = JSON.parse(localStorage.getItem('xbook_last_customer') || '{}');
  const nameInput = document.getElementById('formCustomerName');
  const classInput = document.getElementById('formCustomerClass');
  const phoneInput = document.getElementById('formCustomerPhone');
  if (!nameInput.value && last.name) nameInput.value = last.name;
  if (!classInput.value && last.className) classInput.value = last.className;
  if (!phoneInput.value && last.phone) phoneInput.value = last.phone;

  renderCheckoutItems();
  openModal('checkoutModal');
}

function renderCheckoutItems() {
  const list = document.getElementById('checkoutItemsList');
  list.innerHTML = cart.map((c, idx) => {
    const book = allBooks.find(b => b.id === c.bookId);
    if (!book) return '';
    return `
      <div class="flex items-center gap-2.5 bg-slate-50 border border-slate-200 rounded-2xl p-2.5">
        <div class="min-w-0 flex-1">
          <div class="text-xs font-extrabold text-slate-900 truncate">${escapeHtml(book.title)}</div>
          <div class="text-[10px] text-slate-400 font-semibold">${escapeHtml(book.department || 'Đại cương')} · ${formatMoney(book.price)}/cuốn</div>
        </div>
        <div class="flex items-center space-x-1.5 flex-shrink-0">
          <button type="button" onclick="changeCartQuantity(${idx}, -1)" class="w-7 h-7 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold flex items-center justify-center">-</button>
          <span class="w-6 text-center text-sm font-black text-slate-900">${c.quantity}</span>
          <button type="button" onclick="changeCartQuantity(${idx}, 1)" class="w-7 h-7 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold flex items-center justify-center">+</button>
          <button type="button" onclick="removeCartItem(${idx})" class="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition" title="Bỏ cuốn này">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('checkoutTotalBooksLabel').innerText = `Tổng cộng: ${cartTotalBooks()} cuốn`;
  document.getElementById('checkoutTotalDisplay').innerText = formatMoney(cartTotalAmount());
  lucide.createIcons();
}

function changeCartQuantity(index, delta) {
  const item = cart[index];
  if (!item) return;
  item.quantity = Math.max(1, Math.min(50, item.quantity + delta));
  renderCheckoutItems();
  renderCartUI();
  renderBooks();
}

function removeCartItem(index) {
  cart.splice(index, 1);
  if (cart.length === 0) {
    closeModal('checkoutModal');
  } else {
    renderCheckoutItems();
  }
  renderCartUI();
  renderBooks();
}

/**
 * 6. GỌI API TẠO MÃ DYNAMIC VIETQR PAYOS (1 ĐƠN NHIỀU CUỐN)
 */
async function handleCreatePayment(event) {
  event.preventDefault();

  if (cart.length === 0) {
    alert("Giỏ hàng đang trống!");
    return;
  }

  const customerName = document.getElementById('formCustomerName').value.trim();
  const customerClass = document.getElementById('formCustomerClass').value.trim();
  const customerPhone = (document.getElementById('formCustomerPhone')?.value || '').trim();

  // Bắt buộc nhập đầy đủ cả Họ và Tên (tối thiểu 2 từ)
  const nameParts = customerName.split(/\s+/).filter(w => w.length > 0);
  if (nameParts.length < 2) {
    alert("Vui lòng nhập đầy đủ cả Họ và Tên (ví dụ: Nguyễn Văn An)");
    document.getElementById('formCustomerName').focus();
    return;
  }

  // Lưu lại để lần sau điền nhanh
  localStorage.setItem('xbook_last_customer', JSON.stringify({ name: customerName, className: customerClass, phone: customerPhone }));

  const items = cart.map(c => ({ bookId: c.bookId, quantity: c.quantity }));

  const btnSubmit = document.getElementById('btnSubmitOrder');
  btnSubmit.disabled = true;
  btnSubmit.innerHTML = `
    <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
    <span>Đang tạo mã QR VietQR...</span>
  `;

  try {
    const res = await fetch('/api/orders/create-payment-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, customerName, customerClass, customerPhone })
    });

    const result = await res.json();
    if (!result.success) {
      alert("Thông báo: " + result.message);
      return;
    }

    const { orderCode, amount, quantity, bookTitle, qrCode, accountNumber, bin, accountName, description } = result.data;
    activeOrderCode = orderCode;

    // Đặt xong thì làm trống giỏ
    cart = [];
    renderCartUI();
    renderBooks();

    closeModal('checkoutModal');
    showQRPaymentModal({
      orderCode, amount, quantity, bookTitle, customerName,
      qrCode, accountNumber, bin, accountName, description
    });

  } catch (error) {
    alert("Lỗi kết nối máy chủ: " + error.message);
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = `
      <i data-lucide="qr-code" class="w-5 h-5"></i>
      <span>Tạo mã QR chuyển khoản VietQR</span>
    `;
    lucide.createIcons();
  }
}

/**
 * 7. HIỂN THỊ MODAL MÃ DYNAMIC VIETQR & BẮT ĐẦU POLLING
 */
function showQRPaymentModal(data) {
  document.getElementById('paymentPendingView').classList.remove('hidden');
  document.getElementById('paymentSuccessView').classList.add('hidden');

  document.getElementById('qrAmountDisplay').innerText = formatMoney(data.amount);
  document.getElementById('qrDescriptionDisplay').innerText = data.description;
  document.getElementById('qrAccountDisplay').innerText = `${data.accountNumber} (${getBankName(data.bin)})`;
  document.getElementById('qrAccountNameDisplay').innerText = data.accountName;

  const qrImgUrl = `https://img.vietqr.io/image/${data.bin}-${data.accountNumber}-compact2.png?amount=${data.amount}&addInfo=${encodeURIComponent(data.description)}&accountName=${encodeURIComponent(data.accountName)}`;
  document.getElementById('qrImageElement').src = qrImgUrl;

  openModal('qrPaymentModal');
  startOrderPolling(data.orderCode);
}

function getBankName(bin) {
  if (bin === '970422') return 'MBBank';
  if (bin === '970415') return 'VietinBank';
  if (bin === '970436') return 'Vietcombank';
  return 'Ngân hàng';
}

/**
 * 8. POLLING KIỂM TRA ĐƠN HÀNG THỜI GIAN THỰC
 */
function startOrderPolling(orderCode) {
  if (orderPollingInterval) clearInterval(orderPollingInterval);

  orderPollingInterval = setInterval(async () => {
    try {
      const res = await fetch(`/api/orders/${orderCode}`);
      const result = await res.json();
      if (result.success && result.data.status === 'PAID') {
        clearInterval(orderPollingInterval);
        handlePaymentSuccess(result.data);
      }
    } catch (e) {
      console.warn("Polling:", e);
    }
  }, 2000);
}

function handlePaymentSuccess(data) {
  document.getElementById('paymentPendingView').classList.add('hidden');
  document.getElementById('paymentSuccessView').classList.remove('hidden');

  document.getElementById('successCustomerName').innerText = data.customerName;
  document.getElementById('successBookTitle').innerText = data.bookTitle;
  document.getElementById('successQuantity').innerText = `${data.quantity || 1} cuốn`;
  document.getElementById('successOrderCode').innerText = `#${data.orderCode}`;

  lucide.createIcons();
}

// ============================ BẢNG QUẢN TRỊ ============================
let adminAuthPassword = sessionStorage.getItem('xbook_admin_pwd') || '';

function handleClickAdmin() {
  if (adminAuthPassword) {
    openModal('adminModal');
    refreshAdminData();
  } else {
    document.getElementById('adminPasswordInput').value = '';
    document.getElementById('adminLoginError').classList.add('hidden');
    openModal('adminLoginModal');
    setTimeout(() => document.getElementById('adminPasswordInput').focus(), 150);
  }
}

async function handleAdminLogin(event) {
  event.preventDefault();
  const inputPwd = document.getElementById('adminPasswordInput').value.trim();
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
      adminAuthPassword = inputPwd;
      sessionStorage.setItem('xbook_admin_pwd', inputPwd);
      closeModal('adminLoginModal');
      openModal('adminModal');
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
  adminAuthPassword = '';
  sessionStorage.removeItem('xbook_admin_pwd');
  closeModal('adminModal');
  alert("🔒 Đã khóa lại Bảng Quản Trị!");
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
 */
async function refreshAdminData() {
  try {
    const res = await fetch('/api/admin/statistics', {
      headers: { 'x-admin-password': adminAuthPassword }
    });

    if (res.status === 401) {
      adminAuthPassword = '';
      sessionStorage.removeItem('xbook_admin_pwd');
      closeModal('adminModal');
      openModal('adminLoginModal');
      return;
    }

    const result = await res.json();
    if (!result.success) return;

    const stats = result.data;
    currentSettings = { ...currentSettings, ...(stats.settings || {}) };

    // Đồng bộ lại danh mục sách mới nhất (phục vụ tab quản lý & theo khoa)
    try {
      const booksRes = await fetch('/api/books');
      const booksData = await booksRes.json();
      if (booksData.success) {
        allBooks = booksData.books || [];
        currentSettings = { ...currentSettings, ...(booksData.settings || {}) };
      }
    } catch (e) { /* giữ dữ liệu cũ */ }

    window.currentAdminStats = stats;

    // Nút bật/tắt chốt sổ
    const btnToggle = document.getElementById('btnToggleRegistration');
    if (stats.settings.isRegistrationOpen) {
      btnToggle.className = 'w-full py-2.5 px-4 rounded-xl text-xs font-black transition flex items-center justify-center space-x-2 shadow-sm bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300';
      btnToggle.innerHTML = `<i data-lucide="lock" class="w-4 h-4"></i><span>Bấm để ĐÓNG / CHỐT SỔ ĐĂNG KÝ</span>`;
    } else {
      btnToggle.className = 'w-full py-2.5 px-4 rounded-xl text-xs font-black transition flex items-center justify-center space-x-2 shadow-sm bg-emerald-600 hover:bg-emerald-700 text-white';
      btnToggle.innerHTML = `<i data-lucide="unlock" class="w-4 h-4"></i><span>Bấm để MỞ LẠI ĐĂNG KÝ</span>`;
    }

    const revEl = document.getElementById('adminTotalRevenue');
    if (revEl) revEl.innerText = `Tổng tiền: ${formatMoney(stats.totalRevenue)}`;

    const paidCountEl = document.getElementById('adminPaidCount');
    if (paidCountEl) paidCountEl.innerText = `${stats.paidOrdersCount} đơn đã nộp (${stats.totalBooksPaid} cuốn)`;

    const paidOrders = (stats.allOrders || []).filter(o => o.status === 'PAID');
    paidOrders.sort((a, b) => compareByLastName(a.customerName, b.customerName));
    window.cachedPaidOrders = paidOrders;

    // Render toàn bộ các tab
    renderAdminBookSummary(stats);
    populateAdminClassFilter(paidOrders);
    renderAdminOrderList();
    renderAdminCustomerTab(paidOrders);
    renderAdminClassTab(paidOrders);
    renderAdminDepartmentTab(stats);
    renderAdminManageTab();

    lucide.createIcons();
  } catch (err) {
    console.error("Lỗi admin:", err);
  }
}

/** TAB ĐƠN HÀNG — tổng hợp số cuốn nhóm theo KHOA */
function renderAdminBookSummary(stats) {
  const container = document.getElementById('adminBookSummaryCards');
  if (!container) return;

  const departments = [...new Set((stats.bookSummary || []).map(b => b.department || 'Đại cương'))];

  if (departments.length === 0) {
    container.innerHTML = `<div class="text-xs text-slate-400 text-center py-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200">Chưa có dữ liệu</div>`;
    return;
  }

  container.innerHTML = departments.map(dept => {
    const booksInDept = (stats.bookSummary || []).filter(b => (b.department || 'Đại cương') === dept);
    return `
      <div>
        <div class="flex items-center space-x-1.5 mb-1.5">
          <i data-lucide="graduation-cap" class="w-3.5 h-3.5 text-emerald-600"></i>
          <span class="text-[11px] font-black text-slate-700 uppercase tracking-wide">${escapeHtml(dept)}</span>
          <span class="text-[10px] text-slate-400 font-semibold">(${booksInDept.length} cuốn)</span>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5 sm:gap-2.5">
          ${booksInDept.map(b => `
            <div class="bg-slate-50 border border-slate-200 p-2 sm:p-2.5 rounded-2xl text-center shadow-sm">
              <div class="text-[10px] sm:text-[11px] text-slate-700 font-extrabold truncate" title="${escapeHtml(b.title)}">${escapeHtml(b.title)}</div>
              <div class="text-base sm:text-2xl font-black text-emerald-600 my-0.5">${b.totalQuantity} <span class="text-[10px] sm:text-xs text-slate-400 font-normal">cuốn</span></div>
              <div class="text-[9px] sm:text-[10px] text-slate-400 font-semibold">${formatMoney(b.totalRevenue)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
  lucide.createIcons();
}

/** Dropdown lọc danh sách phát sách theo lớp (trong tab Đơn hàng) */
function populateAdminClassFilter(paidOrders) {
  const select = document.getElementById('adminClassFilterSelect');
  if (!select) return;
  const classes = [...new Set(paidOrders.map(o => (o.customerClass || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
  if (adminClassFilterValue !== '__ALL__' && !classes.includes(adminClassFilterValue)) {
    adminClassFilterValue = '__ALL__';
  }
  select.innerHTML = `<option value="__ALL__">Mọi lớp</option>` +
    classes.map(c => `<option value="${escapeHtml(c)}" ${adminClassFilterValue === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
}

function setAdminClassFilter(value) {
  adminClassFilterValue = value;
  renderAdminOrderList();
}

function getFilteredPaidOrders() {
  const keyword = (document.getElementById('adminSearchStudentInput')?.value || '').toLowerCase().trim();
  return (window.cachedPaidOrders || []).filter(o => {
    const okClass = adminClassFilterValue === '__ALL__' || (o.customerClass || '').trim() === adminClassFilterValue;
    const okSearch = !keyword ||
      (o.customerName || '').toLowerCase().includes(keyword) ||
      (o.customerClass || '').toLowerCase().includes(keyword) ||
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
      tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-400">Không tìm thấy bạn nào</td></tr>`;
    } else {
      tbody.innerHTML = orders.map((o, index) => {
        const deliveredClass = o.isDelivered ? 'line-through text-slate-400' : 'text-slate-900';
        return `
          <tr class="hover:bg-slate-50 transition border-b border-slate-100">
            <td class="p-2.5 text-center font-bold text-slate-400 text-xs">${index + 1}</td>
            <td class="p-2.5 font-extrabold text-sm ${deliveredClass}">
              ${escapeHtml(o.customerName)}
              ${o.customerPhone ? `<div class="text-[10px] text-slate-400 font-normal">SĐT: ${escapeHtml(o.customerPhone)}</div>` : ''}
            </td>
            <td class="p-2.5 text-xs font-bold text-slate-600">${o.customerClass ? escapeHtml(o.customerClass) : '<span class="text-slate-300">—</span>'}</td>
            <td class="p-2.5 font-medium text-xs max-w-xs">
              ${escapeHtml(orderItemsLabel(o))}
              ${orderDepartments(o).map(d => `<span class="ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 align-middle">${escapeHtml(d)}</span>`).join('')}
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
                <div class="font-extrabold text-sm ${nameClass} truncate">${escapeHtml(o.customerName)}</div>
                ${o.customerClass ? `<div class="text-[10px] font-bold text-sky-600 mt-0.5">${escapeHtml(o.customerClass)}</div>` : ''}
                <div class="text-[11px] text-slate-500 mt-0.5">${escapeHtml(orderItemsLabel(o))}</div>
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
        customerClass: o.customerClass || '',
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
    const key = (o.customerClass || '').trim() || 'Chưa khai báo lớp';
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
                <span class="text-xs font-extrabold text-slate-900">${escapeHtml(o.customerName)}</span>
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
  const countEl = document.getElementById('adminDepartmentCount');
  if (!container) return;

  const departments = getAllDepartments();
  if (countEl) countEl.innerText = `${departments.length} khoa`;

  const summaryById = {};
  (stats.bookSummary || []).forEach(b => { summaryById[b.id] = b; });

  container.innerHTML = departments.map(dept => {
    const booksInDept = allBooks.filter(b => (b.department || 'Đại cương') === dept);
    const deptBooks = booksInDept.length > 0 ? booksInDept : [];
    const deptOrdered = deptBooks.reduce((s, b) => s + ((summaryById[b.id]?.totalQuantity) || 0), 0);
    const deptRevenue = deptBooks.reduce((s, b) => s + ((summaryById[b.id]?.totalRevenue) || 0), 0);

    return `
      <div class="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div class="flex items-center justify-between gap-2 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-100 px-3.5 py-2.5">
          <div class="flex items-center space-x-2 min-w-0">
            <i data-lucide="graduation-cap" class="w-4 h-4 text-emerald-700 flex-shrink-0"></i>
            <span class="font-black text-sm text-slate-900 truncate">${escapeHtml(dept)}</span>
            <span class="text-[10px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full whitespace-nowrap">${deptBooks.length} giáo trình</span>
          </div>
          <div class="text-[10px] font-bold text-slate-500 whitespace-nowrap">
            Đã đặt: <span class="text-emerald-700">${deptOrdered} cuốn</span> · ${formatMoney(deptRevenue)}
          </div>
        </div>

        ${deptBooks.length === 0 ? `
          <div class="p-4 text-center text-xs text-slate-400">Chưa có giáo trình nào thuộc khoa này — thêm trong tab "Quản lý giáo trình".</div>
        ` : `
        <div class="divide-y divide-slate-100">
          ${deptBooks.map((b, i) => {
            const s = summaryById[b.id];
            return `
              <div class="flex items-center justify-between gap-2 px-3.5 py-2.5">
                <div class="min-w-0">
                  <div class="text-xs font-extrabold text-slate-900">${i + 1}. ${escapeHtml(b.title)}</div>
                  <div class="text-[10px] text-slate-400 font-semibold">
                    ${formatMoney(b.price)}/cuốn
                    ${(b.classes || []).length ? ` · Lớp: ${b.classes.map(escapeHtml).join(', ')}` : ''}
                  </div>
                </div>
                <div class="flex-shrink-0 text-right">
                  <div class="text-sm font-black ${s && s.totalQuantity > 0 ? 'text-emerald-600' : 'text-slate-300'}">${s?.totalQuantity || 0} cuốn</div>
                  <div class="text-[9px] text-slate-400 font-semibold">${formatMoney(s?.totalRevenue || 0)}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>`}
      </div>
    `;
  }).join('');
  lucide.createIcons();
}

/** TAB QUẢN LÝ — danh mục giáo trình + danh sách khoa/lớp */
function renderAdminManageTab() {
  // 1. Bảng giáo trình
  const tbody = document.getElementById('adminBooksTableBody');
  const mobileList = document.getElementById('adminBooksMobileList');

  const rows = allBooks.map(b => {
    const classesText = (b.classes || []).length ? b.classes.map(escapeHtml).join(', ') : '<span class="text-slate-300">—</span>';
    return { b, classesText };
  });

  if (tbody) {
    tbody.innerHTML = rows.length === 0
      ? `<tr><td colspan="5" class="p-4 text-center text-slate-400">Chưa có giáo trình nào</td></tr>`
      : rows.map(({ b, classesText }) => `
        <tr class="hover:bg-slate-50 transition">
          <td class="p-2.5">
            <div class="font-extrabold text-slate-900">${escapeHtml(b.title)}</div>
            <div class="text-[10px] text-slate-400">${escapeHtml(b.author || '')} ${b.pages ? `· ${b.pages} trang` : ''}</div>
          </td>
          <td class="p-2.5">
            <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">${escapeHtml(b.department || 'Đại cương')}</span>
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
      ? `<div class="p-4 text-center text-xs text-slate-400">Chưa có giáo trình nào</div>`
      : rows.map(({ b }) => `
        <div class="p-3 flex items-center justify-between gap-2">
          <div class="min-w-0">
            <div class="text-xs font-extrabold text-slate-900 truncate">${escapeHtml(b.title)}</div>
            <div class="text-[10px] text-slate-400 mt-0.5">
              <span class="font-bold text-emerald-600">${escapeHtml(b.department || 'Đại cương')}</span>
              ${(b.classes || []).length ? ` · ${b.classes.map(escapeHtml).join(', ')}` : ''}
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

  // 2. Chips danh sách Khoa & Lớp
  renderSettingsChips();

  // 3. Datalist khoa trong form giáo trình
  const dl = document.getElementById('deptDatalist');
  if (dl) dl.innerHTML = getAllDepartments().map(d => `<option value="${escapeHtml(d)}"></option>`).join('');

  lucide.createIcons();
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

  const classes = currentSettings.classes || [];
  classWrap.innerHTML = classes.length
    ? classes.map(c => chipHtml(c, 'class')).join('')
    : `<span class="text-[11px] text-slate-400">Chưa có lớp nào — hãy bổ sung tên lớp tại đây</span>`;

  lucide.createIcons();
}

/** Gửi settings mới (khoa / lớp) lên server */
async function saveSettingsPatch(patch) {
  const res = await fetch('/api/admin/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-admin-password': adminAuthPassword },
    body: JSON.stringify(patch)
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Không lưu được cài đặt');
  currentSettings = { ...currentSettings, ...data.settings };
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
    renderDepartmentChips();
    renderAdminManageTab();
  } catch (e) { alert("Lỗi: " + e.message); }
}

async function handleRemoveChip(type, name) {
  try {
    if (type === 'dept') {
      await saveSettingsPatch({ departments: (currentSettings.departments || []).filter(d => d !== name) });
    } else {
      await saveSettingsPatch({ classes: (currentSettings.classes || []).filter(c => c !== name) });
    }
    renderSettingsChips();
    renderDepartmentChips();
    renderClassFilter();
    populateClassDatalist();
    renderAdminManageTab();
  } catch (e) { alert("Lỗi: " + e.message); }
}

async function handleAddClass(event) {
  event.preventDefault();
  const input = document.getElementById('addClassInput');
  const name = input.value.trim();
  if (!name) return;
  const classes = [...new Set([...(currentSettings.classes || []), name])];
  try {
    await saveSettingsPatch({ classes });
    input.value = '';
    renderSettingsChips();
    renderClassFilter();
    populateClassDatalist();
  } catch (e) { alert("Lỗi: " + e.message); }
}

// ============================ CRUD GIÁO TRÌNH ============================
function openBookForm(bookId) {
  const form = document.getElementById('bookForm');
  form.reset();
  document.getElementById('formBookEditId').value = '';

  const heading = document.getElementById('bookFormHeading');
  if (bookId) {
    const book = allBooks.find(b => b.id === bookId);
    if (!book) return;
    heading.innerText = 'Sửa giáo trình';
    document.getElementById('formBookEditId').value = book.id;
    document.getElementById('formBookTitle').value = book.title;
    document.getElementById('formBookPrice').value = book.price;
    document.getElementById('formBookPages').value = book.pages || '';
    document.getElementById('formBookDepartment').value = book.department || '';
    document.getElementById('formBookClasses').value = (book.classes || []).join(', ');
    document.getElementById('formBookAuthor').value = book.author || '';
    document.getElementById('formBookCover').value = book.cover || '';
    document.getElementById('formBookDescription').value = book.description || '';
  } else {
    heading.innerText = 'Thêm giáo trình mới';
  }

  renderAdminManageTab(); // cập nhật datalist khoa
  openModal('bookFormModal');
}

async function handleBookFormSubmit(event) {
  event.preventDefault();
  const editId = document.getElementById('formBookEditId').value;
  const payload = {
    title: document.getElementById('formBookTitle').value.trim(),
    price: Number(document.getElementById('formBookPrice').value) || 0,
    pages: Number(document.getElementById('formBookPages').value) || 0,
    department: document.getElementById('formBookDepartment').value.trim(),
    classes: document.getElementById('formBookClasses').value,
    author: document.getElementById('formBookAuthor').value.trim(),
    cover: document.getElementById('formBookCover').value.trim(),
    description: document.getElementById('formBookDescription').value.trim()
  };

  const btn = document.getElementById('btnBookFormSubmit');
  btn.disabled = true;

  try {
    const res = await fetch(editId ? `/api/admin/books/${encodeURIComponent(editId)}` : '/api/admin/books', {
      method: editId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': adminAuthPassword },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!data.success) {
      alert("Không lưu được: " + data.message);
      return;
    }
    closeModal('bookFormModal');
    await refreshCatalogEverywhere();
    if (window.currentAdminStats) await refreshAdminData();
  } catch (e) {
    alert("Lỗi kết nối: " + e.message);
  } finally {
    btn.disabled = false;
  }
}

async function handleDeleteBook(bookId, bookTitle) {
  if (!confirm(`Xóa giáo trình "${bookTitle}" khỏi danh mục?`)) return;
  try {
    const res = await fetch(`/api/admin/books/${encodeURIComponent(bookId)}`, {
      method: 'DELETE',
      headers: { 'x-admin-password': adminAuthPassword }
    });
    const data = await res.json();
    if (!data.success) {
      alert("Không xóa được: " + data.message);
      return;
    }
    await refreshCatalogEverywhere();
    if (window.currentAdminStats) await refreshAdminData();
  } catch (e) {
    alert("Lỗi kết nối: " + e.message);
  }
}

/** Tải lại danh mục sách + settings, đồng bộ trang chủ & bảng quản trị */
async function refreshCatalogEverywhere() {
  try {
    const res = await fetch('/api/books');
    const data = await res.json();
    if (data.success) {
      allBooks = data.books || [];
      currentSettings = { ...currentSettings, ...(data.settings || {}) };
      renderRegistrationBanner();
      renderDepartmentChips();
      renderClassFilter();
      renderBooks();
      populateClassDatalist();
    }
  } catch (e) {
    console.error("Lỗi tải lại danh mục:", e);
  }
}

// ============================ THAO TÁC CHUNG ============================
async function handleToggleRegistration() {
  try {
    const res = await fetch('/api/admin/toggle-registration', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': adminAuthPassword
      }
    });
    if (res.status === 401) {
      handleClickAdmin();
      return;
    }
    const data = await res.json();
    if (data.success) {
      currentSettings = { ...currentSettings, ...data.settings };
      renderRegistrationBanner();
      renderBooks();
      await refreshAdminData();
    }
  } catch (e) {
    alert("Lỗi khi đổi trạng thái: " + e.message);
  }
}

async function toggleDelivered(orderCode) {
  try {
    await fetch('/api/admin/toggle-delivered', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': adminAuthPassword
      },
      body: JSON.stringify({ orderCode })
    });
    await refreshAdminData();
  } catch (e) {
    console.error("Lỗi toggle phát sách:", e);
  }
}

// ============================ UTILS ============================
function openModal(id) {
  const modal = document.getElementById(id);
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  if (id === 'qrPaymentModal' && orderPollingInterval) {
    clearInterval(orderPollingInterval);
  }
}

function copyToClipboard(elementId) {
  const text = document.getElementById(elementId).innerText;
  navigator.clipboard.writeText(text).then(() => {
    alert(`Đã copy: "${text}"`);
  });
}

// ============================ XUẤT EXCEL (.XLSX) ============================
async function exportToExcel() {
  try {
    if (!adminAuthPassword) {
      openModal('adminLoginModal');
      return;
    }

    if (typeof XLSX === 'undefined') {
      alert("Đang tải thư viện xử lý Excel, vui lòng thử lại sau vài giây...");
      return;
    }

    let stats = window.currentAdminStats;
    if (!stats) {
      const res = await fetch('/api/admin/statistics', {
        headers: { 'x-admin-password': adminAuthPassword }
      });
      const result = await res.json();
      if (!result.success) {
        alert("Không thể tải dữ liệu để xuất Excel!");
        return;
      }
      stats = result.data;
      window.currentAdminStats = stats;
    }

    const paidOrders = (stats.allOrders || []).filter(o => o.status === 'PAID');
    paidOrders.sort((a, b) => compareByLastName(a.customerName, b.customerName));

    const wb = XLSX.utils.book_new();
    const exportTime = new Date().toLocaleString('vi-VN');

    // ========== SHEET 1: DANH SÁCH PHÁT SÁCH (ĐÃ THANH TOÁN) ==========
    const sheet1Rows = [
      ["DANH SÁCH SINH VIÊN ĐĂNG KÝ VÀ ĐÃ THANH TOÁN MUA GIÁO TRÌNH"],
      [`Thời gian xuất: ${exportTime} | Tổng số đơn: ${paidOrders.length} | Tổng tiền: ${formatMoney(stats.totalRevenue)}`],
      [],
      [
        "STT", "Mã Đơn", "Họ và Tên", "Lớp", "Khoa (theo giáo trình)", "Số Điện Thoại",
        "Giáo Trình Đã Mua", "Tổng Số Cuốn", "Thành Tiền (đ)",
        "Tình Trạng Phát Sách", "Ngày Nộp Tiền", "Ghi Chú / Mã GD"
      ]
    ];

    paidOrders.forEach((o, idx) => {
      const depts = orderDepartments(o);
      sheet1Rows.push([
        idx + 1,
        `XB${o.orderCode}`,
        o.customerName || '',
        o.customerClass || '',
        depts.join(', '),
        o.customerPhone || '',
        orderItemsLabel(o),
        orderBookCount(o),
        Number(o.amount) || 0,
        o.isDelivered ? "Đã nhận sách" : "Chưa nhận",
        o.paidAt ? new Date(o.paidAt).toLocaleString('vi-VN') : '',
        o.bankReference || o.note || ''
      ]);
    });

    sheet1Rows.push([]);
    sheet1Rows.push([
      "TỔNG CỘNG", "", `${paidOrders.length} đơn`, "", "", "", "",
      stats.totalBooksPaid || paidOrders.reduce((sum, o) => sum + orderBookCount(o), 0),
      stats.totalRevenue || paidOrders.reduce((sum, o) => sum + o.amount, 0),
      `${paidOrders.filter(o => o.isDelivered).length} đã nhận`, "", ""
    ]);

    const ws1 = XLSX.utils.aoa_to_sheet(sheet1Rows);
    ws1['!cols'] = [
      { wch: 6 }, { wch: 14 }, { wch: 25 }, { wch: 14 }, { wch: 22 }, { wch: 14 },
      { wch: 45 }, { wch: 12 }, { wch: 15 }, { wch: 18 }, { wch: 20 }, { wch: 22 }
    ];
    if (paidOrders.length > 0) ws1['!autofilter'] = { ref: `A4:L${4 + paidOrders.length}` };
    XLSX.utils.book_append_sheet(wb, ws1, "Danh Sách Phát Sách");

    // ========== SHEET 2: TỔNG HỢP BÁO IN THEO KHOA ==========
    const sheet2Rows = [
      ["BẢNG TỔNG HỢP SỐ LƯỢNG GIÁO TRÌNH THEO KHOA (BÁO IN)"],
      [`Thời gian xuất: ${exportTime}`],
      [],
      ["Khoa", "Tên Giáo Trình", "Đơn Giá (đ)", "Tổng Số Cuốn Cần In", "Tổng Doanh Thu (đ)"]
    ];

    const summarySorted = (stats.bookSummary || []).slice().sort((a, b) => {
      const d = (a.department || '').localeCompare(b.department || '', 'vi');
      return d !== 0 ? d : compareByLastName(a.title, b.title);
    });
    summarySorted.forEach(b => {
      sheet2Rows.push([
        b.department || 'Đại cương',
        b.title,
        Number(b.price) || 0,
        Number(b.totalQuantity) || 0,
        Number(b.totalRevenue) || 0
      ]);
    });
    sheet2Rows.push([]);
    sheet2Rows.push(["TỔNG CỘNG", "", "", stats.totalBooksPaid || 0, stats.totalRevenue || 0]);

    const ws2 = XLSX.utils.aoa_to_sheet(sheet2Rows);
    ws2['!cols'] = [{ wch: 18 }, { wch: 38 }, { wch: 15 }, { wch: 22 }, { wch: 20 }];
    if (summarySorted.length > 0) ws2['!autofilter'] = { ref: `A4:E${4 + summarySorted.length}` };
    XLSX.utils.book_append_sheet(wb, ws2, "Tổng Hợp Theo Khoa");

    // ========== SHEET 3: THEO TÊN NGƯỜI MUA (GỘP NHIỀU CUỐN) ==========
    const customerGroups = groupOrdersByCustomer(paidOrders);
    const sheet3Rows = [
      ["THỐNG KÊ THEO TÊN NGƯỜI MUA (1 NGƯỜI MUA NHIỀU CUỐN KHÁC NHAU)"],
      [`Thời gian xuất: ${exportTime} | Tổng số người mua: ${customerGroups.length}`],
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
    const allOrders = stats.allOrders || [];
    if (allOrders.length > 0) {
      const sheet4Rows = [
        ["DANH SÁCH TOÀN BỘ ĐƠN HÀNG (BAO GỒM CHỜ VÀ ĐÃ THANH TOÁN)"],
        [`Thời gian xuất: ${exportTime} | Tổng số đơn: ${allOrders.length}`],
        [],
        [
          "STT", "Mã Đơn", "Họ và Tên", "Lớp", "Số Điện Thoại", "Giáo Trình & Số Lượng",
          "Tổng Số Cuốn", "Thành Tiền (đ)", "Trạng Thái", "Tình Trạng Phát",
          "Thời Gian Tạo Đơn", "Thời Gian Thanh Toán"
        ]
      ];

      allOrders.forEach((o, idx) => {
        sheet4Rows.push([
          idx + 1,
          `XB${o.orderCode}`,
          o.customerName || '',
          o.customerClass || '',
          o.customerPhone || '',
          orderItemsLabel(o),
          orderBookCount(o),
          Number(o.amount) || 0,
          o.status === 'PAID' ? 'Đã thanh toán' : 'Chờ thanh toán (PENDING)',
          o.isDelivered ? 'Đã phát' : 'Chưa phát',
          o.createdAt ? new Date(o.createdAt).toLocaleString('vi-VN') : '',
          o.paidAt ? new Date(o.paidAt).toLocaleString('vi-VN') : ''
        ]);
      });

      const ws4 = XLSX.utils.aoa_to_sheet(sheet4Rows);
      ws4['!cols'] = [
        { wch: 6 }, { wch: 14 }, { wch: 25 }, { wch: 14 }, { wch: 14 }, { wch: 45 },
        { wch: 12 }, { wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 20 }, { wch: 20 }
      ];
      ws4['!autofilter'] = { ref: `A4:L${4 + allOrders.length}` };
      XLSX.utils.book_append_sheet(wb, ws4, "Toàn Bộ Đơn Hàng");
    }

    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const filename = `Danh_Sach_Giao_Trinh_XBook_${dateStr}.xlsx`;

    XLSX.writeFile(wb, filename);

  } catch (error) {
    console.error("Lỗi xuất Excel:", error);
    alert("Có lỗi khi xuất file Excel: " + error.message);
  }
}
