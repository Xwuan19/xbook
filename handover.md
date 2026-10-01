# XBook - Tài Liệu Bàn Giao & Lịch Sử Cập Nhật (Handover)

## Phiên bản hiện tại: v1.0.0 (Release)
- **Repository**: [https://github.com/Xwuan19/xbook](https://github.com/Xwuan19/xbook)
- **Mục tiêu**: Hệ thống đăng ký mua giáo trình và thanh toán tự động qua VietQR PayOS dành cho sinh viên, hỗ trợ quản lý chốt sổ số lượng sách và danh sách phát sách trên lớp.

---

## 1. Tính Năng Chính
1. **Danh mục giáo trình**:
   - Chỉ gồm 3 cuốn sách chuẩn:
     - *Vật lí đại cương* (45.000 đ)
     - *Đại số tuyến tính* (35.000 đ)
     - *Logic học (tài liệu học tập)* (30.000 đ)
   - Tối giản hiển thị: Đã gỡ bỏ số trang và thông tin bộ môn/tác giả thừa, chỉ giữ tên sách, mô tả ngắn, giá tiền và nút mua.
2. **Quy trình đăng ký mua & thanh toán**:
   - Yêu cầu nhập đầy đủ Họ và Tên (có kiểm tra tối thiểu 2 từ để tiện tìm tên phát sách trên lớp).
   - Tùy chọn nhập số điện thoại.
   - Chọn số lượng mua (ẩn mũi tên tăng giảm mặc định, có nút [-] và [+] to rõ).
   - Tạo mã VietQR động PayOS chính xác số tiền và cú pháp chuyển khoản (`XB...`).
   - Tự động nhận diện khi tiền vào tài khoản và cập nhật đơn hàng sang `PAID`.
3. **Bảng Quản Lý & Chốt Đơn (Admin)**:
   - Bảo vệ bằng mật khẩu quản trị (`123456`).
   - Thống kê tổng tiền và tổng số lượng từng cuốn cần chuẩn bị (dàn đều 3 cột).
   - Nút bật/tắt chốt sổ đăng ký mua sách.
   - Ô tìm kiếm nhanh sinh viên theo tên khi mang sách lên lớp phát.
   - **Tối ưu Mobile**: Tự động chuyển bảng sang dạng thẻ danh sách dọc (Card List) với số thứ tự tròn, tên sinh viên in đậm, và nút bấm tích nhanh `[✓ Đã phát]` / `[Chưa phát]`.
   - Banner trạng thái trên mobile: Cố định kích thước chấm xanh phát sáng, huy hiệu "ĐANG NHẬN ĐƠN MUA SÁCH" không bị rớt dòng hay bóp nghẹt.

---

## 2. Cấu Trúc Dự Án
- `server.js`: Node.js Express server, tích hợp PayOS SDK, routes quản trị có xác thực mật khẩu.
- `database.js`: Quản lý đọc/ghi cơ sở dữ liệu (`data.json`), thống kê và đánh dấu phát sách.
- `data.json`: Lưu trữ cấu hình trạng thái đăng ký, danh mục sách, đơn hàng và giao dịch.
- `public/`:
  - `index.html`: Giao diện người dùng responsive (Tailwind CSS, Lucide Icons).
  - `app.js`: Xử lý giao diện, tạo link VietQR, polling đơn hàng, đăng nhập admin và quản lý danh sách.
  - `logo.png`: Logo nhận diện thương hiệu xbook.
- `.env`: Cấu hình cổng, PayOS Client ID / API Key / Checksum Key và mật khẩu Admin.
- `.gitignore`: Bỏ qua `node_modules/` và `.env`.

---

## 3. Lịch Sử Thay Đổi
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
