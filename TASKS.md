# 📋 TASKS — Dự án XBook (Hệ thống bán giáo trình theo Khoa / Lớp / Tên)

> Danh sách task làm việc được chia nhỏ để **tránh vượt limit**, dễ theo dõi và **thống nhất dự án**.
> Quy tắc: làm lần lượt từng task → xong task nào đánh dấu `[x]` task đó → commit theo từng giai đoạn.

## Mục tiêu đợt này
1. **Phân loại KHOA** (VD: Khoa CNTT, Khoa Kế toán…) → dễ dàng soạn ra list giáo trình cần thiết theo từng khoa.
2. **Phân loại LỚP** (danh sách tên lớp do người quản trị tự bổ sung) → gợi ý lớp khi đặt mua & lọc đơn theo lớp.
3. **Phân loại TÊN** → 1 người mua được **nhiều cuốn khác nhau trong 1 đơn / 1 mã QR**, thống kê gộp theo tên.
4. **Update giao diện** + tối ưu tỷ lệ hiển thị **Desktop & Mobile**.

---

## Giai đoạn 1 — Nền tảng dữ liệu (backend)
- [ ] T1. Thêm trường `department` (khoa) và `classes` (các lớp học) vào **books**.
- [ ] T2. Thêm `departments` (danh sách khoa) và `classes` (danh sách lớp — người dùng tự bổ sung) vào **settings**.
- [ ] T3. Nâng cấp **orders** hỗ trợ `items[]` — 1 đơn chứa nhiều cuốn khác nhau (1 mã QR duy nhất).
- [ ] T4. Tương thích ngược dữ liệu cũ: đơn cũ chưa có `items`, sách cũ chưa có khoa/lớp, Neon + JSON.
- [ ] T5. API quản trị mới: thêm / sửa / xóa giáo trình (`POST/PUT/DELETE /api/admin/books`), cập nhật settings (`PUT /api/admin/settings`).

## Giai đoạn 2 — Luồng mua hàng (frontend sinh viên)
- [ ] T6. Bộ lọc giáo trình theo **Khoa** (chips) và theo **Lớp** (dropdown) trên trang chủ.
- [ ] T7. **Giỏ hàng đa cuốn**: chọn nhiều sách, tăng/giảm số lượng từng cuốn, thanh toán 1 lần.
- [ ] T8. Form đặt mua bổ sung ô **Lớp** (datalist gợi ý từ danh sách lớp + lớp của giáo trình).
- [ ] T9. Responsive: mobile 1 cột → tablet 2 cột → desktop 3 cột, container mở rộng `max-w-6xl`.

## Giai đoạn 3 — Bảng quản trị (phân loại & thống kê)
- [ ] T10. Tab **Đơn hàng**: tổng hợp số cuốn theo từng khoa + lọc danh sách phát sách theo lớp + tìm tên.
- [ ] T11. Tab **Theo tên**: gộp các đơn của cùng 1 người (1 người mua nhiều cuốn khác nhau).
- [ ] T12. Tab **Theo lớp**: thống kê sĩ số mua, tổng cuốn, tổng tiền từng lớp.
- [ ] T13. Tab **Theo khoa**: xem nhanh *list giáo trình cần thiết* của từng khoa kèm số lượng đã đặt.
- [ ] T14. Tab **Quản lý giáo trình**: thêm/sửa/xóa sách (kèm khoa + lớp), quản lý danh sách khoa & lớp.
- [ ] T15. Xuất Excel bổ sung cột **Khoa**, **Lớp** + sheet *Theo tên* và *Theo khoa*.

## Giai đoạn 4 — Kiểm thử & bàn giao
- [ ] T16. Kiểm thử toàn bộ API ở chế độ Demo (tạo đơn đa cuốn, thống kê, CRUD sách, settings).
- [ ] T17. Cập nhật `README.md` + `handover.md` theo cấu trúc dữ liệu mới.

---

## Quy ước dữ liệu (thống nhất toàn dự án)
```js
// BOOK
{ id, title, price, author, pages, description, cover,
  department: "Khoa CNTT",          // phân loại khoa
  classes: ["CNTT K15", ...] }       // các lớp cần mua cuốn này

// SETTINGS
{ isRegistrationOpen, closeMessage,
  departments: ["Đại cương", "Khoa CNTT", "Khoa Kế toán"],
  classes: [/* người quản trị tự bổ sung tên lớp */] }

// ORDER
{ orderCode, customerName, customerClass, customerPhone,
  items: [{ bookId, bookTitle, department, quantity, unitPrice }], // 1 người mua nhiều cuốn
  quantity /*tổng cuốn*/, amount /*tổng tiền*/, status, isDelivered }
```
