# XBook - Tài Liệu Bàn Giao & Lịch Sử Cập Nhật (Handover)

## Phiên bản hiện tại: v1.4.6 (Rút gọn nút chốt sổ thành icon + 2 chữ trên header)
- **Repository**: [https://github.com/Xwuan19/xbook](https://github.com/Xwuan19/xbook)
- **Live Production URL**: [https://xbook1.vercel.app](https://xbook1.vercel.app)
- **PayOS Webhook URL**: `https://xbook1.vercel.app/api/payos-webhook`
- **Trang quản trị**: [https://xbook1.vercel.app/admin](https://xbook1.vercel.app/admin) (chuyển hướng sang `/admin.html`)
- **Mục tiêu**: Hệ thống đăng ký mua sách và thanh toán tự động qua VietQR PayOS dành cho sinh viên, hỗ trợ quản lý chốt sổ số lượng sách và danh sách phát sách trên lớp.

---

## 0l. Điểm mới v1.4.6 (rút gọn nút chốt sổ thành icon + 2 chữ: ĐÓNG SỔ / MỞ SỔ)

- **Nút chốt sổ cạnh "Bảng Quản Lý Sách"**:
  - Đang mở đăng ký → 🔒 **ĐÓNG SỔ** (nền đỏ nhạt `bg-rose-50 text-rose-700 border-rose-300`).
  - Đang đóng đăng ký → 🔓 **MỞ SỔ** (nền xanh `bg-emerald-600 text-white`).
  - Đã bỏ câu dài ở cả mobile lẫn desktop; tooltip đầy đủ nằm trong `title` khi chạm/giữ.
  - Bỏ nút "Xuất Excel" ở header, chỉ giữ 1 nút ở chân trang (+ nút xuất theo khoảng ngày trong tab Quyết toán).
- **Kiểm thử**: `npm test` 15/15 bài pass (test 1f kiểm tra nhãn "ĐÓNG SỔ").
- **Cache**: Bump version 1.4.6, SW cache `xbook-static-v16`.

## 0g. Điểm mới v1.4.1 (tối ưu hiển thị mobile — khách dễ đặt sách trên điện thoại)

- **Mục tiêu**: khách của XBook đặt sách chủ yếu bằng điện thoại, nhưng luồng đặt hàng vẫn dựng theo kiểu desktop (modal giữa màn hình, nút nhỏ, ô nhập 14px bị iOS phóng to, bàn phím che mất nút gửi).
- **3 modal trang chủ chuyển thành SHEET trượt từ đáy trên mobile** (`#checkoutModal`, `#bookPreviewModal`, `#qrPaymentModal`):
  - Cùng 1 markup cho 2 kiểu hiển thị: wrapper `items-end` (mobile) + `sm:items-center sm:p-4` (desktop), panel `xb-sheet xb-sheet-max flex flex-col rounded-t-[28px] sm:rounded-3xl sm:max-w-lg`.
  - **Sheet đặt mua là chính `<form id="orderForm">`** để nút `type="submit"` ở chân sheet vẫn submit được form: header `flex-shrink-0` → thân `[data-sheet-body] flex-1 overflow-y-auto overscroll-contain` → chân `flex-shrink-0 … xb-safe-bottom` chứa **tổng tiền + nút "Tạo mã QR"**. Nút gửi luôn trong tầm ngón cái, không phải cuộn tìm.
  - `openCheckoutModal()` đặt lại `scrollTop = 0` của `[data-sheet-body]` mỗi lần mở.
- **Bàn phím ảo không che form** — `initSheetKeyboardFix()` (core.js): iPhone không thu nhỏ layout viewport khi mở bàn phím nên nút dính đáy bị che. Hàm này đo `window.innerHeight - visualViewport.offsetTop - visualViewport.height` → ghi vào biến CSS `--xb-keyboard`; `.xb-sheet-lift` dùng làm `padding-bottom`, `.xb-sheet-max` trừ khỏi `max-height`. Không có `visualViewport` (jsdom/trình duyệt cũ) thì bỏ qua.
- **`openModal()/closeModal()` (core.js) nâng cấp cho mobile**: khóa cuộn nền bằng `body.xb-modal-open` (nhả khi đóng sheet cuối cùng, trả lại `window.scrollTo`), **bấm nền tối** (`[data-modal-backdrop]`) hoặc **phím Esc** để đóng. Nhiều sheet chồng nhau được đếm bằng `xbOpenModals`.
- **iPhone không tự phóng to trang**: `@media (max-width: 640px) { input, textarea, select { font-size: 16px !important; } }`; viewport bỏ `maximum-scale=1.0, user-scalable=no` (khách pinch-zoom xem giá/QR được), giữ `viewport-fit=cover`.
- **Nút chạm đủ lớn**: *Chọn mua* `min-h-[44px]`, *Mua & Quét QR* `min-h-[48px]`, nút gửi đơn `min-h-[52px]`, +/- số lượng `h-10 w-10`, chip khoa `min-h-[38px]`, trigger `XBookSelect` `min-h-[40px]/[44px]/[48px]` theo size (desktop giữ nguyên kích thước cũ qua `sm:min-h-0`), nút đóng sheet `h-9 w-9`, cộng `touch-action: manipulation` + bỏ `-webkit-tap-highlight-color`.
- **Card sách vẫn `aspect-square` 2 cột** nhưng dồn lại cho vừa: ảnh minh họa đổi từ **nút chữ 1 dòng** thành **nút icon góc phải** (`h-8 w-8`, có `aria-label`) để không tốn thêm ~28px chiều dọc, padding `p-2.5 sm:p-4`; nhờ vậy nút mua 44px vẫn nằm gọn trong khối vuông ở màn 320–360px.
- **Màn hình QR cho điện thoại** (không thể quét QR trên chính màn hình đó): QR co theo bề ngang `w-[min(13rem,60vw)] sm:w-60`; chân sheet có **Mở app ngân hàng** (`#qrOpenBankButton` ← `checkoutUrl` PayOS, ẩn nếu không có), **Mở ảnh QR** (`#qrSaveImageLink` ← link `img.vietqr.io`), **Chép nội dung**; tiền về thì `handlePaymentSuccess()` ẩn `#qrPendingActions` và hiện `#qrDoneButton`. `handleCreatePayment()` nay truyền thêm `checkoutUrl` vào `showQRPaymentModal()`.
- **Báo lỗi đúng chỗ**: `focusFieldError()` = hiện lỗi + `scrollIntoView({block:'center'})` + `focus({preventScroll:true})`; ngày nhận sách có ô lỗi riêng **`#formCustomerDeliveryDateError`** (trước đây báo bằng `alert`).
- **Phản hồi chạm**: `showToast()` (host `#toastHost`, giữ tối đa 2 toast) + `hapticTap()` (`navigator.vibrate`) khi thêm/bớt sách, đổi số lượng, tiền về, chép nội dung thành công.
- **`copyToClipboard()` chạy được trên `http://`**: khi vào bằng IP mạng LAN thì `navigator.clipboard` **không tồn tại** (chỉ có ở secure context) → code cũ ném `TypeError`. Nay có nhánh dự phòng `textarea + document.execCommand('copy')` và báo kết quả bằng toast/alert.
- **Khác**: `#filterBar` sticky `top-14 sm:top-16` (đổi khoa/lớp không cần cuộn lên đầu), header gọn `h-14 sm:h-16`, `px-3 sm:px-6`, `main` thêm `pb-32 sm:pb-28` để thanh giỏ hàng không đè card cuối, `env(safe-area-inset-bottom)` cho thanh giỏ hàng + chân sheet, chiều cao dùng `dvh`.
- ⚠️ **Không đổi**: `server.js`, `domain.js`, `admin.js`/`admin.html` (giao diện quản trị vẫn như v1.4.0), cấu trúc dữ liệu đơn hàng và API.
- **`public/sw.js` bump cache v10 → v11** để máy đã cài PWA nhận giao diện mobile mới.
- **Kiểm thử 15/15 pass**: thêm test *mobile storefront* trong `test/frontend.test.js` — mở/đóng sheet (khóa cuộn nền, đóng bằng nền tối, đóng bằng Esc, 2 sheet chồng nhau), toast khi thêm sách, kích thước nút chạm, bộ lọc sticky, thiếu tên/thiếu ngày → ô lỗi hiện **và `document.activeElement` đúng ô đó**, nút QR (`checkoutUrl`, link ảnh, đổi sang *Hoàn tất* khi tiền về), `copyToClipboard` không ném lỗi khi không có `navigator.clipboard`.

## 0f. Điểm mới v1.4.0 (trang quản trị riêng /admin.html — gỡ modal khỏi trang chủ)

- **Giao diện quản lý tách hẳn sang trang riêng `public/admin.html`**:
  - Route **`/admin`** (và `/admin/`) **chuyển hướng 302 → `/admin.html`** trong `server.js`; trên Vercel khai báo tương ứng trong `vercel.json` (`redirects`).
  - Trang quản trị gồm: **form đăng nhập** (`#adminLoginPanel`) + **Bảng Quản Lý** (`#adminPanel`, giữ `id="printArea"` để in) + **modal form thêm/sửa sách** (`#bookFormModal`) + header riêng (logo, nút *Trang chủ*, nút *Khóa lại*).
  - Không còn là modal: **chưa có phiên** → hiện form mật khẩu; **đăng nhập xong / còn phiên 30 ngày** → `showAdminDashboard()` hiện thẳng Bảng Quản Lý; 401 giữa chừng → `askAdminLogin(message)` quay lại form.
- **Trang chủ `index.html` đã gỡ sạch 3 modal quản trị** (`adminLoginModal`, `adminModal`, `bookFormModal`) — chỉ còn danh mục sách, giỏ hàng, form đặt mua, modal mã QR. Nút **“Quản Lý”** trên header đổi thành **link `<a href="/admin.html">`** (bỏ hẳn `handleClickAdmin()`).
- **Code frontend tách 3 file** (trang nào nạp đúng file của trang đó):
  - `public/core.js` — dùng chung: state danh mục (`allBooks`, `currentSettings`), tiện ích (`formatMoney`, `formatDateVN`, `formatDelivery`, `localDateKey`, `shiftDateKey`, `formatDateKeyVN`, `escapeHtml`, `compareByLastName`, helper đơn hàng/lớp), **component `XBookSelect`**, `openModal`/`closeModal`/`copyToClipboard`, `fetchBooksAndSettings()` + `renderCatalogViews()`.
  - `public/app.js` — trang chủ: banner, chips khoa, lọc lớp, grid sách, giỏ hàng, form đặt mua, QR PayOS + polling (`stopOrderPolling()`), gợi ý cài PWA, `initApp()`, `renderStorefrontCatalog()`.
  - `public/admin.js` — trang quản trị: phiên đăng nhập (`adminFetch`, token HMAC), 6 tab, bộ lọc ngày + quyết toán + sách đã bán, quản lý sách/khoa/lớp, chốt sổ & ngày nhận sách, đánh dấu đã phát, xuất Excel, `initAdminPage()`, `renderAdminCatalog()`.
  - ⚠️ **Bài học kỹ thuật**: 2 trang là 2 document khác nhau nên mọi lời gọi vẽ giao diện trang chủ từ code quản trị phải qua `renderStorefrontCatalogIfPresent()` (check `typeof`), và `core.js` điều phối bằng `renderCatalogViews()` — nếu gọi thẳng `renderBooks()` trên `/admin.html` sẽ `ReferenceError`.
  - ⚠️ **Test với jsdom**: `let`/`const` trong `window.eval()` **chỉ sống trong phạm vi của lần eval đó**, nên test phải eval **gộp** `domain.js + core.js + app.js` (hoặc `+ admin.js`) trong **một lần** để mô phỏng đúng phạm vi toàn cục dùng chung của các thẻ `<script>` trên trình duyệt thật.
- **`public/sw.js` bump cache v5 → v6** và **cache offline riêng từng trang**: thêm `/admin`, `/admin.html`, `/core.js`, `/admin.js` vào `CORE_ASSETS`; điều hướng nào lưu theo đường dẫn đó (trước đây mọi navigation đều ghi đè `/index.html` → mở `/admin.html` lúc mất mạng sẽ ra nhầm trang chủ).
- **Kiểm thử 13/13 pass**: `test/routes.test.js` mới (bật server thật: `/admin` → 302 `/admin.html`, `/admin.html` có `#adminPanel`/`#adminLoginPanel`/`#bookFormModal` và không nạp `app.js`, trang chủ không còn `#adminModal`/`#adminLoginModal`/`#bookFormModal`/`handleClickAdmin` và có link `/admin.html`); `test/frontend.test.js` tách theo trang (test trang chủ + 2 test trang quản trị + checkout + lọc ngày/quyết toán).

## 0e. Điểm mới v1.3.4 (sách đã bán theo từng đầu sách)

- Tab **Quyết toán** có thêm khối **“Sách đã bán — mỗi đầu sách bao nhiêu cuốn”**:
  - Badge tổng hợp: `N đầu sách · X cuốn · Y đ`.
  - Bảng: **Tên sách · SL bán · Tỷ trọng (thanh + %) · Doanh thu · Đơn giá TB** + dòng **TỔNG CỘNG**, xếp theo SL giảm dần.
  - **Bấm một đầu sách** → nhảy tab *Đơn hàng* và lọc sẵn tên cuốn đó (bấm lại để bỏ).
  - Số liệu bám đúng khoảng ngày + mốc thời gian đang lọc (`computeBookSummary(filterOrdersByAdminDate(cachedPaidOrders))`).
- **Excel** thêm sheet **“Sách Đã Bán”** (STT · Tên sách · SL bán · Tỷ trọng % · Doanh thu · Đơn giá TB + TỔNG CỘNG) — tổng 6 sheet.
- `data.json` demo thêm đầu sách thứ 2 (*Bài tập Cấu trúc dữ liệu và giải thuật*, đã gán vào lớp CNTT K15) để thấy breakdown nhiều đầu sách; xoá được trực tiếp, không ảnh hưởng Neon.
- **SW cache v4 → v5** (đổi file tĩnh thì phải tăng).

## 0d. Điểm mới v1.3.3 (thanh lọc dùng chung + tab Quyết toán)

- **Thanh “Lọc theo ngày”** được chuyển từ trong tab *Đơn hàng* lên **header Bảng Quản Lý** (ngay trên thanh tab) → hiện ở **mọi tab**; kèm dòng tóm tắt `📅 … — x đơn · y cuốn · z tiền` và nút *Xem quyết toán từng ngày*.
- **Tab “Quyết toán”** mới: 4 thẻ (Ngày có đơn · Đơn đã nộp · Sách đã bán · Tiền thực nhận) + bảng theo ngày (thanh tỷ trọng doanh thu, TB/đơn, TỔNG CỘNG) + nút *Xuất Excel khoảng này*. Mọi số liệu ở tab này **theo đúng khoảng ngày đang lọc**.
- **Delegation thay `onclick` inline**: `initAdminDelegatedEvents()` bắt sự kiện qua `data-date-preset`, `data-date-basis`, `data-date-day`, `data-goto-settlement`.
  ⚠️ Bài học: `onclick` inline **không chạy trong jsdom** khi `runScripts: 'outside-only'` → các test bấm chip/dòng trước đây là no-op (pass giả). Nay đã bấm thật và kiểm chứng.
- `initApp()` được gọi thêm khi `document.readyState !== 'loading'` → an toàn nếu app.js nạp muộn/defer.
- `public/sw.js`: **bump CACHE_NAME v3 → v4** (quy tắc: đổi file tĩnh thì phải tăng để máy đã cài PWA nhận bản mới).

## 0c. Điểm mới v1.3.2 (lọc theo ngày — quyết toán từng ngày)

- Tab **Đơn hàng** có khối **“Lọc theo ngày”**: chips **Tất cả / Hôm nay / Hôm qua / 7 ngày / 30 ngày** + ô **Từ ngày → Đến ngày**; chips đổi mốc **Ngày đặt hàng ↔ Ngày thanh toán**.
- Bảng **“Quyết toán theo từng ngày”** (chỉ đơn `PAID`): ngày · thứ · đơn · cuốn · doanh thu + dòng TỔNG CỘNG; **bấm một dòng để lọc đúng ngày đó**, bấm lại để bỏ lọc.
- Bộ lọc áp dụng cho **tất cả** số liệu tab Đơn hàng/Theo tên/Theo lớp/Theo khoa (qua `renderAdminTabsWithFilter()`), gồm cả “Số lượng từng cuốn cần in” (`computeBookSummary` tính tại client).
- **Excel**: tiêu đề ghi rõ khoảng ngày, sheet *Quyết Toán Theo Ngày* mới, cột *Ngày Đặt* ở sheet phát sách & toàn bộ đơn hàng, tên file `XBook_QuyetToan_...`.
- Ngày tính theo **giờ địa phương** (`localDateKey`), lọc hoàn toàn ở client → không đổi API/DB.
- Lưu ý dữ liệu demo: `data.json` (chỉ dùng khi chạy local không có Neon) có 3 đơn `PAID` mã `90000000x` để xem thử bảng quyết toán — xoá được trực tiếp trong file, không ảnh hưởng Neon production.

## 0b. Điểm mới v1.3.1 (chọn lớp đồng bộ + bắt buộc thông tin)

1. **Dropdown chọn khoa/lớp tự vẽ** (`XBookSelect` trong `public/app.js`) — **không dùng list mặc định của trình duyệt** nữa. Đã bỏ 100% `<select>`/`<datalist>` khỏi giao diện (trang chủ, form mua sách, tab Đơn hàng, bộ lọc thư viện sách, Sách cần học theo lớp, chọn khoa khi thêm lớp). Panel bo tròn theo theme xbook, chia nhóm theo khoa, có ô *tìm nhanh* bỏ dấu, điều hướng bàn phím, bấm ra ngoài tự đóng. Giá trị vẫn là khóa `["Khoa","Lớp"]`.
   - ⚠️ Lưu ý kỹ thuật: handler "bấm ra ngoài" phải dùng `event.composedPath()` (không chỉ `closest`) vì trigger bị vẽ lại ngay khi mở panel → nút cũ tách khỏi DOM, dùng `closest` sẽ đóng panel ngay lập tức.
2. **Bắt buộc Họ tên + Số điện thoại + Lớp học khi mua sách**:
   - Form: lỗi hiện ngay dưới từng ô (`formCustomerNameError`, `formCustomerPhoneError`, `formCustomerClassError`), không dùng popup.
   - Server (`POST /api/orders/create-payment-link`): tên ≥ 2 từ; SĐT 10 số `0xxxxxxxxx` (chuẩn hóa `+84`, khoảng trắng, dấu chấm/gạch); lớp phải có trong `settings.classes` (kèm `customerDepartment` để phân biệt lớp trùng tên giữa các khoa) → thiếu/sai trả **400**.
   - Chưa khai báo lớp nào → nút đặt mua bị khóa + banner hướng dẫn liên hệ quản trị viên (vì lớp là bắt buộc).
   - Số điện thoại lưu ở dạng chuẩn hóa `0xxxxxxxxx` trong đơn hàng.

## 0. Điểm mới v1.3.0 (quan trọng — đọc trước)

1. **Sách KHÔNG thuộc khoa nào** — mọi cuốn nằm trong danh mục chung. Khi admin *add sách vào khoa/lớp* thì cuốn đó thành **sách cần có khi học (các) lớp ấy** (VD: *Khoa Kinh tế* cũng học *Triết*, học *Vật lí* — dữ liệu này do admin tự nhập, không seed sẵn).
   - Form sách có khối **“Sách này cần học ở khoa / lớp nào?”**: tích **cả khoa** (áp dụng mọi lớp của khoa) hoặc mở rộng chọn **từng lớp**; bỏ tích = về danh mục chung.
   - API nhận thêm `departments: []` + `classKeys: []`; sai khoa/lớp → **400**, không ghi dữ liệu.
2. **Ghi nhớ đăng nhập** — tích “Ghi nhớ đăng nhập (30 ngày)” khi đăng nhập → mở lại web không cần nhập mật khẩu.
   - Token phiên **HMAC-SHA256** tự chứa hạn dùng (hoạt động cả trên Vercel Serverless, không cần session store), gửi qua header `x-admin-token`; mật khẩu không lưu ở client.
   - Không tích → chỉ nhớ trong phiên (`sessionStorage`). Bấm “Khóa lại” → xóa token + gọi `/api/admin/logout`.
   - `.env`: `ADMIN_SESSION_DAYS` (mặc định 30), `ADMIN_SESSION_SECRET` (mặc định = `ADMIN_PASSWORD`; đổi = mọi token cũ hết hiệu lực).
3. **PWA cho iPhone** — `public/manifest.webmanifest` + `public/sw.js` + bộ icon `public/icons/`; `server.js` phục vụ `/manifest.webmanifest` và `/sw.js` (kèm `Service-Worker-Allowed: /`, không cache sw). Safari iPhone → Chia sẻ → *Thêm vào Màn hình chính*; trang chủ tự gợi ý cài (`#iosInstallHint`).
   - Service worker **chỉ cache file tĩnh**, bỏ qua `/api/` và `/uploads/` → dữ liệu đơn hàng không bao giờ cũ.

---

## 1. Tính Năng Chính
1. **Danh mục sách (chỉ còn Khoa CNTT)**:
   - Bỏ phân loại "Đại cương" và "Kế toán" — mọi sách chỉ thuộc **Khoa CNTT**.
   - Sách hiện tại: *Cấu trúc dữ liệu và giải thuật* **35.000 đ** (mẫu). Thêm/sửa/xóa các sách khác (tên, ảnh bìa, giá, tác giả/NXB, trang, năm/bản in, mô tả, lớp) tại tab **Quản lý sách** — ảnh bìa dán link hoặc upload từ máy.
2. **Chốt sổ & ngày nhận sách**:
   - Bảng Quản Lý: nút **Đóng/Mở lại đăng ký** + ô **Ngày nhận sách** (chọn ngày giao, VD mở lại 07/10 → nhận 08/10, tự đặt ngày mai khi mở lại) + ô **Lưu ý thời gian** (mặc định: *"Sách thường giao ngay hôm sau nếu có tiết."*).
   - Sinh viên thấy ngày nhận sách + lưu ý trên banner trang chủ, trong form đăng ký và màn hình thanh toán thành công.
2. **Quy trình đăng ký mua & thanh toán**:
   - Yêu cầu nhập đầy đủ Họ và Tên (kiểm tra tối thiểu 2 từ để tiện tìm tên phát sách trên lớp).
   - Tùy chọn nhập số điện thoại.
   - Chọn số lượng mua (ẩn mũi tên tăng giảm mặc định, có nút [-] và [+] to rõ).
   - Tạo mã VietQR động PayOS chính xác số tiền và cú pháp chuyển khoản (`XB...`).
   - Tự động nhận diện khi tiền vào tài khoản và cập nhật đơn hàng sang `PAID` (kết hợp cả Webhook và cơ chế chủ động thăm dò từ PayOS Server).
   - **Bảo mật thanh toán**: Đã gỡ bỏ toàn bộ nút và endpoint thử nghiệm / giả lập, 100% đối soát tiền thật qua PayOS.
3. **Bảng Quản Lý & Chốt Đơn (Admin)**:
   - Bảo vệ bằng mật khẩu quản trị (`123456`).
   - Thống kê tổng tiền và tổng số lượng từng cuốn cần chuẩn bị (dàn đều 3 cột).
   - Nút bật/tắt chốt sổ đăng ký mua sách.
   - Ô tìm kiếm nhanh sinh viên theo tên khi mang sách lên lớp phát.
   - **Tối ưu Mobile**: Tự động chuyển bảng sang dạng thẻ danh sách dọc (Card List) với số thứ tự tròn, tên sinh viên in đậm, và nút bấm tích nhanh `[✓ Đã phát]` / `[Chưa phát]`.
   - Banner trạng thái trên mobile: Cố định kích thước chấm xanh phát sáng, huy hiệu "ĐANG NHẬN ĐƠN MUA SÁCH" không bị rớt dòng hay bóp nghẹt.
   - **Xuất file Excel (.xlsx)**:
     - Nút "Xuất Excel" tích hợp ở cả Header và Footer của Bảng Quản trị.
     - Tự động tạo file Excel chuyên nghiệp gồm 3 sheet:
       1. *Danh Sách Phát Sách*: Chỉ gồm các bạn đã thanh toán, sắp xếp tên A-Z, có cột tích chọn phát sách.
       2. *Tổng Hợp Báo In*: Thống kê số lượng từng cuốn cần in/lấy và tổng tiền.
       3. *Toàn Bộ Đơn Hàng*: Phục vụ đối soát chi tiết.
     - **An toàn dữ liệu tuyệt đối**: Tính năng hoạt động 100% Client-side Read-Only, không chạm hay chỉnh sửa bất kỳ trường dữ liệu nào của người mua trong cơ sở dữ liệu.
4. **Phiên đăng nhập & cài như app (v1.3.0)**:
   - Bảng Quản Lý mở khóa bằng token phiên 30 ngày (tự gia hạn khi còn hạn): không phải nhập lại mật khẩu mỗi lần vào web.
   - Bộ lọc thư viện sách theo **khoa / lớp / tên – tác giả**; mỗi cuốn hiển thị số lớp đang cần.
   - Cài lên màn hình chính iPhone/Android: chạy toàn màn hình, có icon riêng, mở được khi mạng chập chờn (trang tĩnh).
5. **Cơ Sở Dữ Liệu Bền Vững (Neon PostgreSQL)**:
   - Dữ liệu được lưu trữ trên đám mây PostgreSQL tại Neon Serverless (`neon.tech`).
   - Tự động đồng bộ và cập nhật giá sách vào cơ sở dữ liệu đám mây khi khởi động.
   - Đảm bảo dữ liệu đơn hàng và trạng thái phát sách không bao giờ bị mất khi triển khai trên Vercel Serverless.

---

## 2. Cấu Trúc Dự Án
- `server.js`: Node.js Express server, tích hợp PayOS SDK, routes quản trị có xác thực mật khẩu, route chuyển hướng `/admin` → `/admin.html`, xử lý bất đồng bộ kết nối DB.
- `vercel.json`: region `sin1`, rewrite `/api` + `/uploads` về function, redirect `/admin` → `/admin.html`.
- `database.js`: Quản lý truy xuất dữ liệu Hybrid: tương tác với Neon PostgreSQL qua `@neondatabase/serverless` nếu có `DATABASE_URL`, tự động fallback sang `data.json` nếu chạy offline/local không có DB.
- `data.json`: Lưu trữ cục bộ dự phòng.
- `public/`:
  - `index.html`: **Trang chủ** cho sinh viên (Tailwind CSS, Lucide Icons): danh mục sách, giỏ hàng, form đặt mua, modal QR realtime.
  - `admin.html`: **Trang quản trị riêng** (route `/admin`): đăng nhập + Bảng Quản Lý 6 tab + form thêm/sửa sách (SheetJS XLSX nạp lười khi xuất Excel).
  - `core.js`: Phần dùng chung 2 trang — tiện ích, dropdown tự vẽ `XBookSelect`, modal, nạp danh mục sách & cài đặt.
  - `app.js`: Logic trang chủ — tạo link VietQR, polling đơn hàng, giỏ hàng, PWA hint.
  - `admin.js`: Logic trang quản trị — phiên đăng nhập, thống kê, lọc ngày/quyết toán, CRUD sách, khoa/lớp, xuất Excel.
  - `logo.png`: Logo nhận diện thương hiệu xbook.
- `.env`: Cấu hình cổng, PayOS Client ID / API Key / Checksum Key, DATABASE_URL và mật khẩu Admin.
- `.gitignore`: Bỏ qua `node_modules/` và `.env`.

---

## 3. Lịch Sử Thay Đổi
- **v1.4.1**:
  - **Mục tiêu**: Tối ưu **hiển thị trên mobile** để khách dễ đặt sách bằng điện thoại (luồng chọn sách → điền thông tin → quét QR).
  - **Giải pháp**: 3 modal trang chủ thành **sheet trượt từ đáy** (form đặt mua có header/thân/chân riêng, nút tạo QR dính đáy), thêm `initSheetKeyboardFix()` chống bàn phím che nút, `openModal/closeModal` khóa cuộn nền + đóng bằng nền tối/Esc, ô nhập 16px trên mobile + cho phép pinch-zoom, nút chạm ≥44px, toast + rung khi chọn sách, màn hình QR thêm nút *Mở app ngân hàng*/*Mở ảnh QR*, báo lỗi cuộn tới + focus đúng ô, safe-area + `dvh`, `copyToClipboard` có nhánh dự phòng cho `http://`, bump SW cache v11.
  - **Kết quả**: Đặt sách trên điện thoại bằng 1 tay: không bị phóng to trang, không phải cuộn tìm nút gửi, không bị bàn phím che; 15/15 test pass.
- **v1.4.0**:
  - **Mục tiêu**: Tách **toàn bộ giao diện quản lý** ra khỏi trang chủ thành **trang riêng `/admin.html`** (kèm route chuyển hướng `/admin`), gỡ modal quản trị khỏi trang chủ để trang sinh viên nhẹ và sạch.
  - **Giải pháp**: dựng `public/admin.html` (form đăng nhập + Bảng Quản Lý + form sách, giữ nguyên `#printArea`/CSS in), tách `public/app.js` thành `core.js` (dùng chung) + `app.js` (trang chủ) + `admin.js` (quản trị), thêm route `/admin` → 302 `/admin.html` ở `server.js` + `redirects` trong `vercel.json`, bump SW cache v6 và cache offline riêng từng trang, viết thêm `test/routes.test.js` + tách `test/frontend.test.js` theo trang.
  - **Kết quả**: Trang chủ không còn DOM/code quản trị nào; quản trị viên vào `/admin` là đăng nhập và làm việc trên 1 trang đầy đủ (in/Excel giữ nguyên); 13/13 test pass.
- **v1.3.4**:
  - **Mục tiêu**: Cho biết **tổng số sách đã bán** và **trong đó mỗi đầu sách bán bao nhiêu cuốn** để quyết toán/chốt sổ theo ngày.
  - **Giải pháp**: thêm bảng “Sách đã bán” + badge tổng hợp trong tab Quyết toán (`renderSoldBooksTable`), bấm đầu sách để lọc người mua (`filterBySoldBook` + delegation `data-sold-book`), Excel thêm sheet *Sách Đã Bán*, dữ liệu demo thêm đầu sách thứ 2, mở rộng test 11 (đơn nhiều đầu sách, tỷ trọng, lọc theo đầu sách).
  - **Kết quả**: Một màn hình thấy ngay hôm nay/khoảng này bán ra bao nhiêu cuốn, cuốn nào bán chạy nhất, thu bao nhiêu tiền; 11/11 test pass.
- **v1.3.3**:
  - **Mục tiêu**: Làm bộ lọc theo ngày **dễ thấy & dễ dùng hơn** để quyết toán từng ngày (người dùng phản hồi chưa thấy vì nó nằm sâu trong tab Đơn hàng).
  - **Giải pháp**: đưa thanh lọc lên header (mọi tab), thêm tab *Quyết toán* với 4 thẻ tổng hợp + bảng ngày có thanh tỷ trọng/TB-đơn + nút xuất Excel theo khoảng; chuyển chip/ngày sang event delegation; `initApp()` chạy khi DOM đã sẵn sàng; bump SW cache v4; mở rộng test 11 để bấm thật.
  - **Kết quả**: Mở Bảng Quản Lý là thấy ngay thanh lọc ngày; một tab riêng để chốt sổ từng ngày; 11/11 test pass.
- **v1.3.2**:
  - **Mục tiêu**: Lọc đơn theo **ngày đặt hàng** để dễ quyết toán trong từng ngày.
  - **Giải pháp**: thêm state + helper lọc ngày ở client (`public/app.js`), khối UI “Lọc theo ngày” + bảng quyết toán từng ngày (`public/index.html`), `renderAdminTabsWithFilter()` vẽ lại toàn bộ tab theo khoảng lọc, Excel bám khoảng lọc + thêm sheet *Quyết Toán Theo Ngày*, cột *Ngày Đặt*.
  - **Kết quả**: Mỗi ngày chốt được số đơn, số cuốn và tiền thực nhận; xuất Excel riêng cho ngày/khoảng cần đối soát.
- **v1.3.1**:
  - **Mục tiêu**: (1) Ô chọn lớp đồng bộ giao diện web, bỏ list mặc định của trình duyệt; (2) Bắt buộc Họ tên + Số điện thoại + Lớp học khi mua sách.
  - **Giải pháp**:
    - `public/app.js`: thêm component `XBookSelect` (`renderXBookSelect`, `xbookSelectValue`, `setXBookSelectValue`, `xbookSelectOptions`, `selectXBookOption`, `closeXBookSelects`) và thay toàn bộ ô chọn khoa/lớp; thêm `showFieldError`/`clearFieldError`/`normalizePhoneNumber`; `renderCheckoutClassPicker()` (thay `populateClassDatalist`).
    - `public/index.html`: bỏ hết `<select>`, thêm `<div>` container cho dropdown, ô lỗi tại chỗ, banner cảnh báo khi chưa có lớp, SĐT + Lớp đánh dấu bắt buộc (`required`).
    - `server.js`: validate bắt buộc 3 trường, chuẩn hóa SĐT, chặn khi `settings.classes` rỗng, lưu SĐT chuẩn hóa và ghi log kèm khoa/lớp.
    - `test/`: cập nhật + thêm bài test số 10 (không còn `<select>`, mở/chọn dropdown, thiếu từng trường → lỗi tại chỗ và không gửi đơn, đủ 3 trường → gửi đúng lớp + SĐT chuẩn hóa) — tổng **10 bài pass**.
  - **Kết quả**: Giao diện chọn lớp thống nhất trên mọi màn hình; mọi đơn mua sách đều có Tên, SĐT, Lớp hợp lệ (chặn cả ở client lẫn API).
- **v1.3.0**:
  - **Mục tiêu**: (1) Sách là danh mục chung — *add sách vào khoa/lớp* = đánh dấu **sách cần học của lớp đó** (khoa Kinh tế cũng học Triết/Vật lí, không seed ví dụ vào DB); (2) **Ghi nhớ đăng nhập** để admin không phải nhập lại mật khẩu; (3) **PWA trên iPhone**.
  - **Giải pháp**:
    - `public/domain.js`: thêm `bookScope(settings, bookId)` (sách đang được lớp/khoa nào cần) và `assignBookToClasses(rawClasses, bookId, { departments, classKeys })` (tích cả khoa → mọi lớp của khoa; tích lớp lẻ → chỉ lớp đó; bỏ tích → gỡ khỏi phạm vi). Sách vẫn không có trường khoa/lớp riêng — quan hệ nằm ở `settings.classes[].bookIds`.
    - `server.js`: phiên quản trị **token HMAC** (`issueAdminToken`/`verifyAdminToken`, `requireAdminAuth` chấp nhận token hoặc mật khẩu và tự trả `x-admin-token`), `POST /api/admin/login` trả token, thêm `POST /api/admin/logout`; helper `applyBookScope()` gán sách vào khoa/lớp khi `POST/PUT /api/admin/books` (validate khoa/lớp → 400); route `/manifest.webmanifest` + `/sw.js`.
    - `public/index.html` + `app.js`: tích **“Ghi nhớ đăng nhập (30 ngày)”** (`localStorage` ↔ `sessionStorage`), `adminFetch()` tự gắn token & bắt 401 → mở lại form đăng nhập, nút “Khóa lại” xóa token; khối **“Sách này cần học ở khoa / lớp nào?”** trong form sách (chips khoa + danh sách lớp, tóm tắt số lớp); bộ lọc thư viện sách (khoa/lớp/từ khóa) + hiển thị “N lớp” mỗi cuốn; meta PWA + đăng ký service worker + gợi ý cài trên Safari iPhone.
    - `public/manifest.webmanifest`, `public/sw.js`, `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (sinh từ `logo.png`): PWA đầy đủ, cache trang tĩnh, không cache API.
    - `test/`: thêm bài test domain (`bookScope`/`assignBookToClasses`), API (token phiên, gán sách theo khoa/lớp, validate 400) và giao diện (token lưu/đăng xuất, editor khoa-lớp, bộ lọc thư viện, meta PWA) — tổng **9 bài test pass**.
  - **Kết quả**: Admin gán sách cho khoa/lớp ngay khi thêm sách; sinh viên thấy đúng danh sách sách cần học của lớp mình; admin đăng nhập một lần dùng luôn 30 ngày; xbook cài được thành app trên iPhone.
- **v1.2.1**:
  - **Mục tiêu**: Giảm độ trễ (delay) khi bấm nút — nguyên nhân chính là Vercel function chạy ở xa + mỗi thao tác fetch API tuần tự nhiều lần, chứ không phải code chậm (API local đo được ~1ms).
  - **Giải pháp**:
    - Thêm `vercel.json`: pin function về **region `sin1` (Singapore)** — gần Việt Nam nhất, giảm ~200ms+ thời gian đi-về mỗi request so với region Mỹ mặc định.
    - `server.js`: `/api/books` gọi DB bằng `Promise.all` (song song 2 query → thời gian chờ giảm ~một nửa, đặc biệt khi chạy Neon trên Vercel).
    - `public/app.js`: `refreshAdminData()` fetch `/api/admin/statistics` và `/api/books` **song song** thay vì tuần tự; `refreshCatalogEverywhere()` trả về dữ liệu để dùng lại (tránh fetch `/api/books` lần 2 sau khi thêm/sửa/xóa sách).
    - `public/index.html`: **gỡ SheetJS (~1MB) khỏi load ban đầu** — thư viện Excel chỉ tự nạp (lazy load) khi bấm "Xuất Excel"; pin `lucide@1.52.0` trên jsDelivr (không tốn thêm 1 request giải `@latest` trên unpkg như trước).
  - **Lưu ý về Vercel**: Dù đã tối ưu, **cold start** (function "thức dậy" sau khi ngủ) vẫn có thể làm lần bấm ĐẦU TIÊN sau khoảng nghỉ hơi chậm ~1–2s — đây là đặc trưng của serverless, không phải lỗi code. Sau lần đầu, các thao tác tiếp theo sẽ nhanh. Muốn loại gần như hẳn cold start thì cân nhắc gói **Fluid Compute** (trả phí) của Vercel.
- **v1.2.0**:
  - **Mục tiêu**: (1) Gọn nhẹ danh mục — bỏ 2 khoa "Đại cương" & "Kế toán", chỉ còn **Khoa CNTT**; (2) Nâng cấp **Quản lý sách** đủ trường (tên, ảnh bìa, giá, tác giả/NXB, trang, năm/bản in, mô tả, khoa, lớp) + **upload ảnh bìa từ máy**; (3) Thêm **chốt sổ theo ngày nhận sách** — admin tự chọn ngày giao và lưu ý thời gian ngắn gọn.
  - **Giải pháp**:
    - `database.js`: `DEFAULT_DEPARTMENT='Khoa CNTT'`, `INITIAL_DEPARTMENTS=['Khoa CNTT']`, xóa 4 sách demo thuộc 2 khoa cũ (chỉ giữ *Cấu trúc dữ liệu và giải thuật*); thêm trường `deliveryDate` + `deliveryNote` cho `settings` (migration Neon `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`), trường `year` cho `books`; `data.json` cập nhật theo.
    - `server.js`: thêm `POST /api/admin/upload` (Multer, ảnh ≤3MB → thư mục `/uploads/`), `PUT /api/admin/settings` nhận `deliveryDate`/`deliveryNote`; `POST /api/admin/toggle-registration` khi **mở lại** đăng ký tự đặt `deliveryDate` = **ngày mai** nếu chưa có hoặc đã quá hạn (VD mở 07/10 → nhận 08/10); endpoint `/api/test/simulate-payment` chỉ tồn tại ở chế độ Demo (chưa gắn key PayOS thật) để kiểm thử nội bộ — production 100% đối soát Webhook.
    - `public/index.html` + `public/app.js`: banner trạng thái ngắn gọn kèm dòng **"📦 Nhận sách: 08/10 · Sách thường giao ngay hôm sau nếu có tiết."**; form đăng ký + màn hình thành công hiện ngày nhận sách; Bảng Quản Lý có khối *Chốt sổ* (nút đóng/mở + ô **Ngày nhận sách** + ô **Lưu ý** + nút Lưu); tab **Quản lý sách** có cột ảnh bìa, form thêm trường **Năm/Bản in** + ô **Upload ảnh** (preview); toàn bộ nhãn "giáo trình" đổi thành "sách".
  - **Kết quả**: Danh mục chỉ còn Khoa CNTT, quản trị viên thêm/sửa sách có ảnh & đầy đủ thông tin, chốt sổ với ngày nhận sách cụ thể và lưu ý thời gian hiển thị ngắn gọn ở 3 vị trí sinh viên hay nhìn.
- **v1.1.0**:
  - **Mục tiêu**: Bổ sung logic phân loại **Khoa** (Khoa CNTT, Khoa Kế toán…) để soạn list giáo trình cần thiết, phân loại **Lớp** (người quản trị tự bổ sung tên lớp), phân loại **Tên** (1 người mua nhiều cuốn khác nhau), cập nhật giao diện và tối ưu tỷ lệ hiển thị Desktop/Mobile.
  - **Giải pháp**:
    - `database.js`: thêm `department` + `classes` cho sách, `departments` + `classes` cho settings, cột `items_json` cho đơn hàng (1 đơn nhiều cuốn), migration `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` cho Neon, CRUD giáo trình (`createBook/updateBook/deleteBook`), tương thích ngược toàn bộ dữ liệu cũ (JSON + Neon).
    - `server.js`: `POST /api/orders/create-payment-link` nhận `items[]` (vẫn hỗ trợ định dạng 1 cuốn cũ), thêm `POST/PUT/DELETE /api/admin/books` và `PUT /api/admin/settings`.
    - `public/index.html` + `app.js`: bộ lọc Khoa (chips) + Lớp (dropdown), **giỏ hàng đa cuốn** thanh toán 1 mã QR, form đăng ký thêm ô **Lớp** (datalist gợi ý), grid 1→2→3 cột (mobile→tablet→desktop, container `max-w-6xl`), bảng quản trị 5 tab (Đơn hàng / Theo tên / Theo lớp / Theo khoa / Quản lý giáo trình), xuất Excel 4 sheet có cột Khoa & Lớp.
    - `TASKS.md`: danh sách task làm việc thống nhất toàn dự án.
  - **Kết quả**: Lọc giáo trình theo khoa/lớp, 1 sinh viên đặt nhiều cuốn trong 1 lần chuyển khoản, thống kê gộp theo tên/lớp/khoa, quản trị tự thêm lớp & giáo trình không cần đụng code.
- **v1.0.6**:
  - **Mục tiêu**: Bổ sung tính năng Xuất Excel (.xlsx) từ Bảng Quản Trị, bảo đảm an toàn dữ liệu người mua không bị chỉnh sửa.
  - **Giải pháp**: Tích hợp thư viện SheetJS qua CDN, xây dựng hàm `exportToExcel()` tạo 3 sheet (Phát sách, Báo in, Toàn bộ đơn hàng) với độ rộng cột chuẩn và autofilter. Đặt nút xuất Excel tại Header và Footer của Modal Admin.
  - **Kết quả**: Xuất file Excel nhanh chóng, định dạng đẹp mắt, tiện lợi khi mang sách lên lớp phát và gửi danh sách cho xưởng in.
- **v1.0.5**:
  - **Mục tiêu**: Gỡ bỏ nút và endpoint "Bấm Thử Nghiệm Thanh Toán Thành Công" khỏi giao diện thanh toán để đảm bảo bảo mật và tính toàn vẹn dữ liệu thực tế.
  - **Giải pháp**: Xóa nút bấm trong `public/index.html`, xóa hàm `simulateSuccessfulPayment` trong `public/app.js`, xóa route `POST /api/test/simulate-payment` trong `server.js`.
  - **Kết quả**: Giao diện quét mã thanh toán sạch đẹp, chuẩn hóa thanh toán tiền thật qua VietQR PayOS.
- **v1.0.4**:
  - **Mục tiêu**: Cập nhật giá chính xác cho 3 cuốn giáo trình theo yêu cầu:
    - *Vật lí đại cương*: 47.000 đ (47k)
    - *Đại số tuyến tính*: 22.000 đ (22k)
    - *Logic học (tài liệu học tập)*: 20.000 đ (20k)
  - **Giải pháp**: Cập nhật `INITIAL_BOOKS` trong `database.js`, cơ chế upsert tự động vào bảng `books` trên Neon PostgreSQL, cập nhật `data.json`.
  - **Kết quả**: Giá mới lập tức hiển thị chính xác trên web và khi tạo mã VietQR thanh toán.
- **v1.0.3**:
  - **Mục tiêu**: Tích hợp cơ sở dữ liệu đám mây Neon PostgreSQL (`neon.tech`) để lưu trữ vĩnh viễn đơn hàng và trạng thái phát sách, tránh mất dữ liệu trên Vercel Serverless.
  - **Giải pháp**:
    - Nâng cấp `database.js` sang mô hình Hybrid hỗ trợ `@neondatabase/serverless` với Connection Pooling.
    - Tự động sinh bảng (`settings`, `books`, `orders`, `transactions`, `webhook_logs`) và nạp sẵn 3 cuốn sách vào database trên đám mây.
    - Cập nhật toàn bộ các API endpoints trong `server.js` sang `async/await`.
  - **Kết quả**: Hệ thống vận hành ổn định, dữ liệu đồng bộ tức thì lên đám mây Neon PostgreSQL.
- **v1.0.2**:
  - Tích hợp cơ chế chủ động kiểm tra trạng thái thanh toán trực tiếp từ PayOS Server trong realtime polling (`GET /api/orders/:orderCode`).
  - Đảm bảo màn hình thanh toán tự động chuyển sang "ĐÃ NHẬN TIỀN THÀNH CÔNG!" ngay lập tức kể cả khi Webhook bị trễ hoặc chưa kịp gắn URL.
  - Mở rộng hỗ trợ đa dạng endpoint Webhook: `/api/payos-webhook`, `/api/orders/webhook`, `/api/webhook` và xử lý mã xác nhận test từ PayOS Dashboard.
- **v1.0.1**:
  - Xuất `module.exports = app` trong `server.js` chuẩn hóa tương thích cho Vercel Express Serverless deployment.
- **v1.0.0**: 
  - Khởi tạo hệ thống xbook, tích hợp cổng PayOS VietQR.
  - Tối ưu biểu mẫu (chỉ yêu cầu Họ và Tên đầy đủ).
  - Khóa bảo mật Bảng Quản trị bằng mật khẩu.
  - Tinh chỉnh giao diện mobile: sửa banner trạng thái, loại bỏ số trang/tác giả, làm thẻ danh sách phát sách dạng card.
  - Chuẩn hóa danh mục đúng 3 cuốn sách học tập.
