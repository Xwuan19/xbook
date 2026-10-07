# XBook - Tài Liệu Bàn Giao & Lịch Sử Cập Nhật (Handover)

## Phiên bản hiện tại: v1.2.0 (Chỉ còn Khoa CNTT + Quản lý sách + Chốt sổ theo ngày nhận sách)
- **Repository**: [https://github.com/Xwuan19/xbook](https://github.com/Xwuan19/xbook)
- **Live Production URL**: [https://xbook1.vercel.app](https://xbook1.vercel.app)
- **PayOS Webhook URL**: `https://xbook1.vercel.app/api/payos-webhook`
- **Mục tiêu**: Hệ thống đăng ký mua giáo trình và thanh toán tự động qua VietQR PayOS dành cho sinh viên, hỗ trợ quản lý chốt sổ số lượng sách và danh sách phát sách trên lớp.

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
4. **Cơ Sở Dữ Liệu Bền Vững (Neon PostgreSQL)**:
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
