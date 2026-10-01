/**
 * ============================================================================
 * XBOOK - APP.JS: BÁN SÁCH HỘ CHÚ CHO LỚP VÀ PAYOS DYNAMIC VIETQR
 * ============================================================================
 */

let allBooks = [];
let currentSettings = { isRegistrationOpen: true };
let activeOrderCode = null;
let orderPollingInterval = null;
let selectedBook = null;

document.addEventListener('DOMContentLoaded', () => {
  fetchBooksAndSettings();
});

/**
 * 1. LẤY DANH SÁCH SÁCH & TRẠNG THÁI ĐĂNG KÝ
 */
async function fetchBooksAndSettings() {
  try {
    const res = await fetch('/api/books');
    const data = await res.json();
    if (data.success) {
      allBooks = data.books || [];
      currentSettings = data.settings || { isRegistrationOpen: true };
      
      renderRegistrationBanner();
      renderBooks();
    }
  } catch (error) {
    console.error("Lỗi khi tải dữ liệu sách:", error);
    document.getElementById('bookGrid').innerHTML = `
      <div class="col-span-full text-center py-10 text-rose-500 font-bold text-sm">
        Không thể kết nối đến máy chủ. Vui lòng thử lại sau!
      </div>
    `;
  }
}

/**
 * 2. HIỂN THỊ BANNER ĐÓNG / MỞ ĐĂNG KÝ
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
            <span class="whitespace-nowrap">ĐANG NHẬN ĐƠN MUA SÁCH</span>
          </div>
          <span class="text-[11px] font-semibold text-emerald-700 whitespace-nowrap hidden sm:inline">VietQR tự động</span>
        </div>
        <h3 class="text-sm sm:text-base font-extrabold text-slate-900 leading-snug">Đang mở đăng ký mua sách đợt này</h3>
        <p class="text-xs text-slate-600 mt-1 leading-relaxed">Chọn sách cần mua, nhập đúng họ tên và quét mã QR chuyển khoản chính xác để hệ thống tự động ghi nhận vào danh sách.</p>
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
        <p class="text-xs text-amber-800 mt-1 leading-relaxed">${currentSettings.closeMessage || 'Tạm dừng nhận đơn để chuẩn bị sách mang lên lớp cho các bạn.'}</p>
      </div>
    `;
  }
  lucide.createIcons();
}

/**
 * 3. RENDER DANH SÁCH SÁCH
 */
function renderBooks() {
  const grid = document.getElementById('bookGrid');
  const countEl = document.getElementById('bookCount');
  
  countEl.innerText = `${allBooks.length} cuốn sách`;

  if (allBooks.length === 0) {
    grid.innerHTML = `<div class="col-span-full text-center py-10 text-slate-400">Chưa có cuốn sách nào</div>`;
    return;
  }

  grid.innerHTML = allBooks.map(book => {
    const formattedPrice = book.price.toLocaleString('vi-VN');
    const isClosed = !currentSettings.isRegistrationOpen;

    return `
      <div class="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 hover:border-emerald-400 hover:shadow-md transition-all flex flex-col justify-between">
        <div>
          <h3 class="font-extrabold text-slate-900 text-base sm:text-lg leading-snug">
            ${book.title}
          </h3>

          <p class="text-xs text-slate-500 mt-2 line-clamp-2 leading-relaxed">
            ${book.description}
          </p>
        </div>

        <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
          <div>
            <div class="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Đơn giá</div>
            <div class="text-base sm:text-lg font-black text-emerald-600 leading-none">${formattedPrice} đ</div>
          </div>
          
          ${isClosed ? `
            <button disabled class="px-3.5 py-2 bg-slate-100 text-slate-400 text-xs font-bold rounded-xl cursor-not-allowed flex items-center space-x-1.5 border border-slate-200">
              <i data-lucide="lock" class="w-3.5 h-3.5"></i>
              <span>Đã chốt sổ</span>
            </button>
          ` : `
            <button 
              onclick="openCheckoutModal('${book.id}')"
              class="px-3.5 py-2 bg-brand-600 hover:bg-brand-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-sm transition flex items-center space-x-1.5"
            >
              <i data-lucide="qr-code" class="w-4 h-4"></i>
              <span>Mua & Quét QR</span>
            </button>
          `}
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

/**
 * 4. MỞ MODAL ĐẶT MUA SÁCH & CHỌN SỐ LƯỢNG
 */
function openCheckoutModal(bookId) {
  selectedBook = allBooks.find(b => b.id === bookId);
  if (!selectedBook) return;

  document.getElementById('formBookId').value = selectedBook.id;
  document.getElementById('formQuantity').value = 1;

  document.getElementById('selectedBookSummary').innerHTML = `
    <div class="flex justify-between items-center">
      <div>
        <h4 class="font-bold text-sm text-slate-900">${selectedBook.title}</h4>
        <p class="text-xs text-slate-500">Đơn giá: <strong class="text-emerald-600 font-bold">${selectedBook.price.toLocaleString('vi-VN')} đ</strong>/cuốn</p>
      </div>
    </div>
  `;

  updateTotalAmountDisplay();
  openModal('checkoutModal');
}

function adjustQuantity(delta) {
  const input = document.getElementById('formQuantity');
  let val = parseInt(input.value) || 1;
  val = Math.max(1, Math.min(20, val + delta));
  input.value = val;
  updateTotalAmountDisplay();
}

function updateTotalAmountDisplay() {
  if (!selectedBook) return;
  const qty = parseInt(document.getElementById('formQuantity').value) || 1;
  const total = selectedBook.price * qty;
  document.getElementById('formTotalAmountDisplay').innerText = `${total.toLocaleString('vi-VN')} đ`;
}

/**
 * 5. GỌI API TẠO MÃ DYNAMIC VIETQR PAYOS
 */
async function handleCreatePayment(event) {
  event.preventDefault();

  const bookId = document.getElementById('formBookId').value;
  const quantity = parseInt(document.getElementById('formQuantity').value) || 1;
  const customerName = document.getElementById('formCustomerName').value.trim();
  const customerPhone = (document.getElementById('formCustomerPhone')?.value || '').trim();

  // Bắt buộc nhập đầy đủ cả Họ và Tên (tối thiểu 2 từ)
  const nameParts = customerName.split(/\s+/).filter(w => w.length > 0);
  if (nameParts.length < 2) {
    alert("Vui lòng nhập đầy đủ cả Họ và Tên (ví dụ: Nguyễn Văn An)");
    document.getElementById('formCustomerName').focus();
    return;
  }

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
      body: JSON.stringify({ bookId, quantity, customerName, customerPhone })
    });

    const result = await res.json();
    if (!result.success) {
      alert("Thông báo: " + result.message);
      return;
    }

    const { orderCode, amount, bookTitle, qrCode, accountNumber, bin, accountName, description } = result.data;
    activeOrderCode = orderCode;

    closeModal('checkoutModal');
    showQRPaymentModal({
      orderCode,
      amount,
      quantity,
      bookTitle,
      customerName,
      qrCode,
      accountNumber,
      bin,
      accountName,
      description
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
 * 6. HIỂN THỊ MODAL MÃ DYNAMIC VIETQR & BẮT ĐẦU POLLING
 */
function showQRPaymentModal(data) {
  document.getElementById('paymentPendingView').classList.remove('hidden');
  document.getElementById('paymentSuccessView').classList.add('hidden');

  document.getElementById('qrAmountDisplay').innerText = `${data.amount.toLocaleString('vi-VN')} đ`;
  document.getElementById('qrDescriptionDisplay').innerText = data.description;
  document.getElementById('qrAccountDisplay').innerText = `${data.accountNumber} (${getBankName(data.bin)})`;
  document.getElementById('qrAccountNameDisplay').innerText = data.accountName;

  // Link VietQR chuẩn
  const qrImgUrl = `https://img.vietqr.io/image/${data.bin}-${data.accountNumber}-compact2.png?amount=${data.amount}&addInfo=${encodeURIComponent(data.description)}&accountName=${encodeURIComponent(data.accountName)}`;
  document.getElementById('qrImageElement').src = qrImgUrl;

  openModal('qrPaymentModal');

  // Lắng nghe xem PayOS báo tiền đã về chưa (mỗi 2s)
  startOrderPolling(data.orderCode);
}

function getBankName(bin) {
  if (bin === '970422') return 'MBBank';
  if (bin === '970415') return 'VietinBank';
  if (bin === '970436') return 'Vietcombank';
  return 'Ngân hàng';
}

/**
 * 7. POLLING KIỂM TRA ĐƠN HÀNG THỜI GIAN THỰC
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

/**
 * 8. TEST GIẢ LẬP THANH TOÁN
 */
async function simulateSuccessfulPayment() {
  if (!activeOrderCode) return;
  try {
    const res = await fetch('/api/test/simulate-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderCode: activeOrderCode })
    });
    const data = await res.json();
    console.log("Giả lập:", data);
  } catch (err) {
    alert("Lỗi test: " + err.message);
  }
}

/**
 * 9. BẢNG QUẢN TRỊ & THỐNG KÊ CHO CHÚ
 */
let adminAuthPassword = sessionStorage.getItem('xbook_admin_pwd') || '';

/**
 * 9. BẤM NÚT QUẢN TRỊ (KIỂM TRA MẬT KHẨU)
 */
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

/**
 * XỬ LÝ ĐĂNG NHẬP MẬT KHẨU ADMIN
 */
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

/**
 * ĐĂNG XUẤT KHỎI ADMIN (KHÓA LẠI)
 */
function handleAdminLogout() {
  adminAuthPassword = '';
  sessionStorage.removeItem('xbook_admin_pwd');
  closeModal('adminModal');
  alert("🔒 Đã khóa lại Bảng Quản Trị!");
}

/**
 * TẢI DỮ LIỆU BẢNG QUẢN TRỊ & THỐNG KÊ (YÊU CẦU MẬT KHẨU)
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

    // Nút bật/tắt chốt sổ
    const btnToggle = document.getElementById('btnToggleRegistration');
    if (stats.settings.isRegistrationOpen) {
      btnToggle.className = 'px-4 py-2 rounded-xl text-xs font-black transition flex items-center space-x-1.5 shadow-sm bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300';
      btnToggle.innerHTML = `<i data-lucide="lock" class="w-4 h-4"></i><span>Bấm để ĐÓNG / CHỐT SỔ ĐĂNG KÝ</span>`;
    } else {
      btnToggle.className = 'px-4 py-2 rounded-xl text-xs font-black transition flex items-center space-x-1.5 shadow-sm bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20';
      btnToggle.innerHTML = `<i data-lucide="unlock" class="w-4 h-4"></i><span>Bấm để MỞ LẠI ĐĂNG KÝ</span>`;
    }

    // Tổng doanh thu
    const revEl = document.getElementById('adminTotalRevenue');
    if (revEl) revEl.innerText = `Tổng tiền: ${stats.totalRevenue.toLocaleString('vi-VN')} đ`;
    
    const paidCountEl = document.getElementById('adminPaidCount');
    if (paidCountEl) {
      paidCountEl.innerText = `${stats.paidOrdersCount} bạn đã nộp (${stats.totalBooksPaid} cuốn)`;
    }

    // Thống kê từng cuốn cần chuẩn bị
    const summaryCards = document.getElementById('adminBookSummaryCards');
    if (summaryCards) {
      summaryCards.innerHTML = stats.bookSummary.map(b => `
        <div class="bg-slate-50 border border-slate-200 p-2 sm:p-2.5 rounded-2xl text-center shadow-sm">
          <div class="text-[10px] sm:text-[11px] text-slate-700 font-extrabold truncate" title="${b.title}">${b.title}</div>
          <div class="text-base sm:text-2xl font-black text-emerald-600 my-0.5">${b.totalQuantity} <span class="text-[10px] sm:text-xs text-slate-400 font-normal">cuốn</span></div>
          <div class="text-[9px] sm:text-[10px] text-slate-400 font-semibold">${b.totalRevenue.toLocaleString('vi-VN')} đ</div>
        </div>
      `).join('');
    }

    // Lưu danh sách đã thanh toán vào bộ nhớ đệm để tìm kiếm & sắp xếp A-Z
    const paidOrders = stats.allOrders.filter(o => o.status === 'PAID');
    
    // Tự động sắp xếp theo Tên (từ A đến Z theo chuẩn danh sách lớp)
    paidOrders.sort((a, b) => {
      const getLastName = (fullName) => {
        const parts = (fullName || '').trim().split(/\s+/);
        return parts[parts.length - 1].toLowerCase();
      };
      return getLastName(a.customerName).localeCompare(getLastName(b.customerName), 'vi');
    });

    window.cachedPaidOrders = paidOrders;
    renderAdminOrderTable(paidOrders);

    lucide.createIcons();
  } catch (err) {
    console.error("Lỗi admin:", err);
  }
}

/**
 * RENDER BẢNG DANH SÁCH PHÁT SÁCH (CÓ STT VÀ SẮP XẾP A-Z)
 */
function renderAdminOrderTable(orders) {
  const tbody = document.getElementById('adminOrderTableBody');
  const mobileContainer = document.getElementById('adminOrderMobileList');

  // 1. RENDER CHO GIAO DIỆN DESKTOP (TABLE ĐẦY ĐỦ CỘT)
  if (tbody) {
    if (orders.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-slate-400">Không tìm thấy bạn nào</td></tr>`;
    } else {
      tbody.innerHTML = orders.map((o, index) => {
        const deliveredChecked = o.isDelivered ? 'checked' : '';
        const deliveredClass = o.isDelivered ? 'line-through text-slate-400' : 'text-slate-900';

        return `
          <tr class="hover:bg-slate-50 transition border-b border-slate-100">
            <td class="p-2.5 text-center font-bold text-slate-400 text-xs">${index + 1}</td>
            <td class="p-2.5 font-extrabold text-sm ${deliveredClass}">
              ${o.customerName}
              ${o.customerPhone ? `<div class="text-[10px] text-slate-400 font-normal">SĐT: ${o.customerPhone}</div>` : ''}
            </td>
            <td class="p-2.5 truncate max-w-xs font-medium text-xs">
              ${o.bookTitle} <strong class="text-emerald-700 font-black">(x${o.quantity || 1})</strong>
            </td>
            <td class="p-2.5 font-black text-emerald-600 text-xs">${o.amount.toLocaleString('vi-VN')} đ</td>
            <td class="p-2.5 text-center print:hidden">
              <label class="inline-flex items-center space-x-1.5 cursor-pointer bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg">
                <input 
                  type="checkbox" 
                  ${deliveredChecked} 
                  onchange="toggleDelivered(${o.orderCode})" 
                  class="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                />
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

  // 2. RENDER CHO GIAO DIỆN MOBILE (CARD ITEM GỌN GÀNG, KHÔNG BỊ CO ÉP CỘT)
  if (mobileContainer) {
    if (orders.length === 0) {
      mobileContainer.innerHTML = `
        <div class="p-6 text-center text-slate-400 text-xs bg-white rounded-2xl border border-dashed border-slate-200">
          Chưa có ai nộp tiền
        </div>
      `;
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
                <div class="font-extrabold text-sm ${nameClass} truncate">${o.customerName}</div>
                <div class="text-[11px] text-slate-500 truncate mt-0.5">${o.bookTitle} <strong class="text-emerald-700 font-black">(x${o.quantity || 1})</strong></div>
                <div class="text-xs font-black text-emerald-600 mt-0.5">${o.amount.toLocaleString('vi-VN')} đ</div>
              </div>
            </div>
            
            <button 
              onclick="toggleDelivered(${o.orderCode})" 
              class="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs border transition flex items-center space-x-1 ${btnClass}"
            >
              <span>${isDelivered ? '✓ Đã phát' : 'Chưa phát'}</span>
            </button>
          </div>
        `;
      }).join('');
    }
  }
}

/**
 * TÌM NHANH TÊN BẠN CÙNG LỚP KHI MANG SÁCH LÊN PHÁT
 */
function filterAdminStudentList() {
  const keyword = (document.getElementById('adminSearchStudentInput')?.value || '').toLowerCase().trim();
  const allPaid = window.cachedPaidOrders || [];

  if (!keyword) {
    renderAdminOrderTable(allPaid);
    return;
  }

  const filtered = allPaid.filter(o => {
    return (o.customerName && o.customerName.toLowerCase().includes(keyword)) ||
           (o.customerClass && o.customerClass.toLowerCase().includes(keyword)) ||
           (o.customerPhone && o.customerPhone.includes(keyword));
  });

  renderAdminOrderTable(filtered);
}

/**
 * 10. THAO TÁC ĐÓNG/MỞ ĐĂNG KÝ (YÊU CẦU MẬT KHẨU)
 */
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
      currentSettings = data.settings;
      renderRegistrationBanner();
      renderBooks();
      await refreshAdminData();
    }
  } catch (e) {
    alert("Lỗi khi đổi trạng thái: " + e.message);
  }
}

/**
 * 11. ĐÁNH DẤU ĐÃ PHÁT SÁCH (YÊU CẦU MẬT KHẨU)
 */
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

/**
 * UTILS
 */
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
