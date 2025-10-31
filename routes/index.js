const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../config/auth');
const Product = require('../models/Product');
const User = require('../models/User');
const Order = require('../models/Order');

// Home Page
router.get('/', async (req, res) => {
    try {
        // Lấy sản phẩm bán chạy từ tất cả thời gian (không giới hạn tháng)
        const bestsellingProducts = await Order.aggregate([
            {
                $match: {
                    status: { $nin: ['cancelled'] }, // Loại bỏ đơn hủy
                    paymentStatus: 'paid' // Chỉ tính đơn đã thanh toán
                }
            },
            {
                $unwind: '$items'
            },
            {
                $group: {
                    _id: '$items.product',
                    totalQuantity: { $sum: '$items.quantity' },
                    totalOrders: { $sum: 1 }
                }
            },
            {
                $sort: { totalQuantity: -1 }
            },
            {
                $limit: 5
            },
            {
                $lookup: {
                    from: 'products',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'product'
                }
            },
            {
                $unwind: '$product'
            },
            {
                $match: {
                    'product.category': { $ne: 'Topping' }, // Loại bỏ topping
                    'product.isAvailable': true // Chỉ lấy sản phẩm còn bán
                }
            }
        ]);

        let products = bestsellingProducts.map(item => item.product);
        let featuredTitle = 'Sản phẩm bán chạy nhất';
        
        // Nếu không có sản phẩm bán chạy, lấy 5 sản phẩm mới nhất
        if (products.length === 0) {
            products = await Product.find({ 
                category: { $ne: 'Topping' },
                isAvailable: true 
            })
            .sort({ createdAt: -1 })
            .limit(5);
            featuredTitle = 'Sản phẩm nổi bật';
        }
        
        // Nếu vẫn không đủ 5 sản phẩm, lấy thêm sản phẩm khác
        if (products.length < 5) {
            const existingIds = products.map(p => p._id);
            const additionalProducts = await Product.find({ 
                _id: { $nin: existingIds },
                category: { $ne: 'Topping' },
                isAvailable: true
            })
            .sort({ createdAt: -1 })
            .limit(5 - products.length);
            products = [...products, ...additionalProducts];
        }

        console.log(`✅ Homepage: Showing ${products.length} products - ${featuredTitle}`);

        res.render('index', {
            user: req.user,
            products,
            featuredTitle
        });
    } catch (err) {
        console.error('❌ Home page error:', err);
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