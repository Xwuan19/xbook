/**
 * ============================================================================
 * XBOOK - APP.JS: GIAO DIỆN TRANG CHỦ (/) — SINH VIÊN ĐẶT SÁCH & THANH TOÁN QR
 * ============================================================================
 * - Danh mục sách lọc theo Khoa / Lớp, giỏ hàng nhiều cuốn trong 1 đơn.
 * - Form đăng ký mua (bắt buộc Họ tên + SĐT + Lớp + ngày nhận sách).
 * - Mã Dynamic VietQR PayOS + tự động kiểm tra tiền về (polling).
 * - PWA: gợi ý "Thêm vào Màn hình chính" trên iPhone/iPad.
 * ⚠️ Toàn bộ giao diện QUẢN TRỊ đã tách sang trang riêng /admin.html (admin.js).
 *    File này chạy cùng core.js (tiện ích + dropdown dùng chung).
 * ============================================================================
 */

// ============================ TRẠNG THÁI TRANG CHỦ ============================
let activeOrderCode = null;
let orderPollingInterval = null;

// Giỏ hàng: mỗi phần tử { bookId, quantity } — 1 người mua nhiều cuốn khác nhau
let cart = [];

// Bộ lọc trang chủ
let activeDepartmentFilter = '__ALL__';
let activeClassFilter = '__ALL__';

// Dòng lưu ý ngày nhận sách ngắn gọn cho sinh viên (dùng chung banner + form + màn hình thành công)
function deliveryInfoLine() {
  return '';
}

/** Hiện / ẩn thông báo lỗi ngay dưới ô nhập trong form đặt mua */
function showFieldError(id, message) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerText = message;
  el.classList.remove('hidden');
}

function clearFieldError(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

/** Chuẩn hóa số điện thoại Việt Nam: bỏ khoảng trắng/dấu chấm, +84 → 0 */
function normalizePhoneNumber(value) {
  return String(value || '').replace(/[\s.\-()]/g, '').replace(/^\+?84/, '0');
}

// ============================ KHỞI ĐỘNG TRANG CHỦ ============================
/** Khởi động các phần cần DOM: nạp dữ liệu danh mục + PWA */
function initApp() {
  fetchBooksAndSettings();
  initPwa();
}

document.addEventListener('DOMContentLoaded', initApp);
// Nếu script được nạp SAU khi DOM đã sẵn sàng (defer/async, cache, hoặc chèn muộn) thì chạy ngay
if (document.readyState !== 'loading') initApp();

/** Vẽ lại mọi khối của trang chủ theo danh mục sách + cài đặt mới nhất (core.js gọi) */
function renderStorefrontCatalog() {
  renderRegistrationBanner();
  renderDepartmentChips();
  renderClassFilter();
  renderBooks();
  renderCartUI();
  renderCheckoutClassPicker();
}

// ============================ PWA (CÀI LÊN MÀN HÌNH CHÍNH) ============================
// ============================ PWA (CÀI LÊN MÀN HÌNH CHÍNH) ============================
function initPwa() {
  // Android/Chrome: lưu sự kiện cài đặt nếu trình duyệt phát ra
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    window.xbookInstallPrompt = event;
  });
}

// ============================ DANH MỤC SÁCH TRANG CHỦ ============================
/**
 * 2. BANNER ĐÓNG / MỞ ĐĂNG KÝ
 */
function renderRegistrationBanner() {
  const container = document.getElementById('registrationBannerContainer');
  if (!container) return;

  if (currentSettings.isRegistrationOpen) {
    container.innerHTML = `
      <div class="bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border border-emerald-200/90 rounded-2xl p-3.5 sm:p-4 shadow-sm">
        <div class="flex items-center justify-between gap-2">
          <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100/90 text-emerald-800 text-[11px] font-extrabold tracking-wide flex-shrink-0">
            <span class="relative flex h-2 w-2 flex-shrink-0">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
            </span>
            <span class="whitespace-nowrap">ĐANG MỞ NHẬN ĐƠN</span>
          </div>
        </div>
        <p class="text-xs text-slate-600 mt-1.5 leading-relaxed">Chọn sách, nhập đúng họ tên và quét QR chuyển khoản — hệ thống tự ghi nhận vào danh sách.</p>
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
        <h3 class="text-sm sm:text-base font-extrabold text-amber-950 leading-snug">Đã chốt danh sách mua sách đợt này</h3>
        <p class="text-xs text-amber-800 mt-1 leading-relaxed">${escapeHtml(currentSettings.closeMessage || 'Tạm dừng nhận đơn để chuẩn bị sách mang lên lớp cho các bạn.')}</p>
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
    : XBookDomain.filterBooks(allBooks, currentSettings, dept).length;

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
  activeClassFilter = '__ALL__';
  renderClassFilter();
  renderDepartmentChips();
  renderBooks();
}

/**
 * 4. BỘ LỌC THEO LỚP (DROPDOWN)

/**
 * 4. BỘ LỌC THEO LỚP (DROPDOWN)
 */
function renderClassFilter() {
  const wrap = document.getElementById('classFilterWrap');
  if (!wrap) return;

  const classes = getClassesForDepartment(activeDepartmentFilter);
  wrap.classList.remove('hidden');
  wrap.classList.add('flex');
  if (!classes.some(c => XBookDomain.classKey(c) === activeClassFilter)) activeClassFilter = '__ALL__';

  renderXBookSelect('classFilterSelect', {
    size: 'sm',
    placeholder: classes.length ? 'Chọn lớp để xem sách cần học' : 'Khoa này chưa có lớp',
    value: activeClassFilter,
    onChange: (value) => setClassFilter(value),
    options: [
      { value: '__ALL__', label: 'Tất cả các lớp' },
      ...classes.map(c => ({
        value: XBookDomain.classKey(c),
        label: activeDepartmentFilter === '__ALL__' ? classLabel(c) : c.name,
        group: activeDepartmentFilter === '__ALL__' ? c.department : ''
      }))
    ]
  });
}

function setClassFilter(value) {
  activeClassFilter = value;
  renderBooks();
}

/**
 * Ô chọn LỚP trong form đặt mua — dropdown tự vẽ đồng bộ giao diện web.
 * Lớp là bắt buộc: danh sách lấy từ khoa/lớp do quản trị khai báo, không dùng list mặc định của trình duyệt.

/**
 * Ô chọn LỚP trong form đặt mua — dropdown tự vẽ đồng bộ giao diện web.
 * Lớp là bắt buộc: danh sách lấy từ khoa/lớp do quản trị khai báo, không dùng list mặc định của trình duyệt.
 */
function renderCheckoutClassPicker() {
  const classes = catalogClasses();
  renderXBookSelect('formCustomerClass', {
    size: 'lg',
    placeholder: classes.length ? 'Chọn lớp của bạn' : 'Chưa có lớp nào',
    options: classes.map(c => ({ value: XBookDomain.classKey(c), label: classLabel(c), group: c.department })),
    onChange: () => clearFieldError('formCustomerClassError')
  });

  const warning = document.getElementById('checkoutClassWarning');
  if (warning) warning.classList.toggle('hidden', classes.length > 0);

  // Chưa khai báo lớp nào thì chưa thể đặt mua (lớp là thông tin bắt buộc)
  const submitBtn = document.getElementById('btnSubmitOrder');
  if (submitBtn) {
    if (classes.length === 0) {
      submitBtn.disabled = true;
      submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
      submitBtn.disabled = false;
      submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
  }
}

/**
 * 5. RENDER DANH SÁCH GIÁO TRÌNH (ĐÃ LỌC THEO KHOA + LỚP)
 * Tỷ lệ: 2 cột mobile → 2 cột tablet → 3 cột desktop.
 * Card thiết kế theo dạng "bìa sách ở trên, thông tin ở dưới" (dọc) vì trên mobile mỗi cột
 * chỉ còn ~150–170px: mọi phần tử đều `min-w-0` + `truncate`/`line-clamp` để chữ dài
 * (tên sách, tên lớp) không phá vỡ khung lưới, chiều cao 2 card cùng hàng luôn bằng nhau.
 */
function getFilteredBooks() {
  return XBookDomain.filterBooks(allBooks, currentSettings, activeDepartmentFilter, activeClassFilter);
}

/** Dòng phụ nhỏ dưới tên sách: tác giả · số trang · năm (bỏ trống phần không có) */
function bookMetaLine(book) {
  const pages = Number(book.pages);
  return [book.author, pages > 0 ? `${pages} trang` : '', book.year]
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .join(' · ');
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
        Chưa có sách nào phù hợp bộ lọc này.
      </div>`;
    return;
  }

  grid.innerHTML = filtered.map(book => bookCardHtml(book)).join('');

  lucide.createIcons();
}

/**
 * Vẽ lại ĐÚNG 1 card khi trạng thái giỏ hàng của cuốn đó đổi.
 * Card 2 cột trên mobile có ảnh bìa khá to: vẽ lại cả lưới sẽ tạo mới toàn bộ thẻ <img>
 * (nạp + giải mã lại ảnh) làm màn hình chớp trắng mỗi lần bấm "Chọn mua".
 * Không tìm thấy card (đang ở trạng thái rỗng / lọc khác) thì quay về vẽ cả lưới.
 */
function refreshBookCard(bookId) {
  const grid = document.getElementById('bookGrid');
  if (!grid) return;

  const book = allBooks.find(b => b.id === bookId);
  const current = [...grid.querySelectorAll('[data-book-id]')].find(el => el.dataset.bookId === bookId);
  if (!book || !current) { renderBooks(); return; }

  const holder = document.createElement('div');
  holder.innerHTML = bookCardHtml(book);
  const fresh = holder.firstElementChild;
  if (!fresh) { renderBooks(); return; }

  current.replaceWith(fresh);
  lucide.createIcons();
}

/**
 * HTML của MỘT card sách (dùng chung cho cả lưới lẫn vẽ lại 1 card).
 * Dạng dọc: bìa tỷ lệ 3:4 chiếm trọn chiều ngang → tên sách → thông tin phụ → giá → nút.
 */
function bookCardHtml(book) {
  const isClosed = !currentSettings.isRegistrationOpen;
  const inCart = cart.find(c => c.bookId === book.id);

  // Sách KHÔNG "thuộc" khoa/lớp nào — bộ lọc Khoa/Lớp ở đầu trang mới là thứ dẫn khách
  // tới giáo trình của lớp mình học, nên card không dán nhãn khoa/lớp nữa.
  // Đã có trong giỏ: huy hiệu số lượng ở góc phải ảnh bìa (nền xanh nổi bật trên ảnh)
  const selectedChip = inCart ? `
        <span class="pointer-events-none absolute right-1.5 top-1.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center gap-0.5 rounded-full bg-emerald-600 px-1.5 text-[10px] font-black text-white shadow-md">
          <i data-lucide="check" class="h-3 w-3 flex-shrink-0 stroke-[3]"></i>${inCart.quantity > 1 ? `<span>x${inCart.quantity}</span>` : ''}
        </span>` : '';

  // Ảnh bìa chiếm trọn chiều ngang card, tỷ lệ 3:4 (chuẩn bìa sách) nên 2 cột đều tăm tắp.
  // Không có ảnh (hoặc ảnh lỗi) thì tự đổi sang khối placeholder có tên sách.
  const coverHtml = book.cover
    ? `<img src="${escapeHtml(book.cover)}" alt="Ảnh bìa ${escapeHtml(book.title)}" loading="lazy" decoding="async"
           onerror="this.style.display='none';this.nextElementSibling.classList.remove('hidden')"
           class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />`
    : '';

  const coverFallback = `
        <div class="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-slate-100 to-slate-200 p-3 text-center ${book.cover ? 'hidden' : ''}">
          <i data-lucide="book-open" class="h-7 w-7 flex-shrink-0 text-slate-300"></i>
          <span class="line-clamp-2 text-[10px] font-bold leading-snug text-slate-400">${escapeHtml(book.title)}</span>
        </div>`;

  const meta = bookMetaLine(book);

  // Nút luôn full chiều ngang card: ở cột hẹp, nút nhỏ đặt cạnh giá sẽ bị chen chữ / tràn khung.
  // min-h 38px để ngón tay cái bấm trúng trên mobile (chuẩn tap target).
  const buttonBase = 'mt-2 flex min-h-[2.375rem] w-full items-center justify-center rounded-xl px-2 text-[11px] font-bold transition active:scale-[0.98] sm:mt-2.5 sm:text-xs';
  const buttonInner = (icon, label) => `
      <span class="flex items-center justify-center gap-1">
        <i data-lucide="${icon}" class="h-3.5 w-3.5 flex-shrink-0"></i>
        <span class="truncate">${label}</span>
      </span>`;

  const actionButton = isClosed ? `
      <button disabled class="${buttonBase} cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400">${buttonInner('lock', 'Đã chốt sổ')}</button>`
    : inCart ? `
      <button onclick="toggleCartBook('${escapeHtml(book.id)}')" title="Bấm để bỏ khỏi giỏ"
        class="${buttonBase} border border-emerald-300 bg-emerald-100 text-emerald-700 hover:bg-rose-50 hover:text-rose-600">${buttonInner('check', `Đã chọn · x${inCart.quantity}`)}</button>`
    : `
      <button onclick="toggleCartBook('${escapeHtml(book.id)}')"
        class="${buttonBase} bg-brand-600 text-white shadow-sm shadow-brand-500/25 hover:bg-brand-700">${buttonInner('plus', 'Chọn mua')}</button>`;

  return `
    <article data-book-id="${escapeHtml(book.id)}" class="group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-white transition-all hover:shadow-md ${inCart ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-slate-200'}">
      <div class="relative aspect-[3/4] w-full flex-shrink-0 overflow-hidden bg-slate-100">
        ${coverHtml}
        ${coverFallback}
        ${selectedChip}
      </div>

      <div class="flex min-w-0 flex-1 flex-col p-2.5 sm:p-3.5">
        <h3 class="line-clamp-2 break-words text-[13px] font-extrabold leading-snug text-slate-900 sm:text-sm">${escapeHtml(book.title)}</h3>
        ${meta ? `<p class="mt-0.5 line-clamp-1 text-[10px] font-medium text-slate-400 sm:text-[11px]">${escapeHtml(meta)}</p>` : ''}
        <!-- Mô tả chỉ hiện từ tablet trở lên: cột mobile ~150px đọc không nổi, nhường chỗ cho giá + nút -->
        ${book.description ? `<div class="mt-1 hidden min-w-0 sm:block"><p class="line-clamp-2 text-[11px] leading-relaxed text-slate-500">${escapeHtml(book.description)}</p></div>` : ''}

        <div class="mt-auto min-w-0 border-t border-slate-100 pt-2 sm:pt-2.5">
          <div class="flex min-w-0 items-baseline justify-between gap-1.5">
            <span class="hidden flex-shrink-0 text-[9px] font-bold uppercase tracking-wider text-slate-400 sm:block">Đơn giá</span>
            <span class="min-w-0 truncate text-sm font-black leading-none text-emerald-600 sm:text-lg">${formatMoney(book.price)}</span>
          </div>
          ${actionButton}
        </div>
      </div>
    </article>
  `;
}

// ============================ GIỎ HÀNG ĐA CUỐN ============================
function toggleCartBook(bookId) {
  const idx = cart.findIndex(c => c.bookId === bookId);
  if (idx >= 0) {
    cart.splice(idx, 1);
  } else {
    cart.push({ bookId, quantity: 1 });
  }
  refreshBookCard(bookId);
  renderCartUI();
}

function clearCart() {
  if (cart.length > 0 && !confirm("Xóa toàn bộ giỏ sách?")) return;
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
  document.getElementById('cartSummaryText').innerText = `${totalBooks} cuốn sách`;
  document.getElementById('cartTotalText').innerText = formatMoney(cartTotalAmount());
  lucide.createIcons();
}

// ============================ MODAL ĐĂNG KÝ MUA ============================
function openCheckoutModal() {
  if (cart.length === 0) {
    alert("Giỏ hàng đang trống. Hãy chọn sách cần mua trước nhé!");
    return;
  }
  if (!currentSettings.isRegistrationOpen) {
    alert(currentSettings.closeMessage || "Đã chốt sổ đăng ký đợt này!");
    return;
  }

  // Danh sách lớp (dropdown tự vẽ) + trạng thái bắt buộc
  renderCheckoutClassPicker();

  // Nhớ thông tin cũ để lần sau điền nhanh hơn
  let last = {};
  try { last = JSON.parse(localStorage.getItem('xbook_last_customer') || '{}'); } catch (e) { last = {}; }
  const nameInput = document.getElementById('formCustomerName');
  const phoneInput = document.getElementById('formCustomerPhone');
  if (!nameInput.value && last.name) nameInput.value = last.name;
  // Ưu tiên lớp đang lọc ở trang chủ, sau đó tới lớp lần trước đã chọn
  if (activeClassFilter !== '__ALL__') setXBookSelectValue('formCustomerClass', activeClassFilter, { silent: true });
  else if (!xbookSelectValue('formCustomerClass') && last.classKey) setXBookSelectValue('formCustomerClass', last.classKey, { silent: true });
  if (!phoneInput.value && last.phone) phoneInput.value = last.phone;
  clearFieldError('formCustomerNameError');
  clearFieldError('formCustomerPhoneError');
  clearFieldError('formCustomerClassError');

  // Lưu ý ngày nhận sách (ngắn gọn) trong form đăng ký
  const deliveryWrap = document.getElementById('checkoutDeliveryInfo');
  const deliveryText = document.getElementById('checkoutDeliveryText');
  const line = deliveryInfoLine();
  if (deliveryWrap && deliveryText) {
    if (line) {
      deliveryWrap.classList.remove('hidden');
      deliveryWrap.classList.add('flex');
      deliveryText.innerHTML = line;
    } else {
      deliveryWrap.classList.add('hidden');
      deliveryWrap.classList.remove('flex');
    }
  }

  // Khởi tạo ngày khách muốn nhận sách (bắt buộc sau thời điểm đặt 1 ngày)
  const dateInput = document.getElementById('formCustomerDeliveryDate');
  if (dateInput) {
    const tomorrow = new Date(Date.now() + 86400000);
    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const dd = String(tomorrow.getDate()).padStart(2, '0');
    const minDateStr = `${yyyy}-${mm}-${dd}`;
    dateInput.min = minDateStr;
    if (!dateInput.value || dateInput.value < minDateStr) {
      dateInput.value = minDateStr;
    }
  }

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
          <div class="text-[10px] text-slate-400 font-semibold">${formatMoney(book.price)}/cuốn</div>
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
  refreshBookCard(item.bookId);
}

function removeCartItem(index) {
  const [removed] = cart.splice(index, 1);
  if (cart.length === 0) {
    closeModal('checkoutModal');
  } else {
    renderCheckoutItems();
  }
  renderCartUI();
  if (removed) refreshBookCard(removed.bookId);
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

  clearFieldError('formCustomerNameError');
  clearFieldError('formCustomerPhoneError');
  clearFieldError('formCustomerClassError');

  const nameInput = document.getElementById('formCustomerName');
  const phoneInput = document.getElementById('formCustomerPhone');
  const customerName = nameInput.value.trim();
  const selectedClass = catalogClasses().find(c => XBookDomain.classKey(c) === xbookSelectValue('formCustomerClass'));
  const customerClass = selectedClass?.name || '';
  const customerDepartment = selectedClass?.department || '';
  const customerPhone = normalizePhoneNumber(phoneInput?.value);

  // BẮT BUỘC 1: Họ và Tên đầy đủ (tối thiểu 2 từ)
  const nameParts = customerName.split(/\s+/).filter(w => w.length > 0);
  if (nameParts.length < 2) {
    showFieldError('formCustomerNameError', 'Vui lòng nhập đầy đủ cả Họ và Tên (ví dụ: Nguyễn Văn An).');
    nameInput.focus();
    return;
  }

  // BẮT BUỘC 2: Số điện thoại đúng định dạng Việt Nam
  if (!customerPhone) {
    showFieldError('formCustomerPhoneError', 'Vui lòng nhập số điện thoại để liên hệ khi phát sách.');
    phoneInput?.focus();
    return;
  }
  if (!/^0\d{9}$/.test(customerPhone)) {
    showFieldError('formCustomerPhoneError', 'Số điện thoại chưa đúng (10 số, ví dụ: 0987 654 321).');
    phoneInput?.focus();
    return;
  }

  // BẮT BUỘC 3: Lớp học (chọn từ danh sách khoa/lớp của quản trị)
  if (!selectedClass) {
    showFieldError('formCustomerClassError', catalogClasses().length
      ? 'Vui lòng chọn lớp của bạn trong danh sách.'
      : 'Hệ thống chưa mở lớp nào — vui lòng liên hệ quản trị viên để được thêm lớp.');
    return;
  }

  // Khách hàng chọn ngày muốn nhận sách
  const deliveryDateInput = document.getElementById('formCustomerDeliveryDate');
  const deliveryDate = (deliveryDateInput?.value || '').trim();
  if (!deliveryDate) {
    alert("Vui lòng chọn ngày muốn nhận sách!");
    deliveryDateInput?.focus();
    return;
  }
  if (deliveryDateInput?.min && deliveryDate < deliveryDateInput.min) {
    alert("Ngày nhận sách bắt buộc phải sau ngày đặt đơn ít nhất 1 ngày!");
    deliveryDateInput?.focus();
    return;
  }

  // Lưu lại để lần sau điền nhanh (bỏ qua nếu trình duyệt chặn lưu trữ)
  try {
    localStorage.setItem('xbook_last_customer', JSON.stringify({
      name: customerName,
      classKey: selectedClass ? XBookDomain.classKey(selectedClass) : '',
      phone: customerPhone
    }));
  } catch (e) { /* chế độ riêng tư */ }

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
      body: JSON.stringify({ items, customerName, customerClass, customerDepartment, customerPhone, deliveryDate })
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

  document.getElementById('successDeliveryDate').innerText = formatDelivery(data.deliveryAt);

  lucide.createIcons();
}

/** Dừng vòng kiểm tra tiền về (gọi khi đóng modal QR — core.js closeModal) */
function stopOrderPolling() {
  if (orderPollingInterval) {
    clearInterval(orderPollingInterval);
    orderPollingInterval = null;
  }
}
