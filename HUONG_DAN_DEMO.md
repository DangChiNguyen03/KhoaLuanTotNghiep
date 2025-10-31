# 🎯 HƯỚNG DẪN DEMO WEBSITE YOLOBREW MILK TEA SHOP

## 📋 THÔNG TIN DỰ ÁN

**Tên dự án:** YOLOBrew - Hệ thống quản lý và bán hàng trà sữa trực tuyến  
**Công nghệ:** Node.js, Express, MongoDB, Handlebars, Bootstrap 5  
**Tính năng chính:** E-commerce, Admin Dashboard, AI Chatbot, Payment Gateway, Reports

---

## 🚀 CHUẨN BỊ TRƯỚC KHI DEMO

### 1. ✅ Checklist Kỹ Thuật

```bash
# 1. Kiểm tra MongoDB đang chạy
mongosh mongodb://127.0.0.1:27017/bubble-tea-shop

# 2. Khởi động server
npm start

# 3. Kiểm tra các URL hoạt động
- http://localhost:3000 (Trang chủ)
- http://localhost:3000/admin/login (Admin)
```

### 2. 📊 Chuẩn Bị Dữ Liệu Demo

**Tài khoản Admin:**
- Email: `adminyolobrew@gmail.com`
- Password: `Admin@123`

**Tài khoản User (tạo mới hoặc có sẵn):**
- Email: `user@example.com`
- Password: `User@123`

**Dữ liệu cần có:**
- ✅ Ít nhất 10 sản phẩm (trà sữa, cà phê, topping)
- ✅ 5-10 đơn hàng mẫu với các trạng thái khác nhau
- ✅ 3-5 vouchers đang hoạt động
- ✅ Một số payments đã thanh toán

---

## 🎬 KỊCH BẢN DEMO (30-45 PHÚT)

### PHẦN 1: GIỚI THIỆU TỔNG QUAN (3 phút)

**Nội dung trình bày:**

> "Xin chào thầy/cô, em xin phép trình bày đồ án: **Hệ thống quản lý và bán hàng trà sữa trực tuyến YOLOBrew**
>
> **Mục tiêu:** Xây dựng website thương mại điện tử hoàn chỉnh cho cửa hàng trà sữa, bao gồm:
> - 🛒 Hệ thống bán hàng online cho khách hàng
> - 📊 Hệ thống quản trị toàn diện cho admin
> - 🤖 AI Chatbot hỗ trợ tư vấn 24/7
> - 💳 Tích hợp cổng thanh toán VNPay, MoMo
> - 📈 Báo cáo và phân tích kinh doanh
>
> **Công nghệ sử dụng:**
> - Backend: Node.js + Express.js
> - Database: MongoDB
> - Frontend: Handlebars, Bootstrap 5
> - AI: Google Gemini AI
> - Payment: VNPay, MoMo"

---

### PHẦN 2: DEMO PHÍA KHÁCH HÀNG (10 phút)

#### 2.1 Trang Chủ (2 phút)

**URL:** `http://localhost:3000`

**Điểm nhấn:**
```
✅ Giao diện hiện đại, responsive
✅ Banner slider quảng cáo
✅ Hiển thị sản phẩm nổi bật
✅ Categories (Trà sữa, Cà phê, Trà trái cây)
✅ Chatbot AI góc dưới bên phải
```

**Thao tác:**
1. Scroll trang chủ, giới thiệu layout
2. Click vào các category
3. Hover vào sản phẩm để xem hiệu ứng

#### 2.2 Đăng Ký & Đăng Nhập (2 phút)

**URL:** `http://localhost:3000/users/register`

**Thao tác:**
```
1. Click "Đăng ký" trên navbar
2. Điền form đăng ký:
   - Tên: Nguyễn Văn A
   - Email: demo@example.com
   - Password: Demo@123
   - Phone: 0123456789
3. Submit → Hiển thị thông báo thành công
4. Đăng nhập với tài khoản vừa tạo
```

**Giải thích:**
> "Hệ thống có xác thực người dùng với bcrypt để mã hóa mật khẩu, đảm bảo bảo mật"

#### 2.3 Xem Sản Phẩm & Thêm Vào Giỏ (3 phút)

**URL:** `http://localhost:3000/products`

**Thao tác:**
```
1. Vào trang Products
2. Sử dụng bộ lọc:
   - Lọc theo category
   - Lọc theo giá
   - Tìm kiếm theo tên
3. Click vào 1 sản phẩm → Trang chi tiết
4. Chọn options:
   - Size (S/M/L)
   - Đường (0%, 50%, 100%)
   - Đá (0%, 50%, 100%)
   - Topping (Trân châu, Thạch...)
5. Thêm vào giỏ hàng
6. Thêm thêm 2-3 sản phẩm nữa
```

**Giải thích:**
> "Sản phẩm có thể tùy chỉnh linh hoạt theo sở thích khách hàng. Giá tự động tính toán dựa trên size và topping"

#### 2.4 Giỏ Hàng & Voucher (2 phút)

**URL:** `http://localhost:3000/cart`

**Thao tác:**
```
1. Click icon giỏ hàng trên navbar
2. Xem danh sách sản phẩm đã thêm
3. Thay đổi số lượng
4. Áp dụng voucher:
   - Nhập mã: TRASUACHIEU (nếu đúng giờ)
   - Hoặc: BLACKFRIDAY
5. Xem tổng tiền tự động giảm
6. Click "Thanh toán"
```

**Giải thích:**
> "Hệ thống voucher thông minh, tự động kiểm tra điều kiện áp dụng (thời gian, sản phẩm, ngày trong tuần)"

#### 2.5 Thanh Toán (1 phút)

**URL:** `http://localhost:3000/checkout`

**Thao tác:**
```
1. Điền thông tin giao hàng
2. Chọn phương thức thanh toán:
   - Tiền mặt khi nhận hàng
   - VNPay (demo)
   - MoMo (demo)
3. Xác nhận đơn hàng
4. (Nếu chọn VNPay/MoMo: redirect sang trang thanh toán)
```

**Giải thích:**
> "Tích hợp 2 cổng thanh toán phổ biến tại Việt Nam. Sử dụng sandbox để demo"

---

### PHẦN 3: DEMO AI CHATBOT (3 phút)

**Vị trí:** Góc dưới bên phải mọi trang

**Thao tác:**
```
1. Click icon chatbot
2. Hỏi: "Chào bạn"
   → AI chào và giới thiệu
3. Hỏi: "Menu trà sữa có gì?"
   → AI liệt kê menu từ database
4. Hỏi: "Sản phẩm bán chạy?"
   → AI hiển thị top sản phẩm
5. Hỏi: "Có khuyến mãi gì không?"
   → AI liệt kê vouchers đang hoạt động
6. Hỏi: "Giá trà sữa trân châu?"
   → AI trả lời giá cụ thể
```

**Giải thích:**
> "Chatbot sử dụng Google Gemini AI, tự động lấy dữ liệu từ database (sản phẩm, voucher, best sellers) để trả lời chính xác. Có fallback thông minh khi API lỗi"

---

### PHẦN 4: DEMO HỆ THỐNG ADMIN (20 phút)

#### 4.1 Đăng Nhập Admin (1 phút)

**URL:** `http://localhost:3000/admin/login`

**Thao tác:**
```
Email: adminyolobrew@gmail.com
Password: Admin@123
```

#### 4.2 Dashboard Tổng Quan (3 phút)

**URL:** `http://localhost:3000/admin/dashboard`

**Điểm nhấn:**
```
✅ Thống kê tổng quan (Doanh thu, Đơn hàng, Khách hàng, Sản phẩm)
✅ Biểu đồ doanh thu theo thời gian
✅ Top sản phẩm bán chạy
✅ Đơn hàng gần đây
✅ Thống kê theo trạng thái
```

**Giải thích:**
> "Dashboard cung cấp cái nhìn tổng quan về tình hình kinh doanh. Dữ liệu real-time từ MongoDB aggregation"

#### 4.3 Quản Lý Sản Phẩm (3 phút)

**URL:** `http://localhost:3000/admin/products`

**Thao tác:**
```
1. Xem danh sách sản phẩm
2. Thêm sản phẩm mới:
   - Tên: Trà Sữa Matcha
   - Category: Trà sữa
   - Giá theo size
   - Upload ảnh
   - Mô tả
3. Sửa sản phẩm
4. Xóa sản phẩm (có confirm)
5. Tìm kiếm, lọc
```

**Giải thích:**
> "CRUD đầy đủ cho sản phẩm. Upload ảnh với Multer. Validation đầy vào"

#### 4.4 Quản Lý Đơn Hàng (3 phút)

**URL:** `http://localhost:3000/admin/orders`

**Thao tác:**
```
1. Xem danh sách đơn hàng
2. Lọc theo trạng thái (Pending, Confirmed, Completed, Cancelled)
3. Click vào 1 đơn hàng → Xem chi tiết:
   - Thông tin khách hàng
   - Danh sách sản phẩm
   - Tổng tiền, voucher
   - Lịch sử trạng thái
4. Cập nhật trạng thái đơn hàng
5. In hóa đơn (nếu có)
```

**Giải thích:**
> "Quản lý đơn hàng với workflow rõ ràng. Có thể tracking lịch sử thay đổi"

#### 4.5 Quản Lý Thanh Toán (3 phút)

**URL:** `http://localhost:3000/admin/payments`

**Thao tác:**
```
1. Xem danh sách giao dịch
2. Lọc theo:
   - Trạng thái (Pending, Paid, Failed, Refunded)
   - Phương thức (Cash, VNPay, MoMo)
   - Ngày
3. Click "Xem chi tiết" → Modal hiển thị:
   - Thông tin giao dịch
   - Thông tin khách hàng
   - Thông tin đơn hàng
   - Danh sách sản phẩm
4. Với đơn hàng bị hủy → Hiện nút "Hoàn tiền"
5. Click hoàn tiền → Confirm → Cập nhật trạng thái
```

**Giải thích:**
> "Hệ thống thanh toán chặt chẽ. Chỉ cho phép hoàn tiền khi đơn hàng đã bị hủy. Có audit trail đầy đủ"

#### 4.6 Quản Lý Voucher (2 phút)

**URL:** `http://localhost:3000/admin/vouchers`

**Thao tác:**
```
1. Xem danh sách voucher
2. Tạo voucher mới:
   - Mã: DEMO2024
   - Loại: Giảm theo %
   - Giá trị: 20%
   - Điều kiện:
     * Áp dụng cho: Trà sữa
     * Thời gian: 14h-18h
     * Ngày: Thứ 2-6
   - Số lượng giới hạn
   - Ngày hết hạn
3. Bật/tắt voucher
4. Xóa voucher
```

**Giải thích:**
> "Voucher có thể cấu hình linh hoạt: theo %, theo giá cố định, theo thời gian, theo sản phẩm, theo ngày trong tuần"

#### 4.7 Báo Cáo (5 phút)

**Các loại báo cáo:**

**A. Báo Cáo Doanh Thu**  
**URL:** `http://localhost:3000/admin/reports/payments`

```
✅ Tổng doanh thu theo khoảng thời gian
✅ Biểu đồ xu hướng thanh toán
✅ Thống kê theo phương thức thanh toán
✅ Doanh thu theo giờ trong ngày
✅ Top giao dịch lớn nhất
✅ Giao dịch thất bại
✅ Export JSON/CSV
```

**B. Báo Cáo Sản Phẩm**  
**URL:** `http://localhost:3000/admin/reports/products`

```
✅ Tổng sản phẩm đã bán
✅ Doanh thu theo sản phẩm
✅ Top 20 sản phẩm bán chạy
✅ Biểu đồ doanh thu theo danh mục
```

**C. Báo Cáo Khách Hàng**  
**URL:** `http://localhost:3000/admin/reports/customers`

```
✅ Tổng số khách hàng
✅ Khách hàng mới theo thời gian
✅ Top khách hàng chi tiêu nhiều
✅ Phân tích độ tuổi, giới tính
✅ Tỷ lệ giữ chân khách hàng
```

**D. Báo Cáo Bán Hàng**  
**URL:** `http://localhost:3000/admin/reports/sales`

```
✅ Tổng quan doanh số
✅ So sánh với kỳ trước
✅ Doanh thu theo giờ/ngày/tuần
✅ Phân tích theo danh mục
✅ Hiệu suất phương thức thanh toán
```

**Thao tác:**
```
1. Chọn khoảng thời gian (date range)
2. Áp dụng filter
3. Xem biểu đồ tương tác
4. Export dữ liệu (JSON/CSV)
```

**Giải thích:**
> "Hệ thống báo cáo toàn diện sử dụng MongoDB Aggregation Pipeline. Có thể export để phân tích thêm. Biểu đồ tương tác với Chart.js"

---

### PHẦN 5: TÍNH NĂNG BẢO MẬT & AUDIT (3 phút)

#### 5.1 Quản Lý Người Dùng Hệ Thống

**URL:** `http://localhost:3000/admin/system-users`

```
✅ Danh sách admin/staff
✅ Phân quyền (Admin, Manager, Staff)
✅ Thêm/sửa/xóa user
✅ Bật/tắt tài khoản
```

#### 5.2 Audit Logs

**URL:** `http://localhost:3000/admin/audit-logs`

```
✅ Ghi log mọi hành động quan trọng
✅ Thông tin: User, Action, Resource, IP, Time
✅ Lọc theo user, action, resource
✅ Export logs
```

**Giải thích:**
> "Mọi thao tác quan trọng đều được ghi log để audit. Giúp truy vết khi có sự cố"

#### 5.3 Login Logs

**URL:** `http://localhost:3000/admin/login-logs`

```
✅ Lịch sử đăng nhập
✅ Phát hiện đăng nhập bất thường
✅ Thống kê đăng nhập thất bại
✅ IP tracking
```

---

### PHẦN 6: TÍNH NĂNG NỔI BẬT (3 phút)

#### 6.1 Responsive Design
```
✅ Hoạt động tốt trên mọi thiết bị
✅ Mobile-first approach
✅ Bootstrap 5 grid system
```

**Demo:** Resize browser hoặc mở DevTools mobile view

#### 6.2 Real-time Updates
```
✅ Giỏ hàng cập nhật real-time
✅ Thông báo flash messages
✅ Validation client & server
```

#### 6.3 Performance
```
✅ MongoDB indexing
✅ Aggregation pipeline tối ưu
✅ Lazy loading images
✅ Caching session
```

#### 6.4 Security
```
✅ Password hashing (bcrypt)
✅ Session management
✅ CSRF protection
✅ Input validation & sanitization
✅ Role-based access control
```

---

## 📊 SLIDE THUYẾT TRÌNH (Gợi ý)

### Slide 1: Trang Bìa
```
KHOA LUẬN TỐT NGHIỆP
Hệ thống quản lý và bán hàng trà sữa trực tuyến
YOLOBrew Milk Tea Shop

GVHD: [Tên giáo viên]
SVTH: [Tên bạn]
MSSV: [Mã số]
```

### Slide 2: Mục Tiêu Đề Tài
```
- Xây dựng website thương mại điện tử hoàn chỉnh
- Tích hợp AI chatbot hỗ trợ khách hàng
- Hệ thống quản trị toàn diện
- Báo cáo và phân tích kinh doanh
- Thanh toán online an toàn
```

### Slide 3: Công Nghệ Sử Dụng
```
Backend:
- Node.js + Express.js
- MongoDB + Mongoose
- Passport.js (Authentication)

Frontend:
- Handlebars Template Engine
- Bootstrap 5
- JavaScript ES6+

AI & Payment:
- Google Gemini AI
- VNPay, MoMo Gateway
```

### Slide 4: Kiến Trúc Hệ Thống
```
[Vẽ sơ đồ MVC]
- Models: User, Product, Order, Payment, Voucher
- Views: Handlebars templates
- Controllers: Express routes
- Database: MongoDB
```

### Slide 5: Tính Năng Chính - Khách Hàng
```
✅ Xem sản phẩm, tìm kiếm, lọc
✅ Tùy chỉnh đồ uống (size, đường, đá, topping)
✅ Giỏ hàng & voucher
✅ Thanh toán online (VNPay, MoMo)
✅ Theo dõi đơn hàng
✅ AI Chatbot 24/7
```

### Slide 6: Tính Năng Chính - Admin
```
✅ Dashboard tổng quan
✅ Quản lý sản phẩm, đơn hàng, thanh toán
✅ Quản lý voucher thông minh
✅ Báo cáo đa dạng (4 loại)
✅ Audit logs & security
✅ Phân quyền người dùng
```

### Slide 7: AI Chatbot
```
- Sử dụng Google Gemini AI
- Tự động lấy dữ liệu từ database
- Trả lời về menu, giá, voucher
- Fallback thông minh khi API lỗi
- Hỗ trợ 24/7
```

### Slide 8: Hệ Thống Báo Cáo
```
1. Báo cáo Thanh toán
2. Báo cáo Sản phẩm
3. Báo cáo Khách hàng
4. Báo cáo Bán hàng

- Biểu đồ tương tác
- Export JSON/CSV
- Filter linh hoạt
```

### Slide 9: Bảo Mật
```
✅ Password hashing (bcrypt)
✅ Session management
✅ Role-based access control
✅ Audit trail logging
✅ Input validation
✅ CSRF protection
```

### Slide 10: Kết Quả Đạt Được
```
✅ Website hoạt động ổn định
✅ Giao diện đẹp, UX tốt
✅ Tích hợp đầy đủ tính năng
✅ Bảo mật cao
✅ Hiệu suất tốt
✅ Dễ mở rộng
```

### Slide 11: Hướng Phát Triển
```
- Tích hợp thêm payment gateway
- Mobile app (React Native)
- Hệ thống loyalty points
- Social media integration
- Advanced analytics với ML
- Push notifications
```

### Slide 12: Demo
```
[Chuyển sang demo trực tiếp]
```

### Slide 13: Q&A
```
CẢM ƠN QUÝ THẦY CÔ ĐÃ LẮNG NGHE!

Câu hỏi & Thảo luận
```

---

## 🎤 MẸO THUYẾT TRÌNH

### 1. Chuẩn Bị
```
✅ Test kỹ trước khi demo
✅ Chuẩn bị dữ liệu mẫu đẹp
✅ Bookmark các URL quan trọng
✅ Có plan B nếu mạng/server lỗi
✅ Chuẩn bị câu trả lời cho câu hỏi thường gặp
```

### 2. Trong Khi Demo
```
✅ Nói rõ ràng, tự tin
✅ Giải thích logic/code quan trọng
✅ Nhấn mạnh tính năng nổi bật
✅ Tương tác với giáo viên
✅ Quản lý thời gian tốt
```

### 3. Câu Hỏi Thường Gặp

**Q: Tại sao chọn MongoDB?**
> "MongoDB là NoSQL database phù hợp với dữ liệu linh hoạt như sản phẩm có nhiều biến thể. Dễ scale và có aggregation pipeline mạnh mẽ cho báo cáo"

**Q: AI Chatbot hoạt động như thế nào?**
> "Sử dụng Google Gemini AI với prompt engineering. Tự động lấy dữ liệu real-time từ database (products, vouchers, best sellers) để trả lời chính xác. Có fallback logic khi API lỗi"

**Q: Bảo mật như thế nào?**
> "Sử dụng bcrypt hash password, session-based authentication, role-based access control, audit logging, input validation. Tất cả routes admin đều có middleware kiểm tra quyền"

**Q: Thanh toán online có an toàn không?**
> "Sử dụng sandbox của VNPay và MoMo - các cổng thanh toán uy tín tại VN. Có signature verification để đảm bảo callback hợp lệ"

**Q: Có thể mở rộng không?**
> "Có, kiến trúc MVC rõ ràng, code modular. Dễ dàng thêm features mới, scale database, thêm payment gateway"

---

## 📝 CHECKLIST NGÀY DEMO

### Trước Demo (1 ngày)
```
☐ Test toàn bộ chức năng
☐ Chuẩn bị dữ liệu mẫu
☐ In tài liệu (nếu cần)
☐ Chuẩn bị slide
☐ Rehearsal 2-3 lần
```

### Sáng Ngày Demo
```
☐ Backup database
☐ Khởi động MongoDB
☐ Khởi động server
☐ Test các URL chính
☐ Kiểm tra mạng
☐ Sạc đầy pin laptop
☐ Chuẩn bị adapter/cable
```

### Trong Phòng Demo
```
☐ Kết nối projector/màn hình
☐ Test âm thanh (nếu có)
☐ Mở browser, bookmark URLs
☐ Đăng xuất tất cả accounts
☐ Đóng các app không cần thiết
☐ Tắt notifications
```

---

## 🎯 THỜI GIAN PHÂN BỔ (Tổng 45 phút)

```
00:00 - 03:00  │ Giới thiệu tổng quan
03:00 - 13:00  │ Demo phía khách hàng + Chatbot
13:00 - 33:00  │ Demo admin dashboard
33:00 - 36:00  │ Tính năng bảo mật
36:00 - 39:00  │ Tính năng nổi bật
39:00 - 42:00  │ Tổng kết
42:00 - 45:00  │ Q&A
```

---

## 💡 LỜI KHUYÊN CUỐI CÙNG

1. **Tự tin:** Bạn đã làm một project tốt!
2. **Chuẩn bị kỹ:** Practice makes perfect
3. **Linh hoạt:** Có plan B cho mọi tình huống
4. **Tương tác:** Hỏi giáo viên có câu hỏi không
5. **Thời gian:** Đừng quá dài hoặc quá ngắn
6. **Nhiệt tình:** Thể hiện passion với project

---

## 📞 SUPPORT

Nếu có vấn đề kỹ thuật:
- Kiểm tra MongoDB: `mongosh`
- Kiểm tra server logs: Console
- Restart server: `npm start`
- Clear cache: Ctrl+Shift+R

---

**CHÚC BẠN DEMO THÀNH CÔNG! 🎉**

*"The best way to predict the future is to create it."*
