require("dotenv").config();
const express = require("express");
const exphbs = require("express-handlebars");
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
require("./config/passport-google");
const flash = require("connect-flash");
const path = require("path");
const logger = require("./middleware/logger");
const adminRoutes = require("./routes/admin");
const cartRoutes = require("./routes/cart");
const productRoutes = require("./routes/products");
const userRoutes = require("./routes/users");
const chatbotRoutes = require("./routes/chatbot");
const ordersRouter = require("./routes/orders");
const profileRouter = require("./routes/profile");

const app = express();

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
    or: (a, b) => a || b,
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
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
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
app.use("/admin", adminRoutes);
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
server.on('error', (error) => {
  if (error.syscall !== 'listen') {
    throw error;
  }

  const bind = typeof PORT === 'string' ? `Pipe ${PORT}` : `Port ${PORT}`;

  // Handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      console.error(`${bind} requires elevated privileges`);
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(`${bind} is already in use`);
      console.log('Attempting to use port 3001...');
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
