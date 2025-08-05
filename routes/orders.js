const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');

// Middleware kiểm tra đăng nhập
function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated && req.isAuthenticated()) {
        return next();
    }
    res.redirect('/users/login');
}

// Middleware kiểm tra quyền admin
function ensureAdmin(req, res, next) {
    if (req.user && req.user.role === 'admin') {
        return next();
    }
    res.status(403).send('Bạn không có quyền truy cập!');
}

// GET /orders - Danh sách đơn hàng của user hoặc admin
router.get('/', ensureAuthenticated, async (req, res) => {
    try {
        let orders;
        if (req.user.role === 'admin') {
            orders = await Order.find({})
                .populate('user', 'name email')
                .populate('items.product', 'name')
                .sort({ createdAt: -1 });
        } else {
            orders = await Order.find({ user: req.user._id })
                .populate('items.product', 'name')
                .sort({ createdAt: -1 });
        }
        res.render('orders/index', { orders, user: req.user });
    } catch (err) {
        res.status(500).send('Lỗi lấy danh sách đơn hàng!');
    }
});

// GET /orders/:id - Chi tiết đơn hàng
router.get('/:id', ensureAuthenticated, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('user', 'name email')
            .populate('items.product', 'name description price');
        if (!order) return res.status(404).send('Không tìm thấy đơn hàng!');
        // Chỉ cho phép admin hoặc chủ đơn hàng xem
        if (req.user.role !== 'admin' && String(order.user._id) !== String(req.user._id)) {
            return res.status(403).send('Bạn không có quyền xem đơn này!');
        }
        res.render('orders/detail', { order, user: req.user });
    } catch (err) {
        res.status(500).send('Lỗi lấy chi tiết đơn hàng!');
    }
});

module.exports = router;
