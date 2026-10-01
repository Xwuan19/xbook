# XBook - Tài Liệu Bàn Giao & Lịch Sử Cập Nhật (Handover)

## Phiên bản hiện tại: v1.0.5 (Production Security & Clean Up)
- **Repository**: [https://github.com/Xwuan19/xbook](https://github.com/Xwuan19/xbook)
- **Live Production URL**: [https://xbook1.vercel.app](https://xbook1.vercel.app)
- **PayOS Webhook URL**: `https://xbook1.vercel.app/api/payos-webhook`
- **Mục tiêu**: Hệ thống đăng ký mua giáo trình và thanh toán tự động qua VietQR PayOS dành cho sinh viên, hỗ trợ quản lý chốt sổ số lượng sách và danh sách phát sách trên lớp.

---

## 1. Tính Năng Chính
1. **Danh mục giáo trình**:
   - Gồm chính xác 3 cuốn sách của lớp với bảng giá mới:
     - *Vật lí đại cương*: **47.000 đ**
     - *Đại số tuyến tính*: **22.000 đ**
     - *Logic học (tài liệu học tập)*: **20.000 đ**
   - Tối giản hiển thị: Gỡ bỏ số trang và tác giả thừa, chỉ giữ tên sách, mô tả ngắn, giá tiền và nút chọn số lượng / mua ngay.
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
  - `index.html`: Giao diện người dùng responsive (Tailwind CSS, Lucide Icons).
  - `app.js`: Xử lý giao diện, tạo link VietQR, polling đơn hàng, đăng nhập admin và quản lý danh sách.
  - `logo.png`: Logo nhận diện thương hiệu xbook.
- `.env`: Cấu hình cổng, PayOS Client ID / API Key / Checksum Key, DATABASE_URL và mật khẩu Admin.
- `.gitignore`: Bỏ qua `node_modules/` và `.env`.

---

## 3. Lịch Sử Thay Đổi
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
