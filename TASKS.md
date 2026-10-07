# 📋 TASKS — Dự án XBook (Hệ thống đặt sách cho lớp — Khoa CNTT)

> Danh sách task làm việc được chia nhỏ để **tránh vượt limit**, dễ theo dõi và **thống nhất dự án**.
> Quy tắc: làm lần lượt từng task → xong task nào đánh dấu `[x]` task đó → commit theo từng giai đoạn.

## Mục tiêu đợt này (v1.2.0)
1. **Chỉ còn Khoa CNTT**: bỏ phân loại "Đại cương" & "Kế toán", xóa 4 sách demo thuộc 2 khoa cũ.
2. **Quản lý sách nâng cấp**: đủ trường (tên, ảnh bìa, giá, tác giả/NXB, trang, năm/bản in, mô tả, khoa, lớp) + **upload ảnh bìa từ máy** (Multer → `/uploads/`).
3. **Chốt sổ theo ngày nhận sách**: admin chọn ngày giao + lưu ý ngắn gọn; mở lại đăng ký → tự đặt ngày nhận = ngày mai; hiển thị ở banner / form đăng ký / màn hình thành công.
4. **Ngôn ngữ UI thống nhất** gọi là "sách", banner gọn hơn.

## Giai đoạn 5 (v1.2.0) — Khoa CNTT + Quản lý sách + Chốt sổ ngày giao
- [x] T18. `database.js`: DEFAULT/INITIAL_DEPARTMENTS chỉ còn `Khoa CNTT`; xóa sách 2 khoa cũ; thêm `settings.deliveryDate` + `deliveryNote`, `books.year` (kèm migration Neon).
- [x] T19. `server.js`: `POST /api/admin/upload` (Multer), settings nhận `deliveryDate`/`deliveryNote`, toggle-registration tự đặt ngày mai khi mở lại, demo-only `/api/test/simulate-payment`.
- [x] T20. Frontend: banner chốt sổ + ngày nhận sách, tab Quản lý sách (thumbnail ảnh, upload, năm/bản in), đổi nhãn "giáo trình" → "sách".
- [x] T21. Kiểm thử API + cập nhật README / handover / TASKS.

## Mục tiêu đợt trước (v1.1.0)
1. **Phân loại KHOA** (đã rút về còn 1 khoa — CNTT) → soạn list sách cần thiết.
2. **Phân loại LỚP** (danh sách tên lớp do người quản trị tự bổ sung) → gợi ý lớp khi đặt mua & lọc đơn theo lớp.
3. **Phân loại TÊN** → 1 người mua được **nhiều cuốn khác nhau trong 1 đơn / 1 mã QR**, thống kê gộp theo tên.
4. **Update giao diện** + tối ưu tỷ lệ hiển thị **Desktop & Mobile**.

---

## Giai đoạn 1 — Nền tảng dữ liệu (backend)
- [x] T1. Thêm trường `department` (khoa) và `classes` (các lớp học) vào **books**.
- [x] T2. Thêm `departments` (danh sách khoa) và `classes` (danh sách lớp — người dùng tự bổ sung) vào **settings**.
- [x] T3. Nâng cấp **orders** hỗ trợ `items[]` — 1 đơn chứa nhiều cuốn khác nhau (1 mã QR duy nhất).
- [x] T4. Tương thích ngược dữ liệu cũ: đơn cũ chưa có `items`, sách cũ chưa có khoa/lớp, Neon + JSON.
- [x] T5. API quản trị mới: thêm / sửa / xóa giáo trình (`POST/PUT/DELETE /api/admin/books`), cập nhật settings (`PUT /api/admin/settings`).

## Giai đoạn 2 — Luồng mua hàng (frontend sinh viên)
- [x] T6. Bộ lọc giáo trình theo **Khoa** (chips) và theo **Lớp** (dropdown) trên trang chủ.
- [x] T7. **Giỏ hàng đa cuốn**: chọn nhiều sách, tăng/giảm số lượng từng cuốn, thanh toán 1 lần.
- [x] T8. Form đặt mua bổ sung ô **Lớp** (datalist gợi ý từ danh sách lớp + lớp của giáo trình).
- [x] T9. Responsive: mobile 1 cột → tablet 2 cột → desktop 3 cột, container mở rộng `max-w-6xl`.

## Giai đoạn 3 — Bảng quản trị (phân loại & thống kê)
- [x] T10. Tab **Đơn hàng**: tổng hợp số cuốn theo từng khoa + lọc danh sách phát sách theo lớp + tìm tên.
- [x] T11. Tab **Theo tên**: gộp các đơn của cùng 1 người (1 người mua nhiều cuốn khác nhau).
- [x] T12. Tab **Theo lớp**: thống kê sĩ số mua, tổng cuốn, tổng tiền từng lớp.
- [x] T13. Tab **Theo khoa**: xem nhanh *list giáo trình cần thiết* của từng khoa kèm số lượng đã đặt.
- [x] T14. Tab **Quản lý giáo trình**: thêm/sửa/xóa sách (kèm khoa + lớp), quản lý danh sách khoa & lớp.
- [x] T15. Xuất Excel bổ sung cột **Khoa**, **Lớp** + sheet *Theo tên* và *Theo khoa*.

## Giai đoạn 4 — Kiểm thử & bàn giao
- [x] T16. Kiểm thử toàn bộ API ở chế độ Demo (tạo đơn đa cuốn, thống kê, CRUD sách, settings).
- [x] T17. Cập nhật `README.md` + `handover.md` theo cấu trúc dữ liệu mới.

---

## Quy ước dữ liệu (thống nhất toàn dự án)
```js
// BOOK
{ id, title, price, author, pages, year, description, cover,
  department: "Khoa CNTT",          // phân loại khoa (hiện chỉ còn 1 khoa)
  classes: ["CNTT K15", ...] }       // các lớp cần mua cuốn này

// SETTINGS
{ isRegistrationOpen, closeMessage,
  departments: ["Khoa CNTT"],
  classes: [/* người quản trị tự bổ sung tên lớp */],
  deliveryDate: "2026-10-08",        // ngày nhận sách (admin chọn; mở lại đơn → tự = ngày mai)
  deliveryNote: "Sách thường giao ngay hôm sau nếu có tiết." }

// ORDER
{ orderCode, customerName, customerClass, customerPhone,
  items: [{ bookId, bookTitle, department, quantity, unitPrice }], // 1 người mua nhiều cuốn
  quantity /*tổng cuốn*/, amount /*tổng tiền*/, status, isDelivered }
```
