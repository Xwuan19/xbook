# 📋 TASKS — Dự án XBook (Hệ thống đặt sách cho lớp — Khoa CNTT)

> Danh sách task làm việc được chia nhỏ để **tránh vượt limit**, dễ theo dõi và **thống nhất dự án**.
> Quy tắc: làm lần lượt từng task → xong task nào đánh dấu `[x]` task đó → commit theo từng giai đoạn.

## Mục tiêu đợt này (v1.3.3)
1. **Thanh lọc ngày luôn hiển thị** ở mọi tab quản trị (không còn nằm trong tab Đơn hàng).
2. **Tab “Quyết toán” riêng** với 4 thẻ tổng hợp + bảng từng ngày (tỷ trọng, TB/đơn) + nút xuất Excel theo khoảng.
3. Chuyển các nút lọc/ngày sang **event delegation** để chạy thật & test được.

## Giai đoạn 9 (v1.3.3) — Thanh lọc dùng chung + tab Quyết toán
- [x] T36. `public/index.html`: di chuyển khối lọc ngày lên header (trên thanh tab), thêm nút *Xem quyết toán từng ngày*, thêm tab + panel **Quyết toán** (4 thẻ, bảng có cột tỷ trọng & TB/đơn).
- [x] T37. `public/app.js`: `initAdminDelegatedEvents()` (delegation cho chip ngày/chip mốc/dòng ngày/nút chuyển tab), `initApp()` chạy cả khi script nạp sau DOMContentLoaded; thẻ tổng hợp + thanh tỷ trọng tính theo khoảng đang lọc.
- [x] T38. `public/sw.js`: bump cache tĩnh v3 → v4 để máy đã cài PWA nhận giao diện mới.
- [x] T39. Kiểm thử: 11 bài pass, trong đó test 11 nay **bấm thật** chip/ngày (trước đây `onclick` inline không chạy trong jsdom nên là no-op).
- [x] T40. Cập nhật README (mục 13) / handover / TASKS + version 1.3.3.

## Mục tiêu đợt trước (v1.3.2)
1. **Lọc đơn theo ngày đặt hàng / ngày thanh toán** để quyết toán trong từng ngày.
2. **Bảng quyết toán theo ngày** (đơn · cuốn · doanh thu) + bấm một ngày để lọc; xuất Excel theo khoảng ngày.

## Giai đoạn 8 (v1.3.2) — Lọc theo ngày & Quyết toán từng ngày
- [x] T31. `public/app.js`: state `adminDatePreset/adminDateFrom/adminDateTo/adminDateBasis` + helper thuần (`localDateKey`, `orderFilterDateKey`, `filterOrdersByAdminDate`, `groupOrdersByDay`, `computeBookSummary`, `adminDateFilterState`).
- [x] T32. `public/index.html`: khối “Lọc theo ngày” trong tab Đơn hàng (chips khoảng ngày, Từ/Đến, chips loại ngày, dòng tóm tắt, bảng quyết toán từng ngày) + cột **Ngày đặt** trong bảng phát sách.
- [x] T33. Áp dụng bộ lọc cho toàn bộ tab (Đơn hàng, Theo tên, Theo lớp, Theo khoa, tổng tiền, số cuốn) qua `renderAdminTabsWithFilter()`.
- [x] T34. Excel: bám khoảng đang lọc, thêm sheet **Quyết Toán Theo Ngày** + cột Ngày Đặt, tên file riêng khi đang lọc.
- [x] T35. Kiểm thử (11 bài pass) + tài liệu (README mục 13, handover, TASKS) + version 1.3.2.

## Mục tiêu đợt trước (v1.3.1)
1. **Chọn lớp đồng bộ giao diện web**: bỏ toàn bộ list mặc định của trình duyệt (`<select>`), dùng dropdown tự vẽ cho mọi ô chọn khoa/lớp.
2. **Bắt buộc Họ tên + Số điện thoại + Lớp học** khi mua sách (chặn ở cả form lẫn API).

## Giai đoạn 7 (v1.3.1) — Dropdown tự vẽ + Bắt buộc thông tin người mua
- [x] T27. `public/app.js`: component `XBookSelect` (panel chia nhóm theo khoa, tìm nhanh bỏ dấu, bàn phím, bấm ra ngoài tự đóng) + thay 7 ô chọn khoa/lớp trong toàn bộ giao diện.
- [x] T28. `public/index.html`: bỏ hết `<select>`, thêm ô lỗi tại chỗ cho Tên / SĐT / Lớp và cảnh báo khi chưa khai báo lớp.
- [x] T29. `server.js`: bắt buộc Họ tên (≥2 từ) + SĐT (10 số, chuẩn hóa `+84`) + Lớp thuộc danh sách khoa/lớp → 400 khi thiếu/sai.
- [x] T30. Kiểm thử (10 bài pass) + cập nhật README / handover / TASKS / version 1.3.1.

## Mục tiêu đợt trước (v1.3.0)
1. **Sách là danh mục chung, không thuộc khoa nào** — add sách vào **khoa/lớp** = đánh dấu *sách cần học của (các) lớp đó* (tích cả khoa, hoặc chọn từng lớp).
2. **Ghi nhớ đăng nhập** cho admin (token phiên 30 ngày, không phải nhập lại mật khẩu).
3. **PWA trên iPhone**: manifest + service worker + icon, cài ra màn hình chính chạy toàn màn hình.

## Giai đoạn 6 (v1.3.0) — Sách gắn Khoa/Lớp + Phiên đăng nhập + PWA
- [x] T22. `public/domain.js`: `bookScope()` + `assignBookToClasses()` (tích khoa → mọi lớp; tích lớp lẻ → lớp đó; bỏ tích → gỡ).
- [x] T23. `server.js`: token phiên HMAC (`x-admin-token`), `POST /api/admin/logout`, `applyBookScope()` cho `POST/PUT /api/admin/books`, route `/manifest.webmanifest` + `/sw.js`.
- [x] T24. Frontend: tích “Ghi nhớ đăng nhập (30 ngày)”, `adminFetch()` tự gắn token/401 → đăng nhập lại, khối “Sách này cần học ở khoa / lớp nào?”, bộ lọc thư viện sách.
- [x] T25. PWA: `manifest.webmanifest`, `sw.js`, `icons/` (192/512/maskable), meta iOS + gợi ý “Thêm vào Màn hình chính”.
- [x] T26. Kiểm thử (`npm test` — 9 bài pass) + cập nhật README / handover / TASKS / .env.example.

## Mục tiêu đợt trước (v1.2.0)
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
