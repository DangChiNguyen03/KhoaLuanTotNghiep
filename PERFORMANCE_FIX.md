# 🚀 HƯỚNG DẪN TỐI ƯU HIỆU NĂNG

## 🐌 VẤN ĐỀ HIỆN TẠI

Web bị lag nghiêm trọng do:
1. **Quá nhiều populate() không cần thiết**
2. **Không có index cho các trường tìm kiếm**
3. **Query không tối ưu**
4. **Không cache session**

---

## ✅ GIẢI PHÁP NHANH (ƯU TIÊN CAO)

### 1. TẠO INDEX CHO DATABASE

Chạy script này để tạo index:

```javascript
// scripts/create-indexes.js
const mongoose = require('mongoose');

mongoose.connect('mongodb://127.0.0.1:27017/bubble-tea-shop')
  .then(async () => {
    console.log('🔄 Creating indexes...');
    
    const db = mongoose.connection.db;
    
    // User indexes
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('users').createIndex({ role: 1 });
    await db.collection('users').createIndex({ isLocked: 1 });
    
    // Order indexes
    await db.collection('orders').createIndex({ user: 1, createdAt: -1 });
    await db.collection('orders').createIndex({ status: 1, createdAt: -1 });
    await db.collection('orders').createIndex({ paymentStatus: 1 });
    await db.collection('orders').createIndex({ createdAt: -1 });
    
    // Product indexes
    await db.collection('products').createIndex({ category: 1 });
    await db.collection('products').createIndex({ name: 'text' });
    
    // Payment indexes
    await db.collection('payments').createIndex({ order: 1 });
    await db.collection('payments').createIndex({ user: 1, createdAt: -1 });
    await db.collection('payments').createIndex({ status: 1 });
    
    // LoginLog indexes
    await db.collection('loginlogs').createIndex({ user: 1, loginTime: -1 });
    await db.collection('loginlogs').createIndex({ loginTime: -1 });
    await db.collection('loginlogs').createIndex({ success: 1 });
    
    // AuditLog indexes
    await db.collection('auditlogs').createIndex({ user: 1, timestamp: -1 });
    await db.collection('auditlogs').createIndex({ timestamp: -1 });
    await db.collection('auditlogs').createIndex({ action: 1 });
    
    console.log('✅ All indexes created!');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
```

**Chạy ngay:**
```bash
node scripts/create-indexes.js
```

---

### 2. TỐI ƯU SESSION STORE

Sửa `app.js` dòng 220-230:

```javascript
// CŨ:
app.use(
  session({
    secret: process.env.SESSION_SECRET || "secret",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: "mongodb://127.0.0.1:27017/bubble-tea-shop",
    }),
    cookie: { maxAge: 1000 * 60 * 60 * 24 },
  })
);

// MỚI (TỐI ƯU):
app.use(
  session({
    secret: process.env.SESSION_SECRET || "secret",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: "mongodb://127.0.0.1:27017/bubble-tea-shop",
      touchAfter: 24 * 3600, // Chỉ update session 1 lần/ngày
      crypto: {
        secret: process.env.SESSION_SECRET || "secret"
      }
    }),
    cookie: { 
      maxAge: 1000 * 60 * 60 * 24,
      httpOnly: true,
      secure: false // Đổi thành true nếu dùng HTTPS
    },
  })
);
```

---

### 3. GIẢM POPULATE() KHÔNG CẦN THIẾT

#### A. Dashboard (routes/admin.js dòng 746)

**CŨ:**
```javascript
Order.find({ paymentStatus: 'paid' }).populate('items.product', 'name')
```

**MỚI:**
```javascript
Order.find({ paymentStatus: 'paid' }).select('totalPrice items')
// Không cần populate nếu chỉ tính tổng
```

#### B. Quản lý đơn hàng (routes/admin.js dòng 856-859)

**CŨ:**
```javascript
orders = await Order.find(query)
    .populate('user', 'name email phone')
    .populate('items.product', 'name image')
    .populate('items.toppings', 'name')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
```

**MỚI:**
```javascript
orders = await Order.find(query)
    .populate('user', 'name email') // Bỏ phone
    .populate('items.product', 'name') // Bỏ image
    // Bỏ populate toppings
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean(); // Thêm lean() để tăng tốc
```

---

### 4. THÊM .lean() CHO QUERY CHỈ ĐỌC

Tất cả query chỉ để hiển thị (không update) nên thêm `.lean()`:

```javascript
// VÍ DỤ:
const orders = await Order.find(query)
    .populate('user', 'name')
    .sort({ createdAt: -1 })
    .lean(); // ← THÊM NÀY
```

**Lợi ích:** Tăng tốc 2-3 lần!

---

### 5. GIẢM LIMIT QUERY

Nhiều chỗ query quá nhiều records:

```javascript
// CŨ:
.limit(5000) // ← QUÁ NHIỀU!

// MỚI:
.limit(100) // Hoặc 50
```

---

## 🎯 CÁC FILE CẦN SỬA

### Ưu tiên 1 (Sửa ngay):
1. ✅ Chạy script tạo index
2. ✅ Sửa session store trong `app.js`
3. ✅ Thêm `.lean()` vào `routes/admin.js`:
   - Dòng 746 (Dashboard)
   - Dòng 856 (Quản lý đơn hàng)
   - Dòng 1083 (Quản lý thanh toán)
   - Dòng 1440 (System users)
   - Dòng 1846 (Audit logs)

### Ưu tiên 2:
4. Giảm populate không cần thiết
5. Giảm limit từ 5000 → 100

---

## 📊 KẾT QUẢ DỰ KIẾN

- ⚡ Đăng nhập: **5s → 0.5s** (nhanh hơn 10 lần)
- ⚡ Load đơn hàng: **10s → 1s** (nhanh hơn 10 lần)
- ⚡ Dashboard: **8s → 1s** (nhanh hơn 8 lần)

---

## 🚀 CHẠY NGAY

```bash
# 1. Tạo index
node scripts/create-indexes.js

# 2. Restart server
npm start
```

---

**Sau khi làm xong, báo tôi để tôi hướng dẫn tiếp!**
