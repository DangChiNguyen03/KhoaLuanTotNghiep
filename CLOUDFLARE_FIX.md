# 🚨 SỬA LỖI CLOUDFLARE CACHE SESSION

---

## 🐛 VẤN ĐỀ NGHIÊM TRỌNG:

### **Session bị share giữa các máy khác nhau!**
- Máy 1 login user A → OK
- Máy 2 login user B → Vào luôn user A ❌
- **→ Cloudflare đang CACHE cookie session!**

### **Nguyên nhân:**
Cloudflare proxy đang cache response kèm cookie `connect.sid`
→ Tất cả user nhận cùng 1 cookie
→ Tất cả user dùng chung session!

---

## ✅ GIẢI PHÁP:

### **1. Thêm Cache-Control Headers** (`app.js`)

```javascript
// Middleware để ngăn Cloudflare cache cookie
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});
```

**Giải thích:**
- `private` - Chỉ browser cache, không proxy/CDN
- `no-cache` - Phải revalidate mỗi lần
- `no-store` - Không lưu cache
- `must-revalidate` - Bắt buộc check với server

---

### **2. Cấu hình Cloudflare Page Rules**

**Trên Cloudflare Dashboard:**

1. Vào **Rules** → **Page Rules**
2. Tạo rule mới:

```
URL: yolobrew.info.vn/*
Settings:
  - Cache Level: Bypass
  - Browser Cache TTL: Respect Existing Headers
```

3. **Save and Deploy**

**HOẶC tốt hơn:**

```
URL: yolobrew.info.vn/users/login*
Settings:
  - Cache Level: Bypass
  
URL: yolobrew.info.vn/admin/*
Settings:
  - Cache Level: Bypass
```

---

### **3. Tắt Cloudflare Cache cho Dynamic Content**

**Cloudflare Dashboard:**

1. **Caching** → **Configuration**
2. **Caching Level:** `Standard` (không phải Aggressive)
3. **Browser Cache TTL:** `Respect Existing Headers`

---

## 🚀 DEPLOY:

### **BƯỚC 1: Upload code mới**
```bash
git pull origin main
```

### **BƯỚC 2: XÓA TẤT CẢ SESSION (QUAN TRỌNG!)**
```bash
node scripts/clear-all-sessions.js
```

### **BƯỚC 3: Restart server**
```bash
pm2 restart app
```

### **BƯỚC 4: Purge Cloudflare Cache**

**Trên Cloudflare Dashboard:**
1. **Caching** → **Configuration**
2. **Purge Everything**
3. Confirm

**HOẶC dùng API:**
```bash
curl -X POST "https://api.cloudflare.com/client/v4/zones/YOUR_ZONE_ID/purge_cache" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"purge_everything":true}'
```

---

## 🧪 KIỂM TRA:

### **Test từ 2 máy khác nhau:**

**Máy 1:**
1. Mở Incognito
2. Vào `https://yolobrew.info.vn`
3. Login user A
4. Check: Phải vào được user A

**Máy 2:**
1. Mở Incognito
2. Vào `https://yolobrew.info.vn`
3. Login user B
4. Check: Phải vào được user B (KHÔNG PHẢI user A!)

---

### **Check Response Headers:**

**Chrome DevTools (F12):**
1. Tab **Network**
2. Login
3. Click request `/users/login`
4. Tab **Headers**

**Phải thấy:**
```
Response Headers:
Cache-Control: private, no-cache, no-store, must-revalidate
Pragma: no-cache
Expires: 0
Set-Cookie: connect.sid=...; Path=/; HttpOnly; Secure; SameSite=Lax
```

**Tab Application → Cookies:**
- Mỗi máy phải có cookie `connect.sid` KHÁC NHAU!

---

## 🔍 DEBUG:

### **Check cookie trên 2 máy:**

**Máy 1:**
```javascript
// Console
document.cookie
// → connect.sid=ABC123...
```

**Máy 2:**
```javascript
// Console
document.cookie
// → connect.sid=XYZ789...  ← PHẢI KHÁC!
```

**Nếu 2 máy có cùng cookie:**
→ Cloudflare vẫn đang cache!

---

### **Check Cloudflare Cache Status:**

**Response Headers phải có:**
```
cf-cache-status: DYNAMIC
```

**KHÔNG được có:**
```
cf-cache-status: HIT  ← Đang cache!
```

---

## ⚠️ LƯU Ý:

### **Cloudflare Page Rules Priority:**

Rules được áp dụng từ trên xuống dưới. Đảm bảo:

1. **Bypass cache cho login/admin** (ưu tiên cao)
2. **Cache static files** (ưu tiên thấp)

**Ví dụ:**
```
Priority 1: yolobrew.info.vn/users/* → Bypass
Priority 2: yolobrew.info.vn/admin/* → Bypass
Priority 3: yolobrew.info.vn/*.jpg → Cache Everything
```

---

### **Nếu vẫn lỗi:**

1. **Tắt Cloudflare proxy tạm thời:**
   - DNS → Click icon cloud (chuyển sang grey)
   - Test xem còn lỗi không
   - Nếu hết lỗi → Chắc chắn do Cloudflare

2. **Dùng Development Mode:**
   - Cloudflare Dashboard → **Quick Actions**
   - **Development Mode: ON**
   - Test trong 3 giờ (tự tắt sau 3h)

---

## 📊 MONITORING:

### **Check session trên MongoDB:**

```bash
node scripts/test-session.js
```

**Phải thấy:**
- Mỗi user có 1 session riêng
- Session ID khác nhau
- Không có duplicate

---

## 🎯 CHECKLIST:

- [ ] Code mới đã upload (có Cache-Control headers)
- [ ] Server đã restart
- [ ] Cloudflare cache đã purge
- [ ] Cloudflare Page Rules đã set (Bypass cho /users/*, /admin/*)
- [ ] Tất cả sessions cũ đã xóa
- [ ] Test từ 2 máy khác nhau
- [ ] Mỗi máy có cookie khác nhau
- [ ] Login user A trên máy 1 → Vào user A
- [ ] Login user B trên máy 2 → Vào user B (không phải A!)
- [ ] Response headers có `Cache-Control: private, no-cache`
- [ ] Response headers có `cf-cache-status: DYNAMIC`

---

**ĐÂY LÀ LỖI NGHIÊM TRỌNG VỀ BẢO MẬT!**
**PHẢI SỬA NGAY!**

Deploy và test từ 2 máy khác nhau ngay! 🚨
