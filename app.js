require("dotenv").config();
const express = require("express");
const methodOverride = require("method-override");
const exphbs = require("express-handlebars");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const compression = require("compression");
const passport = require("passport");
const flash = require("connect-flash");
const path = require("path");
const logger = require("./middleware/logger");
const { addPermissionsToLocals } = require("./middleware/permissions");
const { autoCleanupMiddleware } = require("./middleware/autoCleanup");
const adminRoutes = require("./routes/admin");
const cartRoutes = require("./routes/cart");
const productRoutes = require("./routes/products");
const userRoutes = require("./routes/users");
const chatbotRoutes = require("./routes/chatbot");
const ordersRouter = require("./routes/orders");
const profileRouter = require("./routes/profile");
const paymentRoutes = require("./routes/payment");

const app = express();

// Trust proxy để lấy đúng IP address từ headers
app.set("trust proxy", true);

// Kết nối MongoDB với connection pooling
mongoose
  .connect("mongodb://127.0.0.1:27017/bubble-tea-shop", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    maxPoolSize: 10, // Tối đa 10 connections
    minPoolSize: 2,  // Tối thiểu 2 connections
    socketTimeoutMS: 45000,
    serverSelectionTimeoutMS: 5000,
  })
  .then(() => console.log("✅ MongoDB Connected Successfully with pooling"))
  .catch((err) => {
    console.error("❌ MongoDB Connection Error:", err);
    process.exit(1);
  });

// Handlebars + Helpers
const hbs = exphbs.create({
  defaultLayout: "main",
  extname: ".hbs",
  layoutsDir: path.join(__dirname, "views", "layouts"),
  partialsDir: path.join(__dirname, "views", "partials"),
  helpers: {
    // Comparison Helpers
    eq: (a, b) => a === b,
    ne: (a, b) => a !== b,
    or: function() {
      // Support multiple arguments
      return Array.prototype.slice.call(arguments, 0, -1).some(Boolean);
    },
    and: function() {
      // Support multiple arguments
      return Array.prototype.slice.call(arguments, 0, -1).every(Boolean);
    },
    gt: (a, b) => a > b,
    lt: (a, b) => a < b,
    gte: (a, b) => a >= b,
    lte: (a, b) => a <= b,

    // Math Helpers
    add: (a, b) => (a || 0) + (b || 0),
    subtract: (a, b) => a - b,
    multiply: (a, b) => a * b,
    divide: (a, b) => (b !== 0 ? Math.round(a / b) : 0),
    divideFloat: (a, b) => (b !== 0 ? a / b : 0),
    round: (num, decimals) => parseFloat(num).toFixed(decimals || 0),
    sum: function (array, property) {
      if (!Array.isArray(array)) return 0;
      return array.reduce((total, item) => {
        const value = property ? item[property] : item;
        return total + (typeof value === "number" ? value : 0);
      }, 0);
    },

    // Formatting Helpers
    formatDate: function (date) {
      if (!date) return "";
      const d = new Date(date);
      if (isNaN(d.getTime())) return "";
      const day = String(d.getUTCDate()).padStart(2, '0');
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const year = d.getUTCFullYear();
      return `${day}/${month}/${year}`;
    },
    formatPrice: function (price) {
      return new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
      }).format(price);
    },
    formatDateTime: function (date) {
      if (!date) return "";
      const d = new Date(date);
      if (isNaN(d.getTime())) return "";
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const seconds = String(d.getSeconds()).padStart(2, '0');
      return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
    },
    formatTime: function (date) {
      if (!date) return "";
      const d = new Date(date);
      if (isNaN(d.getTime())) return "";
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const seconds = String(d.getSeconds()).padStart(2, '0');
      return `${hours}:${minutes}:${seconds}`;
    },
    formatCurrency: function (amount) {
      if (!amount && amount !== 0) return "0 ₫";
      return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
    },
    formatDateInput: function (date) {
      if (!date) return "";
      const d = new Date(date);
      if (isNaN(d.getTime())) return "";
      return d.toISOString().split("T")[0];
    },
    getCurrentDate: () => new Date().toISOString().split("T")[0],
    
    // Debug Helper
    json: (obj) => JSON.stringify(obj, null, 2),

    // String & Array Helpers
    substring: function (str, start, length) {
      if (!str) return "";
      const stringValue = str.toString();
      return stringValue.substring(start, start + length);
    },
    truncate: function (str, length) {
      if (!str) return "";
      return str.length > length ? str.substring(0, length) + "..." : str;
    },
    json: (context) => JSON.stringify(context),

    // Logic Helpers
    range: function (start, end) {
      const result = [];
      for (let i = start; i <= end; i++) {
        result.push(i);
      }
      return result;
    },
    calculateAge: function (birthday) {
      if (!birthday) return "";
      const today = new Date();
      const birthDate = new Date(birthday);
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      return age > 0 ? age + " tuổi" : "Không hợp lệ";
    },

    // Layout Helper
    section: function (name, options) {
      if (!this._sections) this._sections = {};
      this._sections[name] = options.fn(this);
      return null;
    },

    // Price Helper - Consistent price calculation for products and toppings
    getPrice: function (product) {
      if (!product) return 0;
      // For toppings, use price field first, then sizes[0].price as fallback
      if (product.category === 'Topping') {
        return product.price || (product.sizes && product.sizes[0] ? product.sizes[0].price : 0);
      }
      // For regular products, return price field if exists
      return product.price || 0;
    },

    // Sum topping prices consistently
    sumToppingPrices: function (toppings, size) {
      if (!Array.isArray(toppings)) return 0;
      return toppings.reduce((total, topping) => {
        // For toppings, try to get size-specific price first, then fallback to direct price
        let toppingPrice = 0;
        if (size && topping.sizes && Array.isArray(topping.sizes)) {
          const sizeObj = topping.sizes.find(s => s.size === size);
          toppingPrice = sizeObj ? sizeObj.price : (topping.price || 8000);
        } else {
          toppingPrice = topping.price || 8000;
        }
        return total + toppingPrice;
      }, 0);
    },

    // Math Helpers for payment statistics
    percentage: function (part, total) {
      if (!total || total === 0) return 0;
      return Math.round(((part || 0) / total) * 100);
    },
  },
  runtimeOptions: {
    allowProtoPropertiesByDefault: true,
    allowProtoMethodsByDefault: true,
  },
});

app.engine(".hbs", hbs.engine);
app.set("view engine", ".hbs");
app.set("views", path.join(__dirname, "views"));

// Middleware
app.use(compression()); // Nén response để giảm bandwidth
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, "public"), {
  maxAge: '1d', // Cache static files 1 ngày
  etag: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(methodOverride("_method"));
app.use(logger);

// Middleware để ngăn Cloudflare cache cookie
app.use((req, res, next) => {
  // Ngăn Cloudflare cache các trang có session/cookie
  res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Session với MongoStore (production-ready)
app.use(
  session({
    secret: process.env.SESSION_SECRET || "secret",
    resave: false, // Không save session nếu không thay đổi
    saveUninitialized: false, // Không tạo session cho user chưa login
    name: 'connect.sid', // Tên cookie session
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/bubble-tea-shop",
      crypto: {
        secret: process.env.SESSION_SECRET || "secret"
      },
      ttl: 7 * 24 * 60 * 60, // 7 ngày
      autoRemove: 'native', // Tự động xóa session hết hạn
      touchAfter: 0 // Tắt touchAfter để tránh conflict với rolling
    }),
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 ngày
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // HTTPS trong production
      sameSite: 'lax', // 'lax' cho same-site requests
      path: '/' // Đảm bảo cookie áp dụng cho toàn bộ site
      // Không cần set domain - để browser tự động xử lý
    },
    rolling: false, // TẮT rolling để tránh race condition
    unset: 'destroy' // Destroy session khi unset
  })
);

// Passport
require("./config/passport")(passport);
app.use(passport.initialize());
app.use(passport.session());

// Flash
app.use(flash());

// Permissions middleware for templates
app.use(addPermissionsToLocals);

// Welcome notification middleware
const welcomeNotification = require('./middleware/welcomeNotification');
app.use(welcomeNotification);

// ✅ Gán các biến global cho views
app.use((req, res, next) => {
  res.locals.success_msg = req.flash("success_msg");
  res.locals.error_msg = req.flash("error_msg");
  res.locals.error = req.flash("error");
  res.locals.user = req.user || null;
  res.locals.currentPath = req.path; // ✅ Để navbar biết đang ở login/register
  next();
});

// Routes
app.use("/", require("./routes/index"));
app.use("/users", userRoutes);
app.use("/api/chatbot", chatbotRoutes);
app.use("/products", productRoutes);

// Admin routes - authentication handled by individual routes
app.use("/admin", adminRoutes);

app.use("/cart", cartRoutes);
app.use("/orders", ordersRouter);
app.use("/payment", paymentRoutes);
app.use("/profile", profileRouter);

// Error handler
app.use((err, req, res, next) => {
  console.error("Global Error Handler:", err);
  res.status(500).render("error", {
    message: err.message || "Đã xảy ra lỗi không xác định.",
  });
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Listen trên tất cả IPv4 interfaces

// Gracefully handle port conflicts
const server = app.listen(PORT, HOST, () => {
  console.log(`Server running on ${HOST}:${PORT}`);
  console.log(`Visit http://localhost:${PORT}`);
  
  // Khởi động auto cleanup sau khi server ready
  autoCleanupMiddleware();
});

// Setup Socket.io
const { Server } = require('socket.io');
const io = new Server(server);

// Store connected users by role
const connectedUsers = {
  admin: new Set(),
  manager: new Set(),
  staff: new Set()
};

io.on('connection', (socket) => {
  console.log('👤 User connected:', socket.id);
  
  // User registers their role
  socket.on('register', (data) => {
    const { role, userId } = data;
    if (role && (role === 'admin' || role === 'manager' || role === 'staff')) {
      socket.role = role;
      socket.userId = userId;
      connectedUsers[role].add(socket.id);
      console.log(`✅ ${role} registered: ${socket.id}`);
    }
  });
  
  socket.on('disconnect', () => {
    if (socket.role) {
      connectedUsers[socket.role].delete(socket.id);
      console.log(`👋 ${socket.role} disconnected: ${socket.id}`);
    }
  });
});

// Export io để dùng trong các routes khác
app.set('io', io);

// Handle server errors
server.on("error", (error) => {
  if (error.syscall !== "listen") {
    throw error;
  }

  const bind = typeof PORT === "string" ? `Pipe ${PORT}` : `Port ${PORT}`;

  // Handle specific listen errors with friendly messages
  switch (error.code) {
    case "EACCES":
      console.error(`${bind} requires elevated privileges`);
      process.exit(1);
      break;
    case "EADDRINUSE":
      console.error(`${bind} is already in use`);
      console.log("Attempting to use port 3001...");
      const altPort = 3001;
      app.listen(altPort, () => {
        console.log(`Server running on port ${altPort}`);
        console.log(`Visit http://localhost:${altPort}`);
      });
      break;
    default:
      throw error;
  }
});
