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

// GET /orders - Danh sách đơn hàng của user hiện tại
router.get('/', ensureAuthenticated, async (req, res) => {
    try {
        // Chỉ hiển thị đơn hàng của user hiện tại (bao gồm cả admin)
        const orders = await Order.find({ user: req.user._id })
            .populate('items.product', 'name')
            .sort({ createdAt: -1 });
            
        res.render('orders/index', { orders, user: req.user });
    } catch (err) {
        res.status(500).send('Lỗi lấy danh sách đơn hàng!');
    }
});

// POST /orders/:id/cancel - Hủy đơn hàng (cho khách hàng)
router.post('/:id/cancel', ensureAuthenticated, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) {
            req.flash('error_msg', 'Không tìm thấy đơn hàng!');
            return res.redirect('/orders');
        }
        
        // Chỉ cho phép chủ đơn hàng hoặc admin hủy
        if (order.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            req.flash('error_msg', 'Bạn không có quyền hủy đơn hàng này!');
            return res.redirect('/orders');
        }
        
        // Chỉ cho phép hủy đơn hàng đang pending hoặc confirmed
        if (!['pending', 'confirmed'].includes(order.status)) {
            req.flash('error_msg', 'Không thể hủy đơn hàng này! Đơn hàng đã được xử lý.');
            return res.redirect('/orders');
        }
        
        // Cập nhật trạng thái
        await Order.findByIdAndUpdate(req.params.id, { 
            status: 'cancelled',
            paymentStatus: 'failed'
        });
        
        req.flash('success_msg', 'Đã hủy đơn hàng thành công!');
        res.redirect('/orders');
    } catch (err) {
        console.error('Lỗi khi hủy đơn hàng:', err);
        req.flash('error_msg', 'Lỗi khi hủy đơn hàng!');
        res.redirect('/orders');
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
