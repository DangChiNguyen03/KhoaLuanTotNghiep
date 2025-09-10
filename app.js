require("dotenv").config();
const express = require("express");
const methodOverride = require("method-override");
const exphbs = require("express-handlebars");
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
require("./config/passport-google");
const flash = require("connect-flash");
const path = require("path");
const logger = require("./middleware/logger");
const { addPermissionsToLocals } = require("./middleware/permissions");
const adminRoutes = require("./routes/admin");
const cartRoutes = require("./routes/cart");
const productRoutes = require("./routes/products");
const userRoutes = require("./routes/users");
const chatbotRoutes = require("./routes/chatbot");
const ordersRouter = require("./routes/orders");
const profileRouter = require("./routes/profile");

const app = express();

// Trust proxy để lấy đúng IP address từ headers
app.set("trust proxy", true);

// Kết nối MongoDB
mongoose
  .connect("mongodb://127.0.0.1:27017/bubble-tea-shop", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB Connected Successfully"))
  .catch((err) => {
    console.error("MongoDB Connection Error:", err);
    process.exit(1);
  });

// Handlebars + Helpers
const hbs = exphbs.create({
  defaultLayout: "main",
  extname: ".hbs",
  layoutsDir: path.join(__dirname, "views", "layouts"),
  partialsDir: path.join(__dirname, "views", "partials"),
  helpers: {
    eq: (a, b) => a === b,
    ne: (a, b) => a !== b,
    or: (a, b) => a || b,
    and: (a, b) => a && b,
    formatDate: function (date) {
      if (!date) return "";
      const d = new Date(date);
      if (isNaN(d.getTime())) return "";
      return d.toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    },
    formatPrice: function (price) {
      return new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
      }).format(price);
    },
    multiply: (a, b) => a * b,
    add: (a, b) => a + b,
    sum: function (array, property) {
      if (!Array.isArray(array)) return 0;
      return array.reduce((total, item) => {
        const value = property ? item[property] : item;
        return total + (typeof value === "number" ? value : 0);
      }, 0);
    },
    // Helper cho pagination và logic
    gt: (a, b) => a > b,
    lt: (a, b) => a < b,
    subtract: (a, b) => a - b,
    range: function (start, end) {
      const result = [];
      for (let i = start; i <= end; i++) {
        result.push(i);
      }
      return result;
    },
    // Helper format ngày giờ chi tiết
    formatDateTime: function (date) {
      if (!date) return "";
      const d = new Date(date);
      if (isNaN(d.getTime())) return "";
      return d.toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    },
    // Helper format ngày cho input date
    formatDateInput: function (date) {
      if (!date) return "";
      const d = new Date(date);
      if (isNaN(d.getTime())) return "";
      return d.toISOString().split("T")[0];
    },
    // Helper cắt chuỗi
    substring: function (str, start, length) {
      if (!str) return "";
      // Convert ObjectId to string if needed
      const stringValue = str.toString();
      return stringValue.substring(start, start + length);
    },
    // Helper section cho layout
    section: function (name, options) {
      if (!this._sections) this._sections = {};
      this._sections[name] = options.fn(this);
      return null;
    },
    // Helper format currency
    formatCurrency: function (amount) {
      if (!amount) return "0 ₫";
      return new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
      }).format(amount);
    },
    // Helper math operations
    add: (a, b) => a + b,
    subtract: (a, b) => a - b,
    multiply: (a, b) => a * b,
    divide: (a, b) => (b !== 0 ? a / b : 0),
    gt: (a, b) => a > b,
    lt: (a, b) => a < b,
    gte: (a, b) => a >= b,
    lte: (a, b) => a <= b,
    // Helper for JSON stringify
    json: function (context) {
      return JSON.stringify(context);
    },
    // Helper for date formatting
    formatDate: function (date) {
      if (!date) return "";
      return new Date(date).toLocaleDateString("vi-VN");
    },
    formatDateTime: function (date) {
      if (!date) return "";
      return new Date(date).toLocaleString("vi-VN");
    },
    formatDateInput: function (date) {
      if (!date) return "";
      return new Date(date).toISOString().split("T")[0];
    },
    calculateAge: function (birthday) {
      if (!birthday) return "";
      const today = new Date();
      const birthDate = new Date(birthday);
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();

      if (
        monthDiff < 0 ||
        (monthDiff === 0 && today.getDate() < birthDate.getDate())
      ) {
        age--;
      }

      return age > 0 ? age + " tuổi" : "Không hợp lệ";
    },
    // Helper for string operations
    truncate: function (str, length) {
      if (!str) return "";
      return str.length > length ? str.substring(0, length) + "..." : str;
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
console.log("📁 Views directory:", path.join(__dirname, "views"));
console.log("📁 Current directory:", __dirname);

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(methodOverride("_method"));
app.use(logger);

// Session
app.use(
  session({
    secret: "secret",
    resave: true,
    saveUninitialized: true,
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

// Admin routes with authentication
const { ensureAuthenticated } = require("./config/auth");
app.use("/admin", ensureAuthenticated, adminRoutes);

app.use("/cart", cartRoutes);
app.use("/orders", ordersRouter);
app.use("/", profileRouter);

// Error handler
app.use((err, req, res, next) => {
  console.error("Global Error Handler:", err);
  res.status(500).render("error", {
    message: err.message || "Đã xảy ra lỗi không xác định.",
  });
});

const PORT = process.env.PORT || 3000;

// Gracefully handle port conflicts
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT}`);
});

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
