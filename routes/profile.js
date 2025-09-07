const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { ensureAuthenticated } = require('../config/auth');

// Multer config
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '../public/images/avatars'));
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        cb(null, req.user._id + '_avatar' + ext);
    }
});
const upload = multer({ storage });

// GET profile
router.get('/', ensureAuthenticated, (req, res) => {
    res.render('profile', { user: req.user });
});

// POST upload avatar (only for local users)
router.post('/avatar', ensureAuthenticated, upload.single('avatar'), async (req, res) => {
    try {
        if (req.user.googleId) {
            req.flash('error_msg', 'Tài khoản Google không thể thay đổi avatar.');
            return res.redirect('/profile');
        }
        if (!req.file) {
            req.flash('error_msg', 'Vui lòng chọn file ảnh.');
            return res.redirect('/profile');
        }
        const avatarPath = '/images/avatars/' + req.file.filename;
        await User.findByIdAndUpdate(req.user._id, { avatar: avatarPath });
        req.flash('success_msg', 'Cập nhật avatar thành công!');
        res.redirect('/profile');
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Có lỗi xảy ra khi upload avatar.');
        res.redirect('/profile');
    }
});

// POST cập nhật thông tin cá nhân (dashboard)
router.post('/dashboard/update', ensureAuthenticated, async (req, res) => {
    try {
        const updateFields = {
            address: req.body.address,
            phone: req.body.phone,
            birthday: req.body.birthday
        };
        // User thường được đổi tên
        if (!req.user.googleId) {
            updateFields.name = req.body.name;
        }
        const updatedUser = await User.findByIdAndUpdate(req.user._id, updateFields, { new: true });
        req.login(updatedUser, function(err) {
            if (err) {
                req.flash('error_msg', 'Cập nhật thông tin nhưng không thể đồng bộ session.');
                return res.redirect('/dashboard');
            }
            req.flash('success_msg', 'Cập nhật thông tin thành công!');
            res.redirect('/dashboard');
        });
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Có lỗi xảy ra khi cập nhật thông tin.');
        res.redirect('/dashboard');
    }
});

// POST cập nhật thông tin cá nhân (profile page)
router.post('/update', ensureAuthenticated, async (req, res) => {
    try {
        const { name, phone, address, birthday } = req.body;
        
        // Validate birthday không được trong tương lai
        if (birthday && new Date(birthday) > new Date()) {
            req.flash('error_msg', 'Ngày sinh không thể trong tương lai.');
            return res.redirect('/profile');
        }
        
        const updateFields = {
            phone: phone || null,
            address: address || null,
            birthday: birthday || null
        };
        
        // User thường được đổi tên, user Google không được đổi
        if (!req.user.googleId) {
            updateFields.name = name;
        }
        
        const updatedUser = await User.findByIdAndUpdate(req.user._id, updateFields, { new: true });
        
        // Cập nhật session với thông tin mới
        req.login(updatedUser, function(err) {
            if (err) {
                req.flash('error_msg', 'Cập nhật thông tin nhưng không thể đồng bộ session.');
                return res.redirect('/profile');
            }
            req.flash('success_msg', 'Cập nhật thông tin thành công!');
            res.redirect('/profile');
        });
    } catch (err) {
        console.error('Lỗi khi cập nhật profile:', err);
        req.flash('error_msg', 'Có lỗi xảy ra khi cập nhật thông tin.');
        res.redirect('/profile');
    }
});

// POST đổi mật khẩu (chỉ cho tài khoản thường)
router.post('/change-password', ensureAuthenticated, async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;
        
        // Kiểm tra tài khoản Google
        if (req.user.googleId) {
            req.flash('error_msg', 'Tài khoản Google không thể đổi mật khẩu.');
            return res.redirect('/profile');
        }
        
        // Validate input
        if (!currentPassword || !newPassword || !confirmPassword) {
            req.flash('error_msg', 'Vui lòng điền đầy đủ thông tin.');
            return res.redirect('/profile');
        }
        
        if (newPassword !== confirmPassword) {
            req.flash('error_msg', 'Mật khẩu mới và xác nhận mật khẩu không khớp.');
            return res.redirect('/profile');
        }
        
        if (newPassword.length < 6) {
            req.flash('error_msg', 'Mật khẩu mới phải có ít nhất 6 ký tự.');
            return res.redirect('/profile');
        }
        
        // Kiểm tra mật khẩu hiện tại
        const user = await User.findById(req.user._id);
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        
        if (!isMatch) {
            req.flash('error_msg', 'Mật khẩu hiện tại không đúng.');
            return res.redirect('/profile');
        }
        
        // Hash mật khẩu mới
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        
        // Cập nhật mật khẩu
        await User.findByIdAndUpdate(req.user._id, { password: hashedPassword });
        
        req.flash('success_msg', 'Đổi mật khẩu thành công!');
        res.redirect('/profile');
    } catch (err) {
        console.error('Lỗi khi đổi mật khẩu:', err);
        req.flash('error_msg', 'Có lỗi xảy ra khi đổi mật khẩu.');
        res.redirect('/profile');
    }
});

module.exports = router;
