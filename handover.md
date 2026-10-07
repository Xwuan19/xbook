# XBook - Tài Liệu Bàn Giao & Lịch Sử Cập Nhật (Handover)

## Phiên bản hiện tại: v1.3.1 (Chọn lớp đồng bộ giao diện + Bắt buộc Tên / SĐT / Lớp)
- **Repository**: [https://github.com/Xwuan19/xbook](https://github.com/Xwuan19/xbook)
- **Live Production URL**: [https://xbook1.vercel.app](https://xbook1.vercel.app)
- **PayOS Webhook URL**: `https://xbook1.vercel.app/api/payos-webhook`
- **Mục tiêu**: Hệ thống đăng ký mua sách và thanh toán tự động qua VietQR PayOS dành cho sinh viên, hỗ trợ quản lý chốt sổ số lượng sách và danh sách phát sách trên lớp.

---

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
- `server.js`: Node.js Express server, tích hợp PayOS SDK, routes quản trị có xác thực mật khẩu, xử lý bất đồng bộ kết nối DB.
- `database.js`: Quản lý truy xuất dữ liệu Hybrid: tương tác với Neon PostgreSQL qua `@neondatabase/serverless` nếu có `DATABASE_URL`, tự động fallback sang `data.json` nếu chạy offline/local không có DB.
- `data.json`: Lưu trữ cục bộ dự phòng.
- `public/`:
  - `index.html`: Giao diện người dùng responsive (Tailwind CSS, Lucide Icons, SheetJS XLSX).
  - `app.js`: Xử lý giao diện, tạo link VietQR, polling đơn hàng, đăng nhập admin, xuất Excel và quản lý danh sách.
  - `logo.png`: Logo nhận diện thương hiệu xbook.
- `.env`: Cấu hình cổng, PayOS Client ID / API Key / Checksum Key, DATABASE_URL và mật khẩu Admin.
- `.gitignore`: Bỏ qua `node_modules/` và `.env`.

---

## 3. Lịch Sử Thay Đổi
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
