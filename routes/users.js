const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const passport = require("passport");

// User model
const User = require("../models/User");
const { forwardAuthenticated } = require("../config/auth");
const { logSuccessfulLogin, logFailedLogin, logLogout } = require("../middleware/loginLogger");
const { auditLogin, auditLogout } = require('../middleware/auditTrail');

// ------------------ LOGIN ------------------

// Login Page
router.get("/login", forwardAuthenticated, (req, res) => {
  res.locals.showNavLinks = false; // Ẩn nav-link khi vào trang login
  res.render("login");
});


// Login Handle
const { loginRateLimiter } = require("../middleware/rateLimiter");

router.post("/login", loginRateLimiter, (req, res, next) => {
  passport.authenticate("local", async (err, user, info) => {
    if (err) {
      return next(err);
    }
    
    if (!user) {
      // Log failed login attempt
      await logFailedLogin(req.body.email || req.body.username, req, info.message || 'Invalid credentials');
      // Audit trail for failed login
      req.user = { _id: 'unknown', email: req.body.email || req.body.username };
      await auditLogin(req, false, info.message || 'Invalid credentials');
      req.flash('error_msg', info.message || 'Đăng nhập thất bại');
      return res.redirect("/users/login");
    }
    
    req.logIn(user, async (err) => {
      if (err) {
        return next(err);
      }
      
      try {
        // Log successful login
        console.log('🔄 About to log successful login for:', user.email);
        req.user = user; // Set user for logging middleware
        
        // Call middleware directly with proper parameters
        await new Promise((resolve, reject) => {
          logSuccessfulLogin(req, res, (error) => {
            if (error) reject(error);
            else resolve();
          });
        });
        
        console.log('✅ Finished logging successful login');
        
        // Audit trail for successful login
        await auditLogin(req, true);
        
        req.flash('success_msg', 'Đăng nhập thành công!');
        // Always redirect to homepage after login
        return res.redirect("/");
      } catch (error) {
        console.error('❌ Error in login process:', error);
        req.flash('success_msg', 'Đăng nhập thành công!');
        // Always redirect to homepage even in error case
        return res.redirect("/");
      }
    });
  })(req, res, next);
});

// ------------------ REGISTER ------------------

// Register Page
router.get("/register", forwardAuthenticated, (req, res) => {
  res.locals.showNavLinks = false; // Ẩn nav-link khi vào trang register
  res.render("register");
});

// Register Handle
router.post("/register", async (req, res) => {
  const { name, email, password, password2, birthday, phone, address } = req.body;
  let errors = [];

  // Check required fields
  if (!name || !email || !password || !password2) {
    errors.push({ msg: "Vui lòng điền đầy đủ thông tin" });
  }

  // Check passwords match
  if (password !== password2) {
    errors.push({ msg: "Mật khẩu không khớp" });
  }

  // Check pass length
  if (password.length < 6) {
    errors.push({ msg: "Mật khẩu phải có ít nhất 6 ký tự" });
  }

  if (errors.length > 0) {
    res.locals.showNavLinks = false; // Cần đặt lại nếu render lại register khi có lỗi
    res.render("register", {
      errors,
      name,
      email,
      password,
      password2,
      phone,
      address,
      birthday,
    });
  } else {
    try {
      const user = await User.findOne({ email: email });
      if (user) {
        errors.push({ msg: "Email đã tồn tại" });
        res.locals.showNavLinks = false;
        res.render("register", {
          errors,
          name,
          email,
          password,
          password2,
          phone,
          address,
          birthday,
        });
      } else {
        const newUser = new User({
          name,
          email,
          password,
          birthday: birthday || null,
          phone: phone || '',
          address: address || '',
        });

        // Hash Password
        const salt = await bcrypt.genSalt(10);
        newUser.password = await bcrypt.hash(password, salt);
        await newUser.save();

        req.flash("success_msg", "Đăng ký thành công! Vui lòng đăng nhập");
        res.redirect("/users/login");
      }
    } catch (err) {
      console.error("Error during registration:", err);
      res
        .status(500)
        .render("error", { message: "Đã xảy ra lỗi khi đăng ký tài khoản." });
    }
  }
});

// ------------------ LOGOUT ------------------

router.get("/logout", async (req, res, next) => {
  // Log logout before destroying session
  await logLogout(req, res, () => {});
  // Audit trail for logout
  await auditLogout(req);
  
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    
    // Destroy session completely
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destroy error:', err);
      }
      
      // Clear cookie
      res.clearCookie('connect.sid', { path: '/' });
      
      // Redirect without flash (session already destroyed)
      res.redirect("/users/login");
    });
  });
});

module.exports = router;
