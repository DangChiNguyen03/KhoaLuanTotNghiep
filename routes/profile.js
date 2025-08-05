const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
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

module.exports = router;
