const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../config/auth');
const Product = require('../models/Product');
const User = require('../models/User');

// Home Page
router.get('/', async (req, res) => {
    try {
        const products = await Product.find().limit(6);
        res.render('index', {
            user: req.user,
            products
        });
    } catch (err) {
        console.error('Home page error:', err);
        res.render('error');
    }
});

// Dashboard
router.get('/dashboard', ensureAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) {
            req.flash('error_msg', 'Không tìm thấy thông tin người dùng');
            return res.redirect('/');
        }

        console.log('Dashboard - User data:', {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            date: user.date
        });

        const products = await Product.find();
        res.render('dashboard', {
            user: user.toObject(),
            products
        });
    } catch (err) {
        console.error('Dashboard error:', err);
        req.flash('error_msg', 'Có lỗi khi tải thông tin người dùng');
        res.redirect('/');
    }
});

module.exports = router;