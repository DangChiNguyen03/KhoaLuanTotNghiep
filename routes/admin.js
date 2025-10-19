const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Product = require('../models/Product');
const User = require('../models/User');
const Order = require('../models/Order');
const Payment = require('../models/Payment');
const PaymentMethod = require('../models/PaymentMethod');
const LoginLog = require('../models/LoginLog');
const AuditLog = require('../models/AuditLog');
const { isAdmin, isAdminOrStaff, isAdminOrManager } = require('../middleware/auth');
const { ensureAuthenticated } = require('../config/auth');

// Login logs route - MUST be before root route
router.get('/login-logs', isAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const skip = (page - 1) * limit;
        
        // Filters
        const filters = {};
        if (req.query.status) filters.loginStatus = req.query.status;
        if (req.query.user) {
            const users = await User.find({
                $or: [
                    { name: new RegExp(req.query.user, 'i') },
                    { email: new RegExp(req.query.user, 'i') }
                ]
            }).select('_id');
            filters.user = { $in: users.map(u => u._id) };
        }
        const ipParam = req.query.ipAddress || req.query.ip;
        if (ipParam) {
            filters.ipAddress = new RegExp(ipParam, 'i');
        }
        if (req.query.dateFrom || req.query.dateTo) {
            filters.loginTime = {};
            if (req.query.dateFrom) {
                filters.loginTime.$gte = new Date(req.query.dateFrom);
            }
            if (req.query.dateTo) {
                const dateTo = new Date(req.query.dateTo);
                dateTo.setHours(23, 59, 59, 999);
                filters.loginTime.$lte = dateTo;
            }
        }
        
        const matchConditions = filters;
        
        // Tự động đánh dấu session cũ là inactive (sau 2 giờ không hoạt động)
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
        const expiredSessions = await LoginLog.find({
            isActive: true,
            loginTime: { $lt: twoHoursAgo },
            logoutTime: { $exists: false }
        });
        
        for (const session of expiredSessions) {
            const sessionDuration = Math.floor((Date.now() - session.loginTime.getTime()) / (1000 * 60));
            await LoginLog.updateOne(
                { _id: session._id },
                {
                    $set: {
                        isActive: false,
                        logoutTime: new Date(),
                        sessionDuration: sessionDuration,
                        notes: 'Auto-expired after 2 hours of inactivity'
                    }
                }
            );
        }
        
        // Lấy danh sách logs với phân trang và lọc
        const logs = await LoginLog.find(matchConditions)
            .populate('user', 'name email role')
            .sort({ loginTime: -1 })
            .skip(skip)
            .limit(limit);
            
        const totalLogs = await LoginLog.countDocuments(filters);
        const totalPages = Math.ceil(totalLogs / limit);
        
        // Statistics - tổng toàn bộ (không áp dụng filters)
        const allStats = await LoginLog.aggregate([
            {
                $group: {
                    _id: '$loginStatus',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Debug counts to verify data presence
        const successCount = await LoginLog.countDocuments({ loginStatus: 'success' });
        const failedCount = await LoginLog.countDocuments({ loginStatus: 'failed' });
        
        // Tính hoạt động đáng ngờ trong 24h
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const suspiciousLogs = await LoginLog.find({
            $or: [
                { riskLevel: 'high' },
                { riskLevel: 'medium' },
                { loginStatus: 'failed', loginTime: { $gte: twentyFourHoursAgo } }
            ],
            loginTime: { $gte: twentyFourHoursAgo }
        });

        const stats = {
            success: allStats.find(s => s._id === 'success')?.count || 0,
            failed: allStats.find(s => s._id === 'failed')?.count || 0,
            total: allStats.reduce((sum, s) => sum + s.count, 0)
        };
        
        res.render('admin/login-logs', {
            title: 'Quản lý Log Đăng nhập',
            loginLogs: logs,
            stats,
            suspiciousLogs,
            currentPage: page,
            totalPages,
            totalLogs,
            filters: req.query,
            layout: 'main'
        });
    } catch (error) {
        console.error('Error fetching login logs:', error);
        req.flash('error_msg', 'Lỗi khi tải danh sách login logs');
        res.redirect('/admin/dashboard');
    }
});

// Export CSV login logs theo filter hiện tại
router.get('/login-logs/export', isAdmin, async (req, res) => {
    try {
        const filters = {};
        if (req.query.status) filters.loginStatus = req.query.status;
        if (req.query.risk) filters.riskLevel = req.query.risk;
        if (req.query.user) {
            const users = await User.find({
                $or: [
                    { name: new RegExp(req.query.user, 'i') },
                    { email: new RegExp(req.query.user, 'i') }
                ]
            }).select('_id');
            filters.user = { $in: users.map(u => u._id) };
        }
        const ipParam = req.query.ipAddress || req.query.ip;
        if (ipParam) filters.ipAddress = new RegExp(ipParam, 'i');
        if (req.query.dateFrom || req.query.dateTo) {
            filters.loginTime = {};
            if (req.query.dateFrom) filters.loginTime.$gte = new Date(req.query.dateFrom);
            if (req.query.dateTo) {
                const d = new Date(req.query.dateTo); d.setHours(23,59,59,999);
                filters.loginTime.$lte = d;
            }
        }

        const logs = await LoginLog.find(filters)
            .populate('user', 'name email role')
            .sort({ loginTime: -1 })
            .limit(5000); // tránh file quá lớn

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="login-logs.csv"');
        const header = 'time,user_name,user_email,role,ip,browser,os,status,risk,session_active,duration,reason\n';
        res.write('\uFEFF' + header);
        for (const l of logs) {
            const row = [
                new Date(l.loginTime).toISOString(),
                (l.user?.name || l.username || '').replace(/,/g,' '),
                (l.user?.email || '').replace(/,/g,' '),
                (l.user?.role || ''),
                l.ipAddress,
                l.deviceInfo?.browser || '',
                l.deviceInfo?.os || '',
                l.loginStatus,
                l.riskLevel,
                l.isActive ? 'yes' : 'no',
                l.sessionDuration || '',
                l.failureReason ? l.failureReason.replace(/,/g,' ') : ''
            ].join(',') + '\n';
            res.write(row);
        }
        res.end();
    } catch (err) {
        console.error('Export CSV error:', err);
        req.flash('error_msg', 'Lỗi export CSV');
        res.redirect('/admin/login-logs');
    }
});

// Admin Dashboard - Main route  
router.get('/', isAdmin, (req, res) => {
    res.redirect('/admin/dashboard');
});

const { validateProduct } = require('../middleware/validate');
const { hasPermission, hasRole, DEFAULT_PERMISSIONS } = require('../middleware/permissions');
const { 
    auditUserAction, 
    auditPasswordReset, 
    auditRoleChange, 
    auditStatusChange,
    logAuditAction 
} = require('../middleware/auditTrail');
const bcrypt = require('bcryptjs');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'public/images/products';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|gif/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);
        if (extname && mimetype) {
            return cb(null, true);
        }
        cb(new Error('Chỉ chấp nhận file ảnh!'));
    }
});

router.get('/products', isAdmin, async (req, res) => {
    try {
        const products = await Product.find();
        const toppings = await Product.find({ category: 'Topping' }).select('name');
        const toppingList = toppings.map(t => t.name);
        res.render('admin/products', { products, toppings: toppingList, messages: req.flash() });
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Lỗi server khi tải danh sách sản phẩm');
        res.redirect('/admin/products');
    }
});

router.post('/products', isAdmin, upload.single('image'), validateProduct, async (req, res) => {
    try {
        let { name, description, category, toppings, sizes } = req.body;
        const image = req.file ? '/images/products/' + req.file.filename : '';

        toppings = category === 'Topping' ? [] : (toppings ? (Array.isArray(toppings) ? toppings : [toppings]) : []);
        let sizesArr = [];
        if (sizes) {
            try {
                sizesArr = JSON.parse(sizes);
            } catch (e) {
                sizesArr = [];
            }
        }

        const validCategories = ['Trà sữa', 'Trà trái cây', 'Đá xay', 'Topping', 'Cà phê', 'Nước ép'];
        if (!validCategories.includes(category)) {
            throw new Error(`Danh mục '${category}' không hợp lệ. Chọn: ${validCategories.join(', ')}`);
        }

        const product = new Product({
            name,
            description,
            category,
            toppings,
            image,
            sizes: sizesArr
        });

        await product.save();
        req.flash('success_msg', 'Thêm sản phẩm thành công!');
        res.redirect('/admin/products');
    } catch (err) {
        console.error('Lỗi khi thêm sản phẩm:', err);
        res.status(500).json({ message: err.message || 'Lỗi server khi thêm sản phẩm' });
    }
});

router.get('/products/:id', isAdmin, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
        }
        res.json(product);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Lỗi server khi lấy thông tin sản phẩm' });
    }
});

router.put('/products/update/:id', isAdmin, upload.single('image'), validateProduct, async (req, res) => {
    try {
        const { name, description, category, price, sizePriceS, sizePriceM, sizePriceL } = req.body;
        let { toppings } = req.body;

        // Đảm bảo toppings luôn là một mảng
        if (toppings === undefined) {
            toppings = [];
        } else if (!Array.isArray(toppings)) {
            toppings = [toppings];
        }

        const updateData = {
            name,
            description,
            category,
            toppings
        };

        // Xử lý giá và sizes dựa trên danh mục
        if (category === 'Topping') {
            // Đảm bảo topping có cả price và sizes nhất quán
            updateData.price = parseInt(price, 10);
            updateData.sizes = [{ size: 'Topping', price: parseInt(price, 10) }];
        } else {
            // Sản phẩm thường: xóa price, chỉ giữ sizes
            const sizes = [];
            if (sizePriceS) sizes.push({ size: 'S', price: parseInt(sizePriceS, 10) });
            if (sizePriceM) sizes.push({ size: 'M', price: parseInt(sizePriceM, 10) });
            if (sizePriceL) sizes.push({ size: 'L', price: parseInt(sizePriceL, 10) });
            updateData.sizes = sizes;
            updateData.price = null;
        }

        // Xử lý ảnh mới
        if (req.file) {
            updateData.image = '/uploads/' + req.file.filename;
        }

        // Cập nhật với $unset để xóa sạch trường không cần thiết
        const updateQuery = { $set: updateData };
        if (category !== 'Topping' && updateData.price === null) {
            updateQuery.$unset = { price: 1 }; // Xóa hoàn toàn trường price cho sản phẩm thường
        }
        
        await Product.findByIdAndUpdate(req.params.id, updateQuery, { new: true });

        req.flash('success_msg', 'Sản phẩm đã được cập nhật thành công.');
        res.redirect('/admin/products');

    } catch (err) {
        console.error('Lỗi khi cập nhật sản phẩm:', err);
        req.flash('error_msg', 'Có lỗi xảy ra khi cập nhật sản phẩm.');
        res.redirect('/admin/products');
    }
});

router.delete('/products/delete/:id', isAdmin, async (req, res) => {
    try {
        await Product.findByIdAndDelete(req.params.id);

        req.flash('success_msg', 'Sản phẩm đã được xóa thành công.');
        res.redirect('/admin/products');

    } catch (err) {
        console.error('Lỗi khi xóa sản phẩm:', err);
        req.flash('error_msg', 'Có lỗi xảy ra khi xóa sản phẩm.');
        res.redirect('/admin/products');
    }
});

// ===== CUSTOMER MANAGEMENT ROUTES =====

// Danh sách khách hàng
router.get('/customers', async (req, res) => {
    
    // Check permissions manually with detailed logging
    if (!req.user) {
        console.log('❌ No user found in request');
        req.flash('error_msg', 'Vui lòng đăng nhập để tiếp tục');
        return res.redirect('/users/login');
    }
    
    const User = require('../models/User');
    const user = await User.findById(req.user._id);
    if (!user) {
        console.log('❌ User not found in database');
        req.flash('error_msg', 'Người dùng không tồn tại');
        return res.redirect('/users/login');
    }
    
    console.log('🧔 User found:', user.email, 'role:', user.role, 'permissions:', user.permissions);
    
    // Get user permissions
    const { DEFAULT_PERMISSIONS } = require('../middleware/permissions');
    let userPermissions = user.permissions && user.permissions.length > 0 
        ? user.permissions 
        : DEFAULT_PERMISSIONS[user.role] || [];
    
    
    // For debugging - temporarily allow admin role regardless of permissions
    if (user.role === 'admin') {
    } else if (!userPermissions.includes('manage_customers')) {
        req.flash('error_msg', 'Bạn không có quyền truy cập tính năng này');
        return res.redirect('/admin/dashboard');
    }
    
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';
        
        // Tạo query tìm kiếm - hiển thị tất cả người dùng
        let query = {};
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } }
            ];
        }
        
        // Lấy danh sách tất cả người dùng với pagination
        const customers = await User.find(query)
            .select('name email phone address birthday date role')
            .sort({ date: -1 })
            .skip(skip)
            .limit(limit);
            
        // Đếm tổng số khách hàng
        const totalCustomers = await User.countDocuments(query);
        const totalPages = Math.ceil(totalCustomers / limit);
        
        // Lấy thống kê cơ bản - tất cả người dùng
        const stats = {
            total: await User.countDocuments({}),
            newThisMonth: await User.countDocuments({
                date: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) }
            }),
            customers: await User.countDocuments({ role: 'customer' }),
            admins: await User.countDocuments({ role: 'admin' }),
            managers: await User.countDocuments({ role: 'manager' }),
            staff: await User.countDocuments({ role: 'staff' })
        };
        
        res.render('admin/customers', {
            customers,
            stats,
            currentPage: page,
            totalPages,
            search,
            messages: req.flash()
        });
    } catch (err) {
        console.error('Lỗi khi tải danh sách khách hàng:', err);
        req.flash('error_msg', 'Lỗi server khi tải danh sách khách hàng');
        res.redirect('/admin/products');
    }
});

// Chi tiết khách hàng và lịch sử mua hàng
router.get('/customers/:id', isAdmin, async (req, res) => {
    try {
        const customer = await User.findById(req.params.id)
            .select('name email phone address birthday date');
            
        if (!customer) {
            req.flash('error_msg', 'Không tìm thấy khách hàng');
            return res.redirect('/admin/customers');
        }
        
        // Lấy lịch sử đơn hàng
        const orders = await Order.find({ user: req.params.id })
            .populate('items.product', 'name image')
            .populate('items.toppings', 'name')
            .sort({ createdAt: -1 })
            .limit(20);
            
        // Thống kê khách hàng
        const customerStats = {
            totalOrders: orders.length,
            totalSpent: orders.reduce((sum, order) => sum + order.totalPrice, 0),
            averageOrderValue: orders.length > 0 ? orders.reduce((sum, order) => sum + order.totalPrice, 0) / orders.length : 0,
            lastOrderDate: orders.length > 0 ? orders[0].createdAt : null
        };
        
        res.render('admin/customer-detail', {
            customer,
            orders,
            customerStats,
            messages: req.flash()
        });
    } catch (err) {
        console.error('Lỗi khi tải chi tiết khách hàng:', err);
        req.flash('error_msg', 'Lỗi server khi tải thông tin khách hàng');
        res.redirect('/admin/customers');
    }
});

// Cập nhật thông tin khách hàng
router.put('/customers/:id', isAdmin, async (req, res) => {
    try {
        const { name, email, phone, address } = req.body;
        
        await User.findByIdAndUpdate(req.params.id, {
            name,
            email,
            phone,
            address
        });
        
        req.flash('success_msg', 'Cập nhật thông tin khách hàng thành công');
        res.redirect(`/admin/customers/${req.params.id}`);
    } catch (err) {
        console.error('Lỗi khi cập nhật khách hàng:', err);
        req.flash('error_msg', 'Lỗi khi cập nhật thông tin khách hàng');
        res.redirect(`/admin/customers/${req.params.id}`);
    }
});

// Xóa khách hàng hoàn toàn (hard delete - xóa cả đơn hàng)
router.delete('/customers/:id', isAdmin, async (req, res) => {
    try {
        console.log('🗑️ DELETE /customers/:id được gọi với ID:', req.params.id);
        console.log('🗑️ Method:', req.method);
        console.log('🗑️ User:', req.user?.email);
        
        // Xóa khách hàng hoàn toàn (bao gồm cả đơn hàng nếu có)
        const orderCount = await Order.countDocuments({ user: req.params.id });
        
        if (orderCount > 0) {
            // Xóa tất cả đơn hàng của khách hàng trước
            await Order.deleteMany({ user: req.params.id });
            req.flash('info_msg', `Đã xóa ${orderCount} đơn hàng của khách hàng`);
        }
        
        // Xóa khách hàng hoàn toàn
        await User.findByIdAndDelete(req.params.id);
        req.flash('success_msg', 'Đã xóa khách hàng và tất cả dữ liệu liên quan thành công');
        
        res.redirect('/admin/customers');
    } catch (err) {
        console.error('Lỗi khi xóa khách hàng:', err);
        req.flash('error_msg', 'Lỗi khi xóa khách hàng');
        res.redirect('/admin/customers');
    }
});

// Route POST backup cho xóa khách hàng (nếu method override không hoạt động)
router.post('/customers/:id/delete', isAdmin, async (req, res) => {
    try {
        console.log('🗑️ POST /customers/:id/delete được gọi với ID:', req.params.id);
        console.log('🗑️ Method:', req.method);
        console.log('🗑️ User:', req.user?.email);
        
        // Xóa khách hàng hoàn toàn (bao gồm cả đơn hàng nếu có)
        const orderCount = await Order.countDocuments({ user: req.params.id });
        
        if (orderCount > 0) {
            // Xóa tất cả đơn hàng của khách hàng trước
            await Order.deleteMany({ user: req.params.id });
            req.flash('info_msg', `Đã xóa ${orderCount} đơn hàng của khách hàng`);
        }
        
        // Xóa khách hàng hoàn toàn
        await User.findByIdAndDelete(req.params.id);
        req.flash('success_msg', 'Đã xóa khách hàng và tất cả dữ liệu liên quan thành công');
        
        res.redirect('/admin/customers');
    } catch (err) {
        console.error('Lỗi khi xóa khách hàng (POST):', err);
        req.flash('error_msg', 'Lỗi khi xóa khách hàng');
        res.redirect('/admin/customers');
    }
});

// ===== VOUCHER MANAGEMENT =====
const Voucher = require('../models/Voucher');

// Trang quản lý voucher
router.get('/vouchers', isAdmin, async (req, res) => {
    try {
        const vouchers = await Voucher.find().sort({ createdAt: -1 });
        const categories = await Product.distinct('category');
        res.render('admin/vouchers', {
            title: 'Quản lý Mã giảm giá',
            vouchers,
            categories, // Gửi danh sách categories sang view
            messages: req.flash()
        });
    } catch (error) {
        console.error('Lỗi khi tải trang quản lý voucher:', error);
        req.flash('error_msg', 'Lỗi server khi tải trang voucher');
        res.redirect('/admin/dashboard');
    }
});

// Thêm voucher mới
router.post('/vouchers', isAdmin, async (req, res) => {
    try {
        const {
            code, description, discountType, discountValue,
            applicableCategory, startTime, endTime,
            specialDay, applicableSize, fixedPrice // New fields
        } = req.body;

        const voucherData = {
            code,
            description,
            discountType,
            applicableCategory: applicableCategory || null,
            startTime: startTime ? parseInt(startTime) : null,
            endTime: endTime ? parseInt(endTime) : null,
        };

        if (discountType === 'special_day_fixed_price') {
            voucherData.specialDay = parseInt(specialDay);
            voucherData.applicableSize = applicableSize.toUpperCase();
            voucherData.fixedPrice = parseFloat(fixedPrice);
            // For this type, discountValue is not strictly needed but we can set it to 0
            voucherData.discountValue = 0; 
        } else {
            voucherData.discountValue = parseFloat(discountValue);
        }

        const newVoucher = new Voucher(voucherData);
        await newVoucher.save();
        req.flash('success_msg', 'Tạo mã giảm giá thành công!');
        res.redirect('/admin/vouchers');

    } catch (error) {
        console.error('Lỗi khi tạo voucher:', error);
        if (error.code === 11000) { // Lỗi trùng mã
            req.flash('error_msg', 'Mã giảm giá này đã tồn tại.');
        } else {
            req.flash('error_msg', 'Có lỗi xảy ra khi tạo mã giảm giá.');
        }
        res.redirect('/admin/vouchers');
    }
});

// Xóa voucher
router.post('/vouchers/delete/:id', isAdmin, async (req, res) => {
    try {
        await Voucher.findByIdAndDelete(req.params.id);
        req.flash('success_msg', 'Đã xóa mã giảm giá thành công.');
        res.redirect('/admin/vouchers');
    } catch (error) {
        console.error('Lỗi khi xóa voucher:', error);
        req.flash('error_msg', 'Lỗi server khi xóa voucher.');
        res.redirect('/admin/vouchers');
    }
});


// ===== REPORTING ROUTES =====

// Product Reportard thống kê doanh số
router.get('/dashboard', isAdminOrStaff, async (req, res) => {
    try {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        // Fix: Create new Date object for week calculation to avoid mutating 'now'
        const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
        const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1; // Convert Sunday (0) to 6, others to day-1
        const thisWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysFromMonday);
        
        const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const thisYear = new Date(now.getFullYear(), 0, 1);
        

        // Thống kê tổng quan
        const totalStats = {
            totalRevenue: 0,
            totalOrders: 0,
            totalCustomers: 0,
            totalProducts: 0
        };

        // Thống kê theo thời gian
        const timeStats = {
            today: { revenue: 0, orders: 0 },
            thisWeek: { revenue: 0, orders: 0 },
            thisMonth: { revenue: 0, orders: 0 },
            thisYear: { revenue: 0, orders: 0 }
        };

        // Lấy dữ liệu song song
        const [
            allOrders,
            todayOrders,
            weekOrders,
            monthOrders,
            yearOrders,
            customers,
            products
        ] = await Promise.all([
            Order.find({ status: { $ne: 'cancelled' } }).populate('items.product', 'name'),
            Order.find({ createdAt: { $gte: today }, status: { $ne: 'cancelled' } }),
            Order.find({ createdAt: { $gte: thisWeek }, status: { $ne: 'cancelled' } }),
            Order.find({ createdAt: { $gte: thisMonth }, status: { $ne: 'cancelled' } }),
            Order.find({ createdAt: { $gte: thisYear }, status: { $ne: 'cancelled' } }),
            User.countDocuments({}), // Đếm tất cả user (bao gồm admin, manager, customer)
            Product.countDocuments({})
        ]);

        // Tính toán thống kê tổng quan
        totalStats.totalRevenue = allOrders.reduce((sum, order) => sum + order.totalPrice, 0);
        totalStats.totalOrders = allOrders.length;
        totalStats.totalCustomers = customers;
        totalStats.totalProducts = products;

        // Tính toán thống kê theo thời gian
        timeStats.today.revenue = todayOrders.reduce((sum, order) => sum + order.totalPrice, 0);
        timeStats.today.orders = todayOrders.length;
        
        timeStats.thisWeek.revenue = weekOrders.reduce((sum, order) => sum + order.totalPrice, 0);
        timeStats.thisWeek.orders = weekOrders.length;
        
        timeStats.thisMonth.revenue = monthOrders.reduce((sum, order) => sum + order.totalPrice, 0);
        timeStats.thisMonth.orders = monthOrders.length;
        
        timeStats.thisYear.revenue = yearOrders.reduce((sum, order) => sum + order.totalPrice, 0);
        timeStats.thisYear.orders = yearOrders.length;

        // Thống kê sản phẩm bán chạy
        const productStats = {};
        allOrders.forEach(order => {
            order.items.forEach(item => {
                const productName = item.product ? item.product.name : 'Sản phẩm đã xóa';
                if (!productStats[productName]) {
                    productStats[productName] = { count: 0, revenue: 0 };
                }
                productStats[productName].count += item.quantity;
                // Tính doanh thu sản phẩm (tạm tính = tổng tiền / số item)
                productStats[productName].revenue += order.totalPrice / order.items.length;
            });
        });

        // Sắp xếp sản phẩm theo số lượng bán
        const topProducts = Object.entries(productStats)
            .map(([name, stats]) => ({ name, ...stats }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        // Đơn hàng gần đây
        const recentOrders = await Order.find({})
            .populate('user', 'name email')
            .populate('items.product', 'name')
            .sort({ createdAt: -1 })
            .limit(10);

        res.render('admin/dashboard', {
            totalStats,
            timeStats,
            topProducts,
            recentOrders,
            messages: req.flash()
        });

    } catch (err) {
        console.error('Lỗi khi tải dashboard:', err);
        req.flash('error_msg', 'Lỗi server khi tải dashboard');
        res.redirect('/admin/products');
    }
});

// Quản lý đơn hàng
router.get('/orders', isAdminOrStaff, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;
        const status = req.query.status || '';
        const paymentMethod = req.query.paymentMethod || '';
        const search = req.query.search || '';
        
        // Tạo query lọc
        let query = {};
        if (status) {
            query.status = status;
        }
        if (paymentMethod) {
            query.paymentMethod = paymentMethod;
        }
        
        // Tìm kiếm theo tên khách hàng hoặc email
        let userQuery = {};
        if (search) {
            userQuery = {
                $or: [
                    { name: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } }
                ]
            };
        }
        
        // Lấy danh sách đơn hàng
        let orders;
        if (search) {
            // Nếu có search, cần join với User collection
            const users = await User.find(userQuery).select('_id');
            const userIds = users.map(u => u._id);
            query.user = { $in: userIds };
        }
        
        orders = await Order.find(query)
            .populate('user', 'name email phone')
            .populate('items.product', 'name image')
            .populate('items.toppings', 'name')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);
            
        // Đếm tổng số đơn hàng
        const totalOrders = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / limit);
        
        // Thống kê trạng thái
        const statusStats = {
            all: await Order.countDocuments({}),
            pending: await Order.countDocuments({ status: 'pending' }),
            completed: await Order.countDocuments({ status: 'completed' })
        };
        
        // Tính tổng doanh thu từ các đơn hàng hoàn thành bằng aggregation
        let totalRevenue = 0;
        try {
            const revenueResult = await Order.aggregate([
                { $match: { status: 'completed' } },
                { $group: { _id: null, totalRevenue: { $sum: '$totalPrice' } } }
            ]);
            totalRevenue = revenueResult.length > 0 ? (revenueResult[0].totalRevenue || 0) : 0;
            
            // Revenue calculation completed successfully
        } catch (revenueError) {
            console.error('Error calculating total revenue:', revenueError);
            totalRevenue = 0;
        }
        
        res.render('admin/orders', {
            orders,
            statusStats,
            totalRevenue,
            currentPage: page,
            totalPages,
            status,
            paymentMethod,
            search,
            messages: req.flash()
        });
    } catch (err) {
        console.error('Lỗi khi tải danh sách đơn hàng:', err);
        req.flash('error_msg', 'Lỗi server khi tải danh sách đơn hàng');
        res.redirect('/admin/dashboard');
    }
});

// Cập nhật trạng thái đơn hàng
router.post('/orders/:id/status', isAdminOrStaff, async (req, res) => {
    try {
        const { status } = req.body;
        
        // Hỗ trợ các trạng thái mới từ Order model
        const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'];
        if (!validStatuses.includes(status)) {
            req.flash('error_msg', 'Trạng thái không hợp lệ');
            return res.redirect('/admin/orders');
        }
        
        // Cập nhật trạng thái đơn hàng và paymentStatus tương ứng
        const updateData = { status };
        
        // Nếu hủy đơn hàng, cập nhật cả paymentStatus
        if (status === 'cancelled') {
            updateData.paymentStatus = 'failed';
        } else if (status === 'completed') {
            updateData.paymentStatus = 'paid';
        }
        
        await Order.findByIdAndUpdate(req.params.id, updateData);
        
        req.flash('success_msg', 'Cập nhật trạng thái đơn hàng thành công');
        res.redirect('/admin/orders');
    } catch (err) {
        console.error('Lỗi khi cập nhật trạng thái đơn hàng:', err);
        req.flash('error_msg', 'Lỗi khi cập nhật trạng thái đơn hàng');
        res.redirect('/admin/orders');
    }
});

// ===== PAYMENT MANAGEMENT =====

// Quản lý phương thức thanh toán
router.get('/payment-methods', isAdmin, async (req, res) => {
    try {
        const paymentMethods = await PaymentMethod.find().sort({ order: 1, createdAt: -1 });
        // Thống kê thanh toán theo phương thức
        const paymentStats = await Order.aggregate([
            { $match: { status: 'completed' } },
            { 
                $group: {
                    _id: '$paymentMethod',
                    totalOrders: { $sum: 1 },
                    totalRevenue: { $sum: '$totalPrice' }
                }
            }
        ]);
        
        // Tạo object thống kê dễ sử dụng
        const stats = {
            cash: { totalOrders: 0, totalRevenue: 0 },
            vnpay: { totalOrders: 0, totalRevenue: 0 }
        };
        
        paymentStats.forEach(stat => {
            if (stat._id === 'cash') {
                stats.cash = stat;
            } else if (stat._id === 'vnpay') {
                stats.vnpay = stat;
            }
        });
        
        
        res.render('admin/payment-methods', {
            paymentMethods,
            paymentStats: stats,
            messages: req.flash()
        });
    } catch (err) {
        console.error('Lỗi khi tải danh sách phương thức thanh toán:', err);
        req.flash('error_msg', 'Lỗi server khi tải danh sách phương thức thanh toán');
        res.redirect('/admin/dashboard');
    }
});

// Thêm phương thức thanh toán
router.post('/payment-methods', isAdmin, async (req, res) => {
    try {
        const { name, code, description, icon, bankName, accountNumber, accountName, fee, feeType, isActive } = req.body;
        
        // Kiểm tra trùng mã
        const existingMethod = await PaymentMethod.findOne({ code });
        if (existingMethod) {
            req.flash('error_msg', 'Mã phương thức thanh toán đã tồn tại');
            return res.redirect('/admin/payment-methods');
        }
        
        const paymentMethod = new PaymentMethod({
            name,
            code,
            description,
            icon,
            config: {
                bankName,
                accountNumber,
                accountName,
                fee: parseFloat(fee) || 0,
                feeType
            },
            isActive: isActive === 'on'
        });
        
        await paymentMethod.save();
        req.flash('success_msg', 'Thêm phương thức thanh toán thành công');
        res.redirect('/admin/payment-methods');
    } catch (err) {
        console.error('Lỗi khi thêm phương thức thanh toán:', err);
        req.flash('error_msg', 'Lỗi khi thêm phương thức thanh toán');
        res.redirect('/admin/payment-methods');
    }
});

// Cập nhật phương thức thanh toán
router.put('/payment-methods/:id', isAdmin, async (req, res) => {
    try {
        const { name, description, icon, bankName, accountNumber, accountName, fee, feeType, isActive } = req.body;
        
        await PaymentMethod.findByIdAndUpdate(req.params.id, {
            name,
            description,
            icon,
            config: {
                bankName,
                accountNumber,
                accountName,
                fee: parseFloat(fee) || 0,
                feeType
            },
            isActive: isActive === 'on'
        });
        
        req.flash('success_msg', 'Cập nhật phương thức thanh toán thành công');
        res.redirect('/admin/payment-methods');
    } catch (err) {
        console.error('Lỗi khi cập nhật phương thức thanh toán:', err);
        req.flash('error_msg', 'Lỗi khi cập nhật phương thức thanh toán');
        res.redirect('/admin/payment-methods');
    }
});

// Xóa phương thức thanh toán
router.delete('/payment-methods/:id', isAdmin, async (req, res) => {
    try {
        await PaymentMethod.findByIdAndDelete(req.params.id);
        req.flash('success_msg', 'Xóa phương thức thanh toán thành công');
        res.redirect('/admin/payment-methods');
    } catch (err) {
        console.error('Lỗi khi xóa phương thức thanh toán:', err);
        req.flash('error_msg', 'Lỗi khi xóa phương thức thanh toán');
        res.redirect('/admin/payment-methods');
    }
});

// Quản lý thanh toán
router.get('/payments', isAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;
        const status = req.query.status || '';
        const paymentMethod = req.query.paymentMethod || '';
        
        // Tạo query lọc
        let query = {};
        if (status) {
            query.status = status;
        }
        if (paymentMethod) {
            query.paymentMethod = paymentMethod;
        }
        
        // Lấy danh sách thanh toán
        const payments = await Payment.find(query)
            .populate('user', 'name email phone')
            .populate('order', 'totalPrice createdAt status')
            .populate('processedBy', 'name')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);
            
        // Đếm tổng số thanh toán
        const totalPayments = await Payment.countDocuments(query);
        const totalPages = Math.ceil(totalPayments / limit);
        
        // Thống kê trạng thái
        const statusStats = {
            all: await Payment.countDocuments({}),
            pending: await Payment.countDocuments({ status: 'pending' }),
            paid: await Payment.countDocuments({ status: 'paid' }),
            cancelled: await Payment.find().populate('order').then(payments => 
                payments.filter(p => p.order && p.order.status === 'cancelled').length
            )
        };
        
        res.render('admin/payments', {
            payments,
            statusStats,
            currentPage: page,
            totalPages,
            status,
            paymentMethod,
            messages: req.flash()
        });
    } catch (err) {
        console.error('Lỗi khi tải danh sách thanh toán:', err);
        req.flash('error_msg', 'Lỗi server khi tải danh sách thanh toán');
        res.redirect('/admin/dashboard');
    }
});

// Cập nhật trạng thái thanh toán
router.put('/payments/:id/status', isAdmin, async (req, res) => {
    try {
        const { status, notes } = req.body;
        
        if (!['pending', 'paid', 'failed', 'refunded'].includes(status)) {
            req.flash('error_msg', 'Trạng thái thanh toán không hợp lệ');
            return res.redirect('/admin/payments');
        }
        
        const updateData = {
            status,
            notes,
            processedBy: req.user._id
        };
        
        // Nếu đánh dấu là đã thanh toán, cập nhật thời gian
        if (status === 'paid') {
            updateData.paidAt = new Date();
        }
        
        const payment = await Payment.findByIdAndUpdate(req.params.id, updateData, { new: true });
        
        // Cập nhật trạng thái thanh toán của đơn hàng
        if (payment.order) {
            await Order.findByIdAndUpdate(payment.order, { paymentStatus: status });
        }
        
        req.flash('success_msg', 'Cập nhật trạng thái thanh toán thành công');
        res.redirect('/admin/payments');
    } catch (err) {
        console.error('Lỗi khi cập nhật trạng thái thanh toán:', err);
        req.flash('error_msg', 'Lỗi khi cập nhật trạng thái thanh toán');
        res.redirect('/admin/payments');
    }
});

// Reset và khởi tạo lại phương thức thanh toán
router.post('/reset-payment-methods', isAdmin, async (req, res) => {
    try {
        // Force xóa tất cả
        const deleteResult = await PaymentMethod.deleteMany({});
        
        // Tạo lại chỉ 2 phương thức
        const defaultMethods = [
            {
                name: 'Tiền mặt',
                code: 'cash',
                description: 'Thanh toán bằng tiền mặt khi nhận hàng',
                icon: '💵',
                config: {
                    fee: 0,
                    feeType: 'fixed'
                },
                isActive: true,
                order: 1
            },
            {
                name: 'VNPay',
                code: 'vnpay',
                description: 'Thanh toán qua cổng thanh toán VNPay',
                icon: '🔵',
                config: {
                    fee: 0,
                    feeType: 'fixed'
                },
                isActive: true,
                order: 2
            }
        ];
        
        const insertResult = await PaymentMethod.insertMany(defaultMethods);
        
        req.flash('success_msg', `Đã reset và tạo lại ${defaultMethods.length} phương thức thanh toán`);
        res.redirect('/admin/payment-methods');
    } catch (err) {
        console.error('Lỗi khi reset phương thức thanh toán:', err);
        req.flash('error_msg', 'Lỗi khi reset phương thức thanh toán');
        res.redirect('/admin/payment-methods');
    }
});

// Khởi tạo dữ liệu mặc định cho phương thức thanh toán
router.post('/init-payment-methods', isAdmin, async (req, res) => {
    try {
        // Xóa tất cả phương thức thanh toán cũ (nếu có)
        await PaymentMethod.deleteMany({});
        
        // Tạo các phương thức thanh toán mặc định (chỉ Tiền mặt và VNPay)
        const defaultMethods = [
            {
                name: 'Tiền mặt',
                code: 'cash',
                description: 'Thanh toán bằng tiền mặt khi nhận hàng',
                icon: '💵',
                config: {
                    fee: 0,
                    feeType: 'fixed'
                },
                isActive: true,
                order: 1
            },
            {
                name: 'VNPay',
                code: 'vnpay',
                description: 'Thanh toán qua cổng thanh toán VNPay',
                icon: '🔵',
                config: {
                    fee: 0,
                    feeType: 'fixed'
                },
                isActive: true,
                order: 2
            }
        ];
        
        await PaymentMethod.insertMany(defaultMethods);
        
        req.flash('success_msg', `Đã khởi tạo ${defaultMethods.length} phương thức thanh toán mặc định`);
        res.redirect('/admin/payment-methods');
    } catch (err) {
        console.error('Lỗi khi khởi tạo phương thức thanh toán:', err);
        req.flash('error_msg', 'Lỗi khi khởi tạo phương thức thanh toán');
        res.redirect('/admin/payment-methods');
    }
});

// ==================== LOGIN LOGS MANAGEMENT ====================

// DUPLICATE ROUTE REMOVED - Already defined above

// API để lấy thống kê login theo thời gian
router.get('/api/login-stats', isAdmin, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 7;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        const stats = await LoginLog.aggregate([
            {
                $match: {
                    loginTime: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: {
                        date: { $dateToString: { format: "%Y-%m-%d", date: "$loginTime" } },
                        status: "$loginStatus"
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { "_id.date": 1 }
            }
        ]);
        
        res.json(stats);
    } catch (error) {
        console.error('Error fetching login stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// Đánh dấu log đáng ngờ
router.post('/login-logs/:id/mark-risk', isAdmin, async (req, res) => {
    try {
        const { riskLevel, notes } = req.body;
        
        await LoginLog.findByIdAndUpdate(req.params.id, {
            riskLevel,
            notes
        });
        
        req.flash('success_msg', 'Đã cập nhật mức độ rủi ro');
        res.redirect('/admin/login-logs');
    } catch (error) {
        console.error('Error updating risk level:', error);
        req.flash('error_msg', 'Có lỗi khi cập nhật mức độ rủi ro');
        res.redirect('/admin/login-logs');
    }
});


// ==================== SYSTEM USERS MANAGEMENT ====================


// DEBUG: Route to activate current user - NO PERMISSION CHECK
router.get('/activate-me', ensureAuthenticated, async (req, res) => {
    try {
        console.log('🔧 Activating user:', req.user.email);
        const result = await User.findByIdAndUpdate(req.user._id, { isActive: true }, { new: true });
        console.log('✅ User activated:', result.isActive);
        res.json({ 
            success: true, 
            message: 'Đã kích hoạt tài khoản của bạn',
            isActive: result.isActive 
        });
    } catch (error) {
        console.error('Error activating user:', error);
        res.json({ success: false, error: error.message });
    }
});

// Trang quản lý system users (nhân viên)
router.get('/system-users', ensureAuthenticated, hasPermission('manage_users'), async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const skip = (page - 1) * limit;
        
        // Filters
        const filters = { role: { $in: ['admin', 'manager', 'staff'] } };
        if (req.query.role) filters.role = req.query.role;
        if (req.query.department) filters.department = req.query.department;
        if (req.query.status) {
            filters.isActive = req.query.status === 'active';
        }
        if (req.query.search) {
            filters.$or = [
                { name: new RegExp(req.query.search, 'i') },
                { email: new RegExp(req.query.search, 'i') },
                { employeeId: new RegExp(req.query.search, 'i') }
            ];
        }
        
        const systemUsers = await User.find(filters)
            .populate('manager', 'name email')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);
            
        const totalUsers = await User.countDocuments(filters);
        const totalPages = Math.ceil(totalUsers / limit);
        
        // Statistics
        const stats = await User.aggregate([
            { $match: { role: { $in: ['admin', 'manager', 'staff'] } } },
            {
                $group: {
                    _id: '$role',
                    count: { $sum: 1 },
                    active: { $sum: { $cond: ['$isActive', 1, 0] } }
                }
            }
        ]);
        
        const statsObj = {
            admin: stats.find(s => s._id === 'admin') || { count: 0, active: 0 },
            manager: stats.find(s => s._id === 'manager') || { count: 0, active: 0 },
            staff: stats.find(s => s._id === 'staff') || { count: 0, active: 0 }
        };
        
        // Get all managers for dropdown
        const managers = await User.find({ 
            role: { $in: ['admin', 'manager'] },
            isActive: true 
        }).select('name email');
        
        res.render('admin/system-users', {
            systemUsers,
            stats: statsObj,
            managers,
            currentPage: page,
            totalPages,
            totalUsers,
            prevPage: page > 1 ? page - 1 : null,
            nextPage: page < totalPages ? page + 1 : null,
            filters: req.query,
            permissions: DEFAULT_PERMISSIONS,
            title: 'Quản lý Nhân viên Hệ thống'
        });
        
    } catch (error) {
        console.error('Error fetching system users:', error);
        req.flash('error_msg', 'Có lỗi khi tải danh sách nhân viên');
        res.redirect('/admin/dashboard');
    }
});

// Tạo system user mới
router.post('/system-users', hasPermission('manage_users'), async (req, res) => {
    try {
        const { 
            name, email, password, role, employeeId, department, 
            hireDate, salary, manager, permissions, phone, address, birthday 
        } = req.body;
        
        // Validate required fields
        if (!name || !email || !password || !role || !employeeId || !department) {
            req.flash('error_msg', 'Vui lòng điền đầy đủ thông tin bắt buộc');
            return res.redirect('/admin/system-users');
        }
        
        // Check if email or employeeId already exists
        const existingUser = await User.findOne({
            $or: [{ email }, { employeeId }]
        });
        
        if (existingUser) {
            req.flash('error_msg', 'Email hoặc mã nhân viên đã tồn tại');
            return res.redirect('/admin/system-users');
        }
        
        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        // Create new system user
        const newUser = new User({
            name,
            email,
            password: hashedPassword,
            role,
            employeeId,
            department,
            hireDate: hireDate || new Date(),
            salary: salary || 0,
            manager: manager || null,
            permissions: permissions || DEFAULT_PERMISSIONS[role] || [],
            phone: phone || '',
            address: address || '',
            birthday: birthday || null,
            isActive: true
        });
        
        await newUser.save();
        
        // Audit log
        await logAuditAction(
            req,
            'user_created',
            'User',
            newUser._id,
            {
                name,
                email,
                role,
                employeeId,
                department,
                createdBy: req.user._id
            }
        );
        
        req.flash('success_msg', `Đã tạo tài khoản ${role} cho ${name} thành công`);
        res.redirect('/admin/system-users');
        
    } catch (error) {
        console.error('Error creating system user:', error);
        req.flash('error_msg', 'Có lỗi khi tạo tài khoản nhân viên');
        res.redirect('/admin/system-users');
    }
});

// Cập nhật system user
router.put('/system-users/:id', hasPermission('manage_users'), async (req, res) => {
    try {
        const { 
            name, email, role, employeeId, department, 
            hireDate, salary, manager, permissions, isActive, phone, address, birthday 
        } = req.body;
        
        const user = await User.findById(req.params.id);
        if (!user) {
            req.flash('error_msg', 'Không tìm thấy nhân viên');
            return res.redirect('/admin/system-users');
        }
        
        // Check if email or employeeId conflicts with other users
        const conflictUser = await User.findOne({
            _id: { $ne: req.params.id },
            $or: [{ email }, { employeeId }]
        });
        
        if (conflictUser) {
            req.flash('error_msg', 'Email hoặc mã nhân viên đã được sử dụng bởi nhân viên khác');
            return res.redirect('/admin/system-users');
        }
        
        // Store old values for audit
        const oldValues = {
            name: user.name,
            email: user.email,
            role: user.role,
            employeeId: user.employeeId,
            department: user.department,
            isActive: user.isActive
        };
        
        // Update user
        await User.findByIdAndUpdate(req.params.id, {
            name,
            email,
            role,
            employeeId,
            department,
            hireDate,
            salary,
            manager: manager || null,
            permissions: permissions || DEFAULT_PERMISSIONS[role] || [],
            phone: phone || '',
            address: address || '',
            birthday: birthday || null,
            isActive: isActive === 'true'
        });
        
        // Audit log
        await logAuditAction(
            req,
            'user_updated',
            'User',
            req.params.id,
            {
                updatedBy: req.user._id,
                fieldsChanged: Object.keys(req.body)
            },
            oldValues,
            {
                name,
                email,
                role,
                employeeId,
                department,
                isActive: isActive === 'true'
            }
        );
        
        // Log role change if role was changed
        if (oldValues.role !== role) {
            await auditRoleChange(req, req.params.id, oldValues.role, role);
        }
        
        req.flash('success_msg', 'Đã cập nhật thông tin nhân viên thành công');
        res.redirect('/admin/system-users');
        
    } catch (error) {
        console.error('Error updating system user:', error);
        req.flash('error_msg', 'Có lỗi khi cập nhật thông tin nhân viên');
        res.redirect('/admin/system-users');
    }
});

// Cập nhật system user (POST method - backup for method override issues)
router.post('/system-users/:id', hasPermission('manage_users'), async (req, res) => {
    try {
        // Check if this is a PUT request via method override
        if (req.body._method === 'PUT') {
            const { 
                name, email, role, employeeId, department, 
                hireDate, salary, manager, permissions, isActive, phone, address, birthday 
            } = req.body;
            
            console.log('🔄 Updating system user:', req.params.id);
            console.log('📝 Update data:', { name, email, role, employeeId, department });
            
            // Validate required fields
            if (!name || !email || !role || !employeeId || !department) {
                req.flash('error_msg', 'Vui lòng điền đầy đủ thông tin bắt buộc');
                return res.redirect('/admin/system-users');
            }
            
            // Check if email or employeeId already exists (excluding current user)
            const existingUser = await User.findOne({
                $and: [
                    { _id: { $ne: req.params.id } },
                    { $or: [{ email }, { employeeId }] }
                ]
            });
            
            if (existingUser) {
                req.flash('error_msg', 'Email hoặc mã nhân viên đã tồn tại');
                return res.redirect('/admin/system-users');
            }
            
            // Update user
            const updateData = {
                name,
                email,
                role,
                employeeId,
                department,
                hireDate: hireDate || new Date(),
                salary: salary || 0,
                manager: manager || null,
                permissions: permissions || DEFAULT_PERMISSIONS[role] || [],
                isActive: isActive === 'on' || isActive === true,
                phone: phone || '',
                address: address || '',
                birthday: birthday || null
            };
            
            const updatedUser = await User.findByIdAndUpdate(req.params.id, updateData, { new: true });
            
            if (!updatedUser) {
                req.flash('error_msg', 'Không tìm thấy nhân viên');
                return res.redirect('/admin/system-users');
            }
            
            // Audit log
            await logAuditAction(
                req,
                'user_updated',
                'User',
                updatedUser._id,
                updateData,
                `Updated system user: ${updatedUser.name}`
            );
            
            req.flash('success_msg', 'Cập nhật thông tin nhân viên thành công');
            res.redirect('/admin/system-users');
        } else {
            // Not a PUT request, redirect
            res.redirect('/admin/system-users');
        }
    } catch (error) {
        console.error('Error updating system user via POST:', error);
        req.flash('error_msg', 'Có lỗi khi cập nhật thông tin nhân viên');
        res.redirect('/admin/system-users');
    }
});

// Vô hiệu hóa/kích hoạt system user
router.post('/system-users/:id/toggle-status', hasPermission('manage_users'), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            req.flash('error_msg', 'Không tìm thấy nhân viên');
            return res.redirect('/admin/system-users');
        }
        
        // Prevent deactivating yourself
        if (user._id.toString() === req.user._id.toString()) {
            req.flash('error_msg', 'Bạn không thể vô hiệu hóa tài khoản của chính mình');
            return res.redirect('/admin/system-users');
        }
        
        const oldStatus = user.isActive;
        user.isActive = !user.isActive;
        await user.save();
        
        // Audit log
        await auditStatusChange(req, 'User', req.params.id, oldStatus, user.isActive);
        
        const status = user.isActive ? 'kích hoạt' : 'vô hiệu hóa';
        req.flash('success_msg', `Đã ${status} tài khoản ${user.name} thành công`);
        res.redirect('/admin/system-users');
        
    } catch (error) {
        console.error('Error toggling user status:', error);
        req.flash('error_msg', 'Có lỗi khi thay đổi trạng thái tài khoản');
        res.redirect('/admin/system-users');
    }
});

// Reset password cho system user
router.post('/system-users/:id/reset-password', hasPermission('manage_users'), async (req, res) => {
    try {
        const { newPassword } = req.body;
        
        if (!newPassword || newPassword.length < 6) {
            req.flash('error_msg', 'Mật khẩu mới phải có ít nhất 6 ký tự');
            return res.redirect('/admin/system-users');
        }
        
        const user = await User.findById(req.params.id);
        if (!user) {
            req.flash('error_msg', 'Không tìm thấy nhân viên');
            return res.redirect('/admin/system-users');
        }
        
        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        
        user.password = hashedPassword;
        user.loginAttempts = 0;
        user.lockUntil = undefined;
        await user.save();
        
        // Audit log
        await auditPasswordReset(req, req.params.id, true);
        
        req.flash('success_msg', `Đã reset mật khẩu cho ${user.name} thành công`);
        res.redirect('/admin/system-users');
        
    } catch (error) {
        console.error('Error resetting password:', error);
        req.flash('error_msg', 'Có lỗi khi reset mật khẩu');
        res.redirect('/admin/system-users');
    }
});

// API để lấy thông tin system user
router.get('/api/system-users/:id', hasPermission('manage_users'), async (req, res) => {
    try {
        const user = await User.findById(req.params.id)
            .populate('manager', 'name email')
            .select('-password');
            
        if (!user) {
            return res.status(404).json({ error: 'Không tìm thấy nhân viên' });
        }
        
        res.json(user);
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ error: 'Có lỗi khi tải thông tin nhân viên' });
    }
});

// ==================== AUDIT LOGS MANAGEMENT ====================

// Trang xem audit logs (hoạt động hệ thống)
router.get('/audit-logs', hasPermission('manage_users'), async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 50;
        const skip = (page - 1) * limit;
        
        // Filters
        const filters = {};
        if (req.query.user) filters.user = req.query.user;
        if (req.query.action) filters.action = req.query.action;
        if (req.query.resourceType) filters.resourceType = req.query.resourceType;
        if (req.query.status) filters.status = req.query.status;
        if (req.query.startDate && req.query.endDate) {
            filters.timestamp = {
                $gte: new Date(req.query.startDate),
                $lte: new Date(req.query.endDate + 'T23:59:59')
            };
        }
        
        const auditLogs = await AuditLog.find(filters)
            .select('timestamp user action resourceType resourceId ipAddress status details oldValues newValues errorMessage')
            .populate('user', 'name email role employeeId')
            .sort({ timestamp: -1 })
            .skip(skip)
            .limit(limit)
            .lean();
            
        const totalLogs = await AuditLog.countDocuments(filters);
        const totalPages = Math.ceil(totalLogs / limit);
        
        // Get activity summary for last 7 days
        const activitySummary = await AuditLog.getActivitySummary();
        
        // Get all users for filter dropdown
        const systemUsers = await User.find({ 
            role: { $in: ['admin', 'manager', 'staff'] }
        }).select('name email role employeeId');
        
        // Get unique actions and resource types for filters
        const uniqueActions = await AuditLog.distinct('action');
        const uniqueResourceTypes = await AuditLog.distinct('resourceType');
        
        res.render('admin/audit-logs', {
            auditLogs,
            activitySummary,
            systemUsers,
            uniqueActions,
            uniqueResourceTypes,
            currentPage: page,
            totalPages,
            totalLogs,
            prevPage: page > 1 ? page - 1 : null,
            nextPage: page < totalPages ? page + 1 : null,
            filters: req.query,
            title: 'Audit Logs - Nhật ký Hoạt động Hệ thống'
        });
        
    } catch (error) {
        console.error('Error fetching audit logs:', error);
        req.flash('error_msg', 'Có lỗi khi tải nhật ký hoạt động');
        res.redirect('/admin');
    }
});

// Export CSV cho audit logs
router.get('/audit-logs/export', hasPermission('manage_users'), async (req, res) => {
    try {
        const filters = {};
        if (req.query.user) filters.user = req.query.user;
        if (req.query.action) filters.action = req.query.action;
        if (req.query.resourceType) filters.resourceType = req.query.resourceType;
        if (req.query.status) filters.status = req.query.status;
        if (req.query.startDate && req.query.endDate) {
            filters.timestamp = {
                $gte: new Date(req.query.startDate),
                $lte: new Date(req.query.endDate + 'T23:59:59')
            };
        }

        const logs = await AuditLog.find(filters)
            .select('timestamp user action resourceType resourceId ipAddress status errorMessage')
            .populate('user', 'name email role employeeId')
            .sort({ timestamp: -1 })
            .limit(5000)
            .lean();

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="audit-logs.csv"');
        res.write('\uFEFFtime,user_name,user_email,role,action,resourceType,resourceId,ip,status,error\n');
        for (const l of logs) {
            const row = [
                new Date(l.timestamp).toISOString(),
                (l.user?.name || 'System').replace(/,/g,' '),
                (l.user?.email || '').replace(/,/g,' '),
                (l.user?.role || ''),
                l.action,
                l.resourceType,
                l.resourceId || '',
                l.ipAddress || '',
                l.status,
                (l.errorMessage || '').replace(/,/g,' ')
            ].join(',') + '\n';
            res.write(row);
        }
        res.end();
    } catch (error) {
        console.error('Export audit CSV error:', error);
        req.flash('error_msg', 'Lỗi export CSV');
        res.redirect('/admin/audit-logs');
    }
});

// API lấy hoạt động của một user cụ thể
router.get('/api/user-activity/:userId', hasPermission('manage_users'), async (req, res) => {
    try {
        const { userId } = req.params;
        const { limit = 20, page = 1, action, resourceType, days = 30 } = req.query;
        
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));
        
        const activities = await AuditLog.getUserActivity(userId, {
            limit: parseInt(limit),
            skip: (parseInt(page) - 1) * parseInt(limit),
            action,
            resourceType,
            startDate
        });
        
        res.json({
            success: true,
            activities,
            pagination: {
                currentPage: parseInt(page),
                limit: parseInt(limit)
            }
        });
        
    } catch (error) {
        console.error('Error fetching user activity:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Có lỗi khi tải hoạt động người dùng' 
        });
    }
});

// API phát hiện hoạt động đáng ngờ
router.get('/api/suspicious-activity', hasPermission('manage_users'), async (req, res) => {
    try {
        const { timeWindow = 60, threshold = 10 } = req.query;
        
        const suspiciousActivity = await AuditLog.detectSuspiciousActivity({
            timeWindow: parseInt(timeWindow),
            threshold: parseInt(threshold)
        });
        
        res.json({
            success: true,
            suspiciousActivity,
            detectionCriteria: {
                timeWindow: `${timeWindow} phút`,
                threshold: `${threshold} hành động`
            }
        });
        
    } catch (error) {
        console.error('Error detecting suspicious activity:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Có lỗi khi phát hiện hoạt động đáng ngờ' 
        });
    }
});


// ==================== REPORTS MODULE ====================



// Customer Report (Báo cáo khách hàng)
router.get('/reports/customers', async (req, res) => {
    console.log('🚪 Customer report route accessed by user:', req.user?.email, 'role:', req.user?.role);
    
    // Check permissions manually with detailed logging
    if (!req.user) {
        console.log('❌ No user found in request');
        req.flash('error_msg', 'Vui lòng đăng nhập để tiếp tục');
        return res.redirect('/users/login');
    }
    
    const User = require('../models/User');
    const user = await User.findById(req.user._id);
    if (!user) {
        console.log('❌ User not found in database');
        req.flash('error_msg', 'Người dùng không tồn tại');
        return res.redirect('/users/login');
    }
    
    console.log('🧔 User found:', user.email, 'role:', user.role, 'permissions:', user.permissions);
    
    // Get user permissions
    const { DEFAULT_PERMISSIONS } = require('../middleware/permissions');
    let userPermissions = user.permissions && user.permissions.length > 0 
        ? user.permissions 
        : DEFAULT_PERMISSIONS[user.role] || [];
    
    console.log('🔐 User permissions:', userPermissions);
    console.log('🎯 Required permission: view_reports');
    console.log('✅ Has permission:', userPermissions.includes('view_reports'));
    
    if (!userPermissions.includes('view_reports')) {
        console.log('❌ User does not have view_reports permission');
        req.flash('error_msg', 'Bạn không có quyền truy cập tính năng này');
        return res.redirect('/admin/dashboard');
    }
    
    console.log('✅ Permission check passed, proceeding to report generation');
    try {
        const { startDate, endDate, exportFormat } = req.query;
        
        // Default date range (last 30 days)
        const defaultEndDate = new Date();
        const defaultStartDate = new Date();
        defaultStartDate.setDate(defaultStartDate.getDate() - 30);
        
        const reportStartDate = startDate ? new Date(startDate) : defaultStartDate;
        const reportEndDate = endDate ? new Date(endDate + 'T23:59:59') : defaultEndDate;
        
        console.log('🚪 Debug date range:', { reportStartDate, reportEndDate });
        
        // Debug: Kiểm tra dữ liệu user thực tế
        const allUsers = await User.find({}).select('email role createdAt lastLogin date').limit(10);
        console.log('🧑 Sample users in DB:', allUsers);
        
        // Kiểm tra field nào có dữ liệu
        const userFieldCheck = await User.findOne({});
        console.log('🚪 User schema fields:', Object.keys(userFieldCheck.toObject()));
        
        // Tổng tài khoản đăng ký trong khoảng thời gian (tất cả role) - sử dụng field 'date'
        const newCustomerStats = await User.aggregate([
            {
                $match: {
                    date: { $gte: reportStartDate, $lte: reportEndDate }
                }
            },
            {
                $group: {
                    _id: null,
                    totalNewCustomers: { $sum: 1 }
                }
            }
        ]);

        console.log('📈 New users result:', newCustomerStats);

        // Tài khoản hoạt động - Sử dụng LoginLog collection để đếm user đăng nhập
        const activeCustomerStats = await User.aggregate([
            {
                $lookup: {
                    from: 'loginlogs',
                    localField: '_id',
                    foreignField: 'user',
                    as: 'loginHistory'
                }
            },
            {
                $match: {
                    'loginHistory.loginTime': { $gte: reportStartDate, $lte: reportEndDate },
                    'loginHistory.loginStatus': 'success'
                }
            },
            {
                $group: {
                    _id: null,
                    totalActiveCustomers: { $sum: 1 }
                }
            }
        ]);

        console.log('💨 Active users result:', activeCustomerStats);

        // Debug: Kiểm tra Order data
        const sampleOrders = await Order.find({}).select('user totalPrice status date createdAt').limit(5);
        console.log('📦 Sample orders in DB:', sampleOrders);

        // Customer statistics - Combined for demographics (tất cả role)
        const customerStats = await User.aggregate([
            {
                $match: {}
            },
            {
                $addFields: {
                    // Parse formats: timestamp number; ISO; and explicit M/D/YYYY via regex
                    birthMDY: { $regexFind: { input: { $toString: '$birthday' }, regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/ } },
                    today: new Date()
                }
            },
            {
                $addFields: {
                    birthFromMDY: {
                        $cond: [
                            { $ne: ['$birthMDY', null] },
                            { $dateFromParts: {
                                year: { $toInt: { $arrayElemAt: ['$birthMDY.captures', 2] } },
                                month: { $toInt: { $arrayElemAt: ['$birthMDY.captures', 0] } },
                                day: { $toInt: { $arrayElemAt: ['$birthMDY.captures', 1] } }
                            } },
                            null
                        ]
                    }
                }
            },
            {
                $addFields: {
                    birthDateConverted: {
                        $cond: [
                            { $ne: ['$birthFromMDY', null] },
                            '$birthFromMDY',
                            {
                                $switch: {
                                    branches: [
                                        { case: { $isNumber: '$birthday' }, then: { $toDate: '$birthday' } },
                                        { case: { $and: [ { $eq: [{ $type: '$birthday' }, 'string'] }, { $regexMatch: { input: { $toString: '$birthday' }, regex: /\d{4}-\d{2}-\d{2}.*/ } } ] }, then: { $toDate: '$birthday' } }
                                    ],
                                    default: '$birthday'
                                }
                            }
                        ]
                    }
                }
            },
            {
                $addFields: {
                    age: {
                        $cond: [
                            { $and: [ { $ne: ['$birthDateConverted', null] }, { $lte: ['$birthDateConverted', '$today'] } ] },
                            {
                                $floor: {
                                    $divide: [
                                        { $subtract: ['$today', '$birthDateConverted'] },
                                        31557600000
                                    ]
                                }
                            },
                            null
                        ]
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    totalCustomers: { $sum: 1 },
                    activeCustomers: { $sum: { $cond: [{ $ne: ['$lastLogin', null] }, 1, 0] } },
                    avgAge: { $avg: '$age' }
                }
            }
        ]);

        // Avg age across ALL customers with valid birthday (không giới hạn theo khoảng ngày)
        const avgAgeAgg = await User.aggregate([
            {
                $match: {
                    birthday: { $ne: null }
                }
            },
            {
                $addFields: {
                    birthDateConverted: {
                        $cond: [
                            { $isNumber: '$birthday' },
                            { $toDate: '$birthday' },
                            '$birthday'
                        ]
                    },
                    today: new Date()
                }
            },
            {
                $match: { birthDateConverted: { $type: 'date', $lte: new Date() } }
            },
            {
                $addFields: {
                    age: {
                        $floor: {
                            $divide: [
                                { $subtract: ['$today', '$birthDateConverted'] },
                                31557600000
                            ]
                        }
                    }
                }
            },
            {
                $group: { _id: null, avgAge: { $avg: '$age' } }
            }
        ]);
        
        // Customer registration trend by day - sử dụng field 'date'
        const registrationRaw = await User.aggregate([
            {
                $match: {
                    date: { $gte: reportStartDate, $lte: reportEndDate }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);
        // Fill missing dates with 0 for smoother chart display
        const registrationMap = new Map(registrationRaw.map(r => [r._id, r.count]));
        const filledRegistration = [];
        for (let d = new Date(reportStartDate); d <= reportEndDate; d.setDate(d.getDate() + 1)) {
            const key = d.toISOString().split('T')[0];
            filledRegistration.push({ _id: key, count: registrationMap.get(key) || 0 });
        }
        
        // Top customers by order count and value - sử dụng field 'createdAt' cho Order
        const topCustomers = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: reportStartDate, $lte: reportEndDate },
                    status: { $in: ['completed'] }
                }
            },
            {
                $group: {
                    _id: '$user',
                    totalOrders: { $sum: 1 },
                    totalSpent: { $sum: '$totalPrice' },
                    avgOrderValue: { $avg: '$totalPrice' },
                    lastOrderDate: { $max: '$createdAt' }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'customer'
                }
            },
            { $unwind: '$customer' },
            {
                $project: {
                    customerName: '$customer.name',
                    customerEmail: '$customer.email',
                    customerPhone: '$customer.phone',
                    customerBirthday: '$customer.birthday',
                    totalOrders: 1,
                    totalSpent: 1,
                    avgOrderValue: 1,
                    lastOrderDate: 1
                }
            },
            { $sort: { totalSpent: -1 } },
            { $limit: 20 }
        ]);
        
        console.log('🏆 Top customers result:', topCustomers);
        
        // Customer demographics (toàn bộ khách có ngày sinh hợp lệ, không giới hạn theo createdAt)
        const demographics = await User.aggregate([
            { $match: { birthday: { $ne: null } } },
            {
                $addFields: {
                    birthMDY: { $regexFind: { input: { $toString: '$birthday' }, regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/ } },
                    today: new Date()
                }
            },
            {
                $addFields: {
                    birthFromMDY: {
                        $cond: [
                            { $ne: ['$birthMDY', null] },
                            { $dateFromParts: {
                                year: { $toInt: { $arrayElemAt: ['$birthMDY.captures', 2] } },
                                month: { $toInt: { $arrayElemAt: ['$birthMDY.captures', 0] } },
                                day: { $toInt: { $arrayElemAt: ['$birthMDY.captures', 1] } }
                            } },
                            null
                        ]
                    }
                }
            },
            {
                $addFields: {
                    birthDateConverted: {
                        $cond: [
                            { $ne: ['$birthFromMDY', null] },
                            '$birthFromMDY',
                            {
                                $switch: {
                                    branches: [
                                        { case: { $isNumber: '$birthday' }, then: { $toDate: '$birthday' } },
                                        { case: { $and: [ { $eq: [{ $type: '$birthday' }, 'string'] }, { $regexMatch: { input: { $toString: '$birthday' }, regex: /\d{4}-\d{2}-\d{2}.*/ } } ] }, then: { $toDate: '$birthday' } }
                                    ],
                                    default: '$birthday'
                                }
                            }
                        ]
                    }
                }
            },
            { $match: { birthDateConverted: { $ne: null } } },
            {
                $addFields: {
                    age: {
                        $floor: {
                            $divide: [
                                { $subtract: ['$$NOW', '$birthDateConverted'] },
                                31557600000
                            ]
                        }
                    }
                }
            },
            { $match: { age: { $gte: 0, $lte: 130 } } },
            {
                $group: {
                    _id: {
                        ageGroup: {
                            $switch: {
                                branches: [
                                    { case: { $lt: ['$age', 18] }, then: 'Dưới 18' },
                                    { case: { $lt: ['$age', 25] }, then: '18-24' },
                                    { case: { $lt: ['$age', 35] }, then: '25-34' },
                                    { case: { $lt: ['$age', 45] }, then: '35-44' },
                                    { case: { $lt: ['$age', 55] }, then: '45-54' },
                                    { case: { $gte: ['$age', 55] }, then: '55+' }
                                ],
                                default: 'Không xác định'
                            }
                        }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.ageGroup': 1 } }
        ]);
        
        // Customer retention analysis - sử dụng field 'createdAt'
        const retentionAnalysis = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: reportStartDate, $lte: reportEndDate },
                    status: 'completed'
                }
            },
            {
                $group: {
                    _id: '$user',
                    orderDates: { $push: '$createdAt' },
                    orderCount: { $sum: 1 }
                }
            },
            {
                $project: {
                    orderCount: 1,
                    isReturning: { $gt: ['$orderCount', 1] },
                    daysBetweenOrders: {
                        $cond: {
                            if: { $gt: ['$orderCount', 1] },
                            then: {
                                $divide: [
                                    { $subtract: [{ $max: '$orderDates' }, { $min: '$orderDates' }] },
                                    86400000 // Convert to days
                                ]
                            },
                            else: 0
                        }
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    totalCustomers: { $sum: 1 },
                    returningCustomers: { $sum: { $cond: ['$isReturning', 1, 0] } },
                    avgDaysBetweenOrders: { $avg: '$daysBetweenOrders' }
                }
            }
        ]);
        
        const retention = retentionAnalysis[0] || { totalCustomers: 0, returningCustomers: 0, avgDaysBetweenOrders: 0 };
        const returningRate = retention.totalCustomers > 0 ? (retention.returningCustomers / retention.totalCustomers) * 100 : 0;
        const newCustomersRate = retention.totalCustomers > 0 ? (1 - (retention.returningCustomers / retention.totalCustomers)) * 100 : 0;

        const reportData = {
            dateRange: {
                startDate: reportStartDate,
                endDate: reportEndDate
            },
            statistics: {
                totalCustomers: (newCustomerStats[0]?.totalNewCustomers) || 0,
                activeCustomers: (activeCustomerStats[0]?.totalActiveCustomers) || 0,
                avgAge: avgAgeAgg[0]?.avgAge || null
            },
            registrationTrend: filledRegistration,
            topCustomers,
            demographics,
            retention: {
                ...retention,
                avgDaysBetweenOrders: retention.avgDaysBetweenOrders ? Math.round(retention.avgDaysBetweenOrders) : 0,
                returningRate,
                newCustomersRate
            }
        };
        
        // Export functionality
        if (exportFormat === 'json') {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename=customer-report-${reportStartDate.toISOString().split('T')[0]}-to-${reportEndDate.toISOString().split('T')[0]}.json`);
            return res.json(reportData);
        }
        
        if (exportFormat === 'csv') {
            // Generate CSV for top customers
            let csvContent = 'Customer Name,Email,Phone,Total Orders,Total Spent,Avg Order Value,Last Order Date\n';
            topCustomers.forEach(customer => {
                csvContent += `"${customer.customerName}","${customer.customerEmail}","${customer.customerPhone || ''}",${customer.totalOrders},${customer.totalSpent},${customer.avgOrderValue.toFixed(2)},"${customer.lastOrderDate.toISOString().split('T')[0]}"\n`;
            });
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="customer-report.csv"');
            return res.send(csvContent);
        }
        
        console.log('🎯 About to render admin/reports/customers template');
        console.log('📈 Report data keys:', Object.keys(reportData));
        console.log('📈 Final report statistics:', {
            totalCustomers: reportData.statistics.totalCustomers,
            activeCustomers: reportData.statistics.activeCustomers,
            newCustomerStatsRaw: newCustomerStats,
            activeCustomerStatsRaw: activeCustomerStats
        });
        
        res.render('admin/reports/customers', {
            ...reportData,
            title: 'Báo cáo Khách hàng',
            layout: 'main'
        });
        
    } catch (error) {
        console.error('❌ Error generating customer report:', error);
        console.error('❌ Error stack:', error.stack);
        req.flash('error_msg', 'Có lỗi khi tạo báo cáo khách hàng: ' + error.message);
        res.redirect('/admin/dashboard');
    }
});

// Cleanup Payment Status (Fix old payment records)
router.post('/cleanup-payments', isAdmin, async (req, res) => {
    try {
        // Cập nhật tất cả payment có status 'failed' thành 'paid'
        const result = await Payment.updateMany(
            { 
                status: 'failed'
            },
            { 
                $set: { 
                    status: 'paid',
                    paidAt: new Date()
                }
            }
        );
        
        req.flash('success_msg', `Đã cập nhật ${result.modifiedCount} payment records thành công`);
        res.redirect('/admin/reports/payments');
    } catch (error) {
        console.error('Error cleaning up payments:', error);
        req.flash('error_msg', 'Có lỗi khi cập nhật payment records');
        res.redirect('/admin/reports/payments');
    }
});

// Test Sales Data with GMT+7
router.get('/test/sales-data', isAdmin, async (req, res) => {
    try {
        // GMT+7 timezone
        const now = new Date();
        const vietnamOffset = 7 * 60 * 60 * 1000;
        const vietnamNow = new Date(now.getTime() + vietnamOffset);
        
        // Test different date ranges
        const today = new Date(vietnamNow.getFullYear(), vietnamNow.getMonth(), vietnamNow.getDate(), 0, 0, 0);
        const endToday = new Date(vietnamNow.getFullYear(), vietnamNow.getMonth(), vietnamNow.getDate(), 23, 59, 59);
        const last30Days = new Date(vietnamNow.getFullYear(), vietnamNow.getMonth(), vietnamNow.getDate() - 30, 0, 0, 0);
        
        // Check orders in different ranges
        const allOrders = await Order.find({}).sort({ createdAt: -1 }).limit(10);
        const todayOrders = await Order.find({ 
            createdAt: { $gte: today, $lte: endToday } 
        });
        const last30DaysOrders = await Order.find({ 
            createdAt: { $gte: last30Days, $lte: endToday } 
        });
        
        // Check order status distribution
        const ordersByStatus = await Order.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 }, totalAmount: { $sum: '$totalPrice' } } }
        ]);
        
        const testData = {
            timezone: {
                serverTime: now,
                vietnamTime: vietnamNow,
                offset: '+7'
            },
            dateRanges: {
                today: { start: today, end: endToday },
                last30Days: { start: last30Days, end: endToday }
            },
            orders: {
                total: allOrders.length,
                today: todayOrders.length,
                last30Days: last30DaysOrders.length,
                byStatus: ordersByStatus,
                recent: allOrders.slice(0, 3)
            }
        };
        
        res.json(testData);
    } catch (error) {
        res.json({ error: error.message });
    }
});

// Fix Payment Status - Sync with Order Status (GET version for easy access)
router.get('/fix/payment-status', isAdmin, async (req, res) => {
    try {
        // Tìm tất cả đơn hàng completed nhưng payment chưa paid
        const ordersToFix = await Order.find({
            status: 'completed',
            paymentStatus: 'paid'
        }).populate('payment');
        
        let fixedCount = 0;
        
        for (const order of ordersToFix) {
            if (order.payment && order.payment.status !== 'paid') {
                // Cập nhật payment status thành 'paid'
                await Payment.updateOne(
                    { _id: order.payment._id },
                    { 
                        status: 'paid',
                        paidAt: order.payment.paidAt || order.createdAt
                    }
                );
                fixedCount++;
            }
        }
        
        // Tìm payments không có status 'paid' nhưng order đã completed
        const paymentsToFix = await Payment.find({
            status: { $ne: 'paid' }
        }).populate('order');
        
        for (const payment of paymentsToFix) {
            if (payment.order && payment.order.status === 'completed') {
                await Payment.updateOne(
                    { _id: payment._id },
                    { 
                        status: 'paid',
                        paidAt: payment.paidAt || payment.createdAt
                    }
                );
                fixedCount++;
            }
        }
        
        res.json({
            message: `Đã sửa ${fixedCount} payment records`,
            fixedCount,
            totalOrdersChecked: ordersToFix.length,
            totalPaymentsChecked: paymentsToFix.length,
            success: true
        });
    } catch (error) {
        res.json({ error: error.message, success: false });
    }
});

// Fix Payment Status - Sync with Order Status (POST version)
router.post('/fix/payment-status', isAdmin, async (req, res) => {
    try {
        // Tìm tất cả đơn hàng completed nhưng payment chưa paid
        const ordersToFix = await Order.find({
            status: 'completed',
            paymentStatus: 'paid'
        }).populate('payment');
        
        let fixedCount = 0;
        
        for (const order of ordersToFix) {
            if (order.payment && order.payment.status !== 'paid') {
                // Cập nhật payment status thành 'paid'
                await Payment.updateOne(
                    { _id: order.payment._id },
                    { 
                        status: 'paid',
                        paidAt: order.payment.paidAt || order.createdAt
                    }
                );
                fixedCount++;
            }
        }
        
        // Tìm payments không có status 'paid' nhưng order đã completed
        const paymentsToFix = await Payment.find({
            status: { $ne: 'paid' }
        }).populate('order');
        
        for (const payment of paymentsToFix) {
            if (payment.order && payment.order.status === 'completed') {
                await Payment.updateOne(
                    { _id: payment._id },
                    { 
                        status: 'paid',
                        paidAt: payment.paidAt || payment.createdAt
                    }
                );
                fixedCount++;
            }
        }
        
        res.json({
            message: `Đã sửa ${fixedCount} payment records`,
            fixedCount,
            totalOrdersChecked: ordersToFix.length,
            totalPaymentsChecked: paymentsToFix.length
        });
    } catch (error) {
        res.json({ error: error.message });
    }
});

// Debug Payment Status
router.get('/debug/payment-status', isAdmin, async (req, res) => {
    try {
        // Tìm user với email cụ thể
        const user = await User.findOne({ email: 'npthinh03062003@gmail.com' });
        if (!user) {
            return res.json({ error: 'Không tìm thấy user với email npthinh03062003@gmail.com' });
        }
        
        // Tìm đơn hàng 40k
        const orders = await Order.find({ 
            user: user._id, 
            totalPrice: 40000 
        }).sort({ createdAt: -1 }).populate('payment');
        
        // Tìm payment records
        const payments = await Payment.find({ user: user._id }).sort({ createdAt: -1 });
        
        res.json({
            user: {
                id: user._id,
                name: user.name,
                email: user.email
            },
            orders: orders.map(order => ({
                id: order._id,
                date: order.createdAt,
                totalPrice: order.totalPrice,
                status: order.status,
                paymentStatus: order.paymentStatus,
                paymentMethod: order.paymentMethod,
                paymentId: order.payment?._id,
                paymentStatusFromPayment: order.payment?.status
            })),
            payments: payments.map(payment => ({
                id: payment._id,
                date: payment.createdAt,
                amount: payment.amount,
                status: payment.status,
                paymentMethod: payment.paymentMethod,
                orderId: payment.order
            }))
        });
    } catch (error) {
        res.json({ error: error.message });
    }
});

// Quick Sales Debug
router.get('/debug/sales-quick', isAdmin, async (req, res) => {
    try {
        // Kiểm tra đơn hàng cơ bản
        const totalOrders = await Order.countDocuments();
        const completedOrders = await Order.countDocuments({ status: 'completed' });
        const pendingOrders = await Order.countDocuments({ status: 'pending' });
        
        // Lấy một vài đơn hàng mẫu
        const sampleOrders = await Order.find().limit(5).select('status totalPrice createdAt items');
        
        // Tính tổng doanh thu từ đơn hàng completed
        const totalRevenue = await Order.aggregate([
            { $match: { status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$totalPrice' } } }
        ]);
        
        res.json({
            summary: {
                totalOrders,
                completedOrders,
                pendingOrders,
                totalRevenue: totalRevenue[0]?.total || 0
            },
            sampleOrders
        });
    } catch (error) {
        res.json({ error: error.message });
    }
});

// Debug Database Data
router.get('/debug/data', isAdmin, async (req, res) => {
    try {
        // Check Orders
        const orderCount = await Order.countDocuments();
        const ordersByStatus = await Order.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);
        
        // Check Payments
        const paymentCount = await Payment.countDocuments();
        const paymentsByStatus = await Payment.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);
        
        // Check recent Orders
        const recentOrders = await Order.find().sort({ createdAt: -1 }).limit(5).populate('user', 'name');
        
        // Check recent Payments
        const recentPayments = await Payment.find().sort({ createdAt: -1 }).limit(5).populate('user', 'name');
        
        const debugData = {
            orders: {
                total: orderCount,
                byStatus: ordersByStatus,
                recent: recentOrders
            },
            payments: {
                total: paymentCount,
                byStatus: paymentsByStatus,
                recent: recentPayments
            }
        };
        
        res.json(debugData);
    } catch (error) {
        console.error('Debug data error:', error);
        res.json({ error: error.message });
    }
});

// Payment Report Test (Simple version)
router.get('/reports/payments-test', async (req, res) => {
    try {
        res.render('admin/reports/payments', {
            dateRange: {
                startDate: new Date(),
                endDate: new Date()
            },
            statistics: { 
                totalPayments: 0, 
                totalAmount: 0, 
                avgAmount: 0, 
                successfulPayments: 0, 
                failedPayments: 0, 
                pendingPayments: 0 
            },
            paymentTrends: [],
            paymentMethodStats: [],
            topTransactions: [],
            failedPayments: [],
            hourlyRevenue: [],
            processingTime: { 
                avgProcessingTime: 0, 
                minProcessingTime: 0, 
                maxProcessingTime: 0 
            },
            allPaymentMethods: [
                { name: 'cash', displayName: 'Tiền mặt' },
                { name: 'card', displayName: 'Thẻ tín dụng' }
            ],
            filters: {},
            title: 'Báo cáo Thanh toán (Test)'
        });
    } catch (error) {
        console.error('Payment report test error:', error);
        res.send('Error: ' + error.message);
    }
});

// Payment Report (Báo cáo thanh toán)
router.get('/reports/payments', hasPermission('view_reports'), async (req, res) => {
    try {
        const { startDate, endDate, exportFormat, paymentMethod, status } = req.query;
        
        // Default date range (last 14 days for better chart readability)
        const defaultEndDate = new Date();
        const defaultStartDate = new Date();
        defaultStartDate.setDate(defaultStartDate.getDate() - 14);
        
        const reportStartDate = startDate ? new Date(startDate) : defaultStartDate;
        const reportEndDate = endDate ? new Date(endDate + 'T23:59:59') : defaultEndDate;
        
        // Debug logs
        console.log('💳 Payment Report - Date range:', {
            startDate: reportStartDate.toISOString(),
            endDate: reportEndDate.toISOString(),
            filters: { paymentMethod, status }
        });
        
        // Build filter for payments
        const paymentFilter = {
            createdAt: { $gte: reportStartDate, $lte: reportEndDate }
        };
        if (paymentMethod) paymentFilter.paymentMethod = paymentMethod;
        if (status) paymentFilter.status = status;
        
        // Debug: Check total payments in DB
        const totalPaymentsInDB = await Payment.countDocuments();
        const paymentsInRange = await Payment.countDocuments(paymentFilter);
        console.log('💳 Payment counts:', { totalPaymentsInDB, paymentsInRange });
        
        // Payment statistics
        const paymentStats = await Payment.aggregate([
            { $match: paymentFilter },
            {
                $group: {
                    _id: null,
                    totalPayments: { $sum: 1 },
                    totalAmount: { $sum: '$amount' },
                    avgAmount: { $avg: '$amount' },
                    successfulPayments: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] } },
                    failedPayments: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
                    pendingPayments: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } }
                }
            }
        ]);
        
        console.log('💳 Payment stats result:', paymentStats[0]);
        
        // Debug: Show what should be displayed
        const displayStats = paymentStats[0] || { 
            totalPayments: 0, 
            totalAmount: 0, 
            avgAmount: 0, 
            successfulPayments: 0, 
            failedPayments: 0, 
            pendingPayments: 0 
        };
        console.log('💳 Stats that will be displayed:', {
            totalPayments: displayStats.totalPayments,
            totalAmount: displayStats.totalAmount,
            avgAmount: displayStats.avgAmount,
            dateRange: `${reportStartDate.toISOString().split('T')[0]} to ${reportEndDate.toISOString().split('T')[0]}`
        });
        
        // Debug: Check recent payments
        const recentPayments = await Payment.find().sort({ createdAt: -1 }).limit(5);
        console.log('💳 Recent payments:', recentPayments.map(p => ({
            id: p._id,
            amount: p.amount,
            status: p.status,
            createdAt: p.createdAt,
            date: p.createdAt.toISOString().split('T')[0]
        })));
        
        // Payment trends by day
        const paymentTrends = await Payment.aggregate([
            { $match: paymentFilter },
            {
                $group: {
                    _id: { 
                        date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                        status: '$status'
                    },
                    count: { $sum: 1 },
                    amount: { $sum: '$amount' }
                }
            },
            { $sort: { '_id.date': 1 } }
        ]);
        
        console.log('💳 Payment trends result:', paymentTrends);
        console.log('💳 Payment filter used:', paymentFilter);
        
        // Fill missing dates with zero values for continuous chart
        const filledPaymentTrends = [];
        const fillStartDate = new Date(reportStartDate);
        const fillEndDate = new Date(reportEndDate);
        
        // Create a map for quick lookup
        const trendsMap = {};
        paymentTrends.forEach(trend => {
            const key = `${trend._id.date}_${trend._id.status}`;
            trendsMap[key] = trend;
        });
        
        // Fill all dates in range
        for (let d = new Date(fillStartDate); d <= fillEndDate; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            
            // Add paid transactions for this date
            const paidKey = `${dateStr}_paid`;
            if (trendsMap[paidKey]) {
                filledPaymentTrends.push(trendsMap[paidKey]);
            } else {
                filledPaymentTrends.push({
                    _id: { date: dateStr, status: 'paid' },
                    count: 0,
                    amount: 0
                });
            }
            
            // Add failed transactions for this date
            const failedKey = `${dateStr}_failed`;
            if (trendsMap[failedKey]) {
                filledPaymentTrends.push(trendsMap[failedKey]);
            } else {
                filledPaymentTrends.push({
                    _id: { date: dateStr, status: 'failed' },
                    count: 0,
                    amount: 0
                });
            }
        }
        
        console.log('💳 Filled payment trends (first 10):', filledPaymentTrends.slice(0, 10));
        
        // Payment methods breakdown
        const paymentMethodStats = await Payment.aggregate([
            { $match: paymentFilter },
            {
                $group: {
                    _id: '$paymentMethod',
                    count: { $sum: 1 },
                    totalAmount: { $sum: '$amount' },
                    avgAmount: { $avg: '$amount' },
                    successRate: {
                        $avg: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] }
                    }
                }
            },
            { $sort: { totalAmount: -1 } }
        ]);
        
        // Top transactions - use Order status to determine payment success
        const topTransactions = await Payment.find(paymentFilter)
            .populate('user', 'name email')
            .populate('order', 'orderNumber totalPrice status')
            .sort({ amount: -1 })
            .limit(20);
        
        // Fix display status based on order status
        topTransactions.forEach(payment => {
            if (payment.order && payment.order.status === 'completed') {
                payment.displayStatus = 'Thành công';
            } else if (payment.order && payment.order.status === 'cancelled') {
                payment.displayStatus = 'Thất bại';
            } else {
                payment.displayStatus = payment.status === 'paid' ? 'Thành công' : 'Thất bại';
            }
        });
        
        // Debug top transactions
        console.log('💰 Top transactions sample:', topTransactions.slice(0, 2).map(p => ({
            id: p._id,
            amount: p.amount,
            status: p.status,
            createdAt: p.createdAt,
            paidAt: p.paidAt,
            hasOrder: !!p.order,
            orderStatus: p.order?.status
        })));
        
        // Failed payments analysis
        const failedPayments = await Payment.find({
            ...paymentFilter,
            status: 'failed'
        })
        .populate('user', 'name email')
        .populate('order', 'orderNumber')
        .sort({ createdAt: -1 })
        .limit(10);
        
        // Revenue by hour analysis - TODAY ONLY for clearer insights (Vietnam timezone UTC+7)
        const now = new Date();
        
        // Get today's date string in Vietnam timezone
        const vietnamToday = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }); // YYYY-MM-DD format
        
        console.log('⏰ Today in Vietnam:', vietnamToday);
        
        const hourlyRevenue = await Payment.aggregate([
            { 
                $match: { 
                    status: 'paid'
                }
            },
            {
                $addFields: {
                    vietnamDate: { 
                        $dateToString: { 
                            format: '%Y-%m-%d',
                            date: '$createdAt',
                            timezone: 'Asia/Ho_Chi_Minh'
                        }
                    },
                    vietnamHour: { 
                        $hour: { 
                            date: '$createdAt',
                            timezone: 'Asia/Ho_Chi_Minh'
                        }
                    }
                }
            },
            {
                $match: {
                    vietnamDate: vietnamToday
                }
            },
            {
                $group: {
                    _id: '$vietnamHour',
                    count: { $sum: 1 },
                    revenue: { $sum: '$amount' }
                }
            },
            { $sort: { _id: 1 } }
        ]);
        
        console.log('💳 Today hourly revenue:', hourlyRevenue);
        
        // Average hourly revenue for the selected period (for comparison)
        const avgHourlyRevenue = await Payment.aggregate([
            { 
                $match: { 
                    ...paymentFilter,
                    status: 'paid'
                }
            },
            {
                $group: {
                    _id: { $hour: '$createdAt' },
                    count: { $sum: 1 },
                    revenue: { $sum: '$amount' },
                    days: { $addToSet: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } }
                }
            },
            {
                $project: {
                    hour: '$_id',
                    avgRevenue: { $divide: ['$revenue', { $size: '$days' }] },
                    totalRevenue: '$revenue',
                    totalCount: '$count',
                    daysCount: { $size: '$days' }
                }
            },
            { $sort: { hour: 1 } }
        ]);
        
        // Payment processing time analysis (REMOVED)
        
        // Debug logs for processing time (REMOVED)
        
        // Fake data logic for processing time (REMOVED)
        
        const reportData = {
            dateRange: {
                startDate: reportStartDate,
                endDate: reportEndDate
            },
            today: new Date(), // For displaying today's date in template
            statistics: paymentStats[0] || { 
                totalPayments: 0, 
                totalAmount: 0, 
                avgAmount: 0, 
                successfulPayments: 0, 
                failedPayments: 0, 
                pendingPayments: 0 
            },
            paymentTrends: filledPaymentTrends,
            paymentMethodStats,
            topTransactions,
            failedPayments,
            hourlyRevenue, // Today's hourly revenue
            avgHourlyRevenue, // Average hourly revenue for the period
            // processingTime: finalProcessingTime (REMOVED)
        };
        
        // Export functionality
        if (exportFormat === 'json') {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename=payment-report-${reportStartDate.toISOString().split('T')[0]}-to-${reportEndDate.toISOString().split('T')[0]}.json`);
            return res.json(reportData);
        }
        
        if (exportFormat === 'csv') {
            // Generate CSV for top transactions
            let csvContent = 'Date,Transaction ID,Customer,Order Number,Amount,Payment Method,Status,Processing Time\n';
            topTransactions.forEach(payment => {
                const processingTime = payment.paidAt ? 
                    Math.round((payment.paidAt - payment.createdAt) / 1000) : 'N/A';
                csvContent += `"${payment.createdAt.toISOString().split('T')[0]}","${payment._id}","${payment.user?.name || 'N/A'}","${payment.order?.orderNumber || 'N/A'}",${payment.amount},"${payment.paymentMethod}","${payment.status}","${processingTime}"\n`;
            });
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=payment-transactions-${reportStartDate.toISOString().split('T')[0]}-to-${reportEndDate.toISOString().split('T')[0]}.csv`);
            return res.send(csvContent);
        }
        
        // Audit log for report generation
        await logAuditAction(
            req,
            'data_export',
            'System',
            null,
            {
                reportType: 'payment_report',
                dateRange: `${reportStartDate.toISOString().split('T')[0]} to ${reportEndDate.toISOString().split('T')[0]}`,
                exportFormat: exportFormat || 'view',
                recordCount: reportData.statistics.totalPayments,
                filters: { paymentMethod, status }
            }
        );
        
        // Get all payment methods for filter (hardcoded for now)
        const allPaymentMethods = [
            { name: 'cash', displayName: 'Tiền mặt' },
            { name: 'card', displayName: 'Thẻ tín dụng' },
            { name: 'momo', displayName: 'MoMo' },
            { name: 'banking', displayName: 'Chuyển khoản' },
            { name: 'paypal', displayName: 'PayPal' }
        ];
        
        res.render('admin/reports/payments', {
            ...reportData,
            allPaymentMethods,
            filters: req.query,
            title: 'Báo cáo Thanh toán'
        });
        
    } catch (error) {
        console.error('Error generating payment report:', error);
        req.flash('error_msg', 'Có lỗi khi tạo báo cáo thanh toán');
        res.redirect('/admin');
    }
});

// Product Report (Báo cáo sản phẩm)
router.get('/reports/products', hasPermission('view_reports'), async (req, res) => {
    console.log('🚀 Product Reports route accessed!');
    try {
        const { startDate, endDate, exportFormat, category } = req.query;
        
        // Default date range (last 14 days for consistency with other reports)
        const defaultEndDate = new Date();
        const defaultStartDate = new Date();
        defaultStartDate.setDate(defaultStartDate.getDate() - 14);
        
        const reportStartDate = startDate ? new Date(startDate) : defaultStartDate;
        const reportEndDate = endDate ? new Date(endDate + 'T23:59:59') : defaultEndDate;
        
        // Debug: Check if there are any orders in the database
        const totalOrders = await Order.countDocuments();
        const completedOrders = await Order.countDocuments({ status: 'completed' });
        const ordersInRange = await Order.countDocuments({
            createdAt: { $gte: reportStartDate, $lte: reportEndDate },
            status: 'completed'
        });
        console.log('📦 Order counts:', { totalOrders, completedOrders, ordersInRange });
        
        // Debug: Check sample order structure
        const sampleOrder = await Order.findOne({ status: 'completed' }).populate('items.product');
        console.log('📦 Sample order structure:', JSON.stringify(sampleOrder, null, 2));
        
        // Build match conditions
        const orderMatch = {
            createdAt: { $gte: reportStartDate, $lte: reportEndDate },
            status: 'completed'
        };
        
        const productStats = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: reportStartDate, $lte: reportEndDate },
                    status: { $ne: 'cancelled' }
                }
            },
            {
                $group: {
                    _id: null,
                    totalProductsSold: { 
                        $sum: { 
                            $sum: '$items.quantity' 
                        } 
                    },
                    totalRevenue: { $sum: '$totalPrice' }, // Use actual order total (after discounts)
                    uniqueProducts: { 
                        $addToSet: {
                            $map: {
                                input: '$items',
                                as: 'item',
                                in: '$$item.product'
                            }
                        }
                    },
                    totalOrders: { $sum: 1 }
                }
            },
            {
                $project: {
                    totalProductsSold: 1,
                    totalRevenue: 1,
                    uniqueProductCount: { 
                        $size: { 
                            $reduce: {
                                input: '$uniqueProducts',
                                initialValue: [],
                                in: { $setUnion: ['$$value', '$$this'] }
                            }
                        }
                    },
                    totalOrders: 1,
                    avgRevenuePerOrder: { 
                        $cond: [
                            { $eq: ['$totalOrders', 0] },
                            0,
                            { $divide: ['$totalRevenue', '$totalOrders'] }
                        ]
                    }
                }
            }
        ]);
        
        // Best selling products - Calculate revenue based on actual order totals (after discounts)
        const bestSellingProducts = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: reportStartDate, $lte: reportEndDate },
                    status: { $ne: 'cancelled' }
                }
            },
            {
                $addFields: {
                    // Calculate total original price for this order
                    originalOrderTotal: {
                        $sum: {
                            $map: {
                                input: "$items",
                                as: "item",
                                in: {
                                    $multiply: [
                                        "$$item.quantity",
                                        { $ifNull: ["$$item.price", 50000] } // fallback price if missing
                                    ]
                                }
                            }
                        }
                    }
                }
            },
            { $unwind: "$items" },
            {
                $lookup: {
                    from: "products",
                    localField: "items.product",
                    foreignField: "_id",
                    as: "productInfo"
                }
            },
            { $unwind: "$productInfo" },
            {
                $addFields: {
                    // Calculate original item price
                    originalItemPrice: {
                        $cond: [
                            { $eq: ['$productInfo.category', 'Topping'] },
                            { 
                                $ifNull: [
                                    '$productInfo.price', 
                                    // If topping price is null, try to get from sizes[0] or default to 8000
                                    {
                                        $ifNull: [
                                            { $arrayElemAt: ['$productInfo.sizes.price', 0] },
                                            8000
                                        ]
                                    }
                                ]
                            },
                            {
                                $let: {
                                    vars: {
                                        sizeObj: {
                                            $arrayElemAt: [
                                                {
                                                    $filter: {
                                                        input: "$productInfo.sizes",
                                                        cond: { $eq: ["$$this.size", "$items.size"] }
                                                    }
                                                },
                                                0
                                            ]
                                        }
                                    },
                                    in: {
                                        $cond: [
                                            { $ne: ["$$sizeObj", null] },
                                            "$$sizeObj.price",
                                            50000
                                        ]
                                    }
                                }
                            }
                        ]
                    }
                }
            },
            {
                $addFields: {
                    // Calculate actual revenue for this item
                    actualItemRevenue: {
                        $cond: [
                            // If this is a topping, always use full price (toppings are never discounted)
                            { $eq: ['$productInfo.category', 'Topping'] },
                            { $multiply: ["$items.quantity", "$originalItemPrice"] },
                            // For main products: if no voucher applied, use original price
                            {
                                $cond: [
                                    // Check if voucher was applied (originalPrice exists and differs from totalPrice)
                                    { 
                                        $and: [
                                            { $ne: [{ $ifNull: ["$originalPrice", 0] }, 0] },
                                            { $ne: ["$originalPrice", "$totalPrice"] }
                                        ]
                                    },
                                    // Voucher applied: calculate proportional discount
                                    {
                                        $cond: [
                                            { $gt: ["$originalOrderTotal", 0] },
                                            {
                                                $multiply: [
                                                    "$totalPrice",
                                                    {
                                                        $divide: [
                                                            { $multiply: ["$items.quantity", "$originalItemPrice"] },
                                                            "$originalOrderTotal"
                                                        ]
                                                    }
                                                ]
                                            },
                                            { $multiply: ["$items.quantity", "$originalItemPrice"] }
                                        ]
                                    },
                                    // No voucher: use original item price
                                    { $multiply: ["$items.quantity", "$originalItemPrice"] }
                                ]
                            }
                        ]
                    }
                }
            },
            {
                $group: {
                    _id: "$items.product",
                    productName: { $first: "$productInfo.name" },
                    productCategory: { $first: "$productInfo.category" },
                    productImage: { $first: "$productInfo.image" },
                    totalQuantity: { $sum: "$items.quantity" },
                    totalRevenue: { $sum: "$actualItemRevenue" },
                    totalOriginalRevenue: { $sum: { $multiply: ["$items.quantity", "$originalItemPrice"] } },
                    orderCount: { $addToSet: "$_id" }
                }
            },
            {
                $project: {
                    productName: 1,
                    productCategory: 1,
                    productImage: 1,
                    totalQuantity: 1,
                    totalRevenue: 1,
                    totalOriginalRevenue: 1,
                    orderCount: { $size: "$orderCount" },
                    avgPrice: { 
                        $cond: [
                            { $eq: ["$totalQuantity", 0] }, 
                            0, 
                            { $divide: ["$totalRevenue", "$totalQuantity"] } 
                        ]
                    },
                    avgOriginalPrice: { 
                        $cond: [
                            { $eq: ["$totalQuantity", 0] }, 
                            0, 
                            { $divide: ["$totalOriginalRevenue", "$totalQuantity"] } 
                        ]
                    }
                }
            },
            { $sort: { totalRevenue: -1 } },
            { $limit: 20 }
        ]);
        
        // Category Revenue Distribution for Pie Chart - Use proportional allocation of actual order totals
        const categoryRevenue = await Order.aggregate([
            { $match: orderMatch },
            {
                $addFields: {
                    // Calculate total original price for this order
                    originalOrderTotal: {
                        $sum: {
                            $map: {
                                input: "$items",
                                as: "item",
                                in: {
                                    $multiply: [
                                        "$$item.quantity",
                                        { $ifNull: ["$$item.price", 50000] }
                                    ]
                                }
                            }
                        }
                    }
                }
            },
            { $unwind: '$items' },
            {
                $lookup: {
                    from: 'products',
                    localField: 'items.product',
                    foreignField: '_id',
                    as: 'productInfo'
                }
            },
            { $unwind: '$productInfo' },
            {
                $addFields: {
                    // Calculate proportional revenue for this item based on actual order total
                    itemRevenue: {
                        $cond: [
                            { $gt: ["$originalOrderTotal", 0] },
                            {
                                $multiply: [
                                    "$totalPrice",
                                    {
                                        $divide: [
                                            { $multiply: ["$items.quantity", { $ifNull: ["$items.price", 50000] }] },
                                            "$originalOrderTotal"
                                        ]
                                    }
                                ]
                            },
                            { $multiply: ["$items.quantity", { $ifNull: ["$items.price", 50000] }] }
                        ]
                    }
                }
            },
            {
                $group: {
                    _id: '$productInfo.category',
                    totalRevenue: { $sum: '$itemRevenue' },
                    totalQuantity: { $sum: '$items.quantity' }
                }
            },
            { $sort: { totalRevenue: -1 } }
        ]);
        
        // Top 5 Products for Bar Chart (subset of bestSellingProducts)
        const top5Products = bestSellingProducts.slice(0, 5);
        const maxQuantity = top5Products.length > 0 ? Math.max(...top5Products.map(p => p.totalQuantity)) : 1;
        const totalQuantityTop5 = top5Products.reduce((sum, p) => sum + p.totalQuantity, 0);
        
        // Total category revenue for percentage calculation
        const totalCategoryRevenue = categoryRevenue.reduce((sum, cat) => sum + cat.totalRevenue, 0);
        
        // Add percentage to each category
        categoryRevenue.forEach(cat => {
            cat.percentage = totalCategoryRevenue > 0 ? (cat.totalRevenue / totalCategoryRevenue) * 100 : 0;
        });
        
        // Add percentage to top5Products
        top5Products.forEach(product => {
            product.percentage = totalQuantityTop5 > 0 ? (product.totalQuantity / totalQuantityTop5) * 100 : 0;
        });
        
        // Removed unnecessary aggregations for better performance
        // (categoryPerformance, lowStockProducts, productTrends, priceAnalysis, recentProducts, seasonalAnalysis)
        
        // Debug logs
        console.log('📦 Product Report - Date range:', {
            startDate: reportStartDate.toISOString(),
            endDate: reportEndDate.toISOString()
        });
        console.log('📦 Product stats result:', productStats[0]);
        console.log('📦 Best selling products count:', bestSellingProducts.length);
        console.log('📦 Best selling products sample:', JSON.stringify(bestSellingProducts.slice(0, 1), null, 2));
        console.log('📦 Category revenue:', JSON.stringify(categoryRevenue, null, 2));
        
        // Debug: Let's check some actual orders to see what's happening
        const debugOrders = await Order.find({
            createdAt: { $gte: reportStartDate, $lte: reportEndDate },
            status: { $ne: 'cancelled' }
        }).populate('items.product').limit(3);
        
        console.log('🔍 DEBUG: Sample orders for analysis:');
        debugOrders.forEach((order, index) => {
            console.log(`Order ${index + 1}:`);
            console.log(`  - Total Price: ${order.totalPrice}`);
            console.log(`  - Original Price: ${order.originalPrice || 'N/A'}`);
            console.log(`  - Voucher: ${JSON.stringify(order.voucher) || 'N/A'}`);
            console.log(`  - Items:`);
            order.items.forEach(item => {
                console.log(`    * ${item.product?.name} (${item.size}) x${item.quantity}`);
                console.log(`      Category: ${item.product?.category}`);
                if (item.product?.category === 'Topping') {
                    console.log(`      Price: ${item.product?.price}`);
                } else {
                    const sizePrice = item.product?.sizes?.find(s => s.size === item.size)?.price;
                    console.log(`      Size Price: ${sizePrice}`);
                }
                console.log(`      Item Price Field: ${item.price || 'MISSING'}`);
            });
            console.log('');
        });
        
        // Let's specifically check the Trà Tắc Mật Ong order
        const traTacOrder = await Order.findOne({
            'items.product': '68919fb908260a9c2fbe3928', // Trà Tắc Mật Ong ID from log
            createdAt: { $gte: reportStartDate, $lte: reportEndDate }
        }).populate('items.product');
        
        if (traTacOrder) {
            console.log('🔍 SPECIFIC DEBUG - Trà Tắc Mật Ong Order:');
            console.log(`  - Order ID: ${traTacOrder._id}`);
            console.log(`  - Total Price: ${traTacOrder.totalPrice}`);
            console.log(`  - Original Price: ${traTacOrder.originalPrice || 'N/A'}`);
            console.log(`  - Voucher Applied: ${JSON.stringify(traTacOrder.voucher) || 'None'}`);
            const traTacItem = traTacOrder.items.find(item => item.product.name === 'Trà Tắc Mật Ong');
            if (traTacItem) {
                console.log(`  - Product Size: ${traTacItem.size}`);
                const expectedPrice = traTacItem.product.sizes.find(s => s.size === traTacItem.size)?.price;
                console.log(`  - Expected Price for ${traTacItem.size}: ${expectedPrice}`);
                console.log(`  - Quantity: ${traTacItem.quantity}`);
                console.log(`  - Expected Total: ${expectedPrice * traTacItem.quantity}`);
            }
        }
        console.log('📦 Category filter:', category);
        console.log('📦 Category revenue data:', categoryRevenue);
        console.log('📦 Top 5 products data:', top5Products);
        
        const reportData = {
            dateRange: {
                startDate: reportStartDate,
                endDate: reportEndDate
            },
            statistics: productStats[0] || {
                totalProductsSold: 0,
                totalRevenue: 0,
                uniqueProductCount: 0,
                totalOrders: 0,
                avgRevenuePerOrder: 0
            },
            bestSellingProducts,
            categoryRevenue,
            top5Products,
            maxQuantity,
            totalQuantityTop5,
            totalCategoryRevenue
        };
        
        // Export functionality
        if (exportFormat === 'json') {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename=product-report-${reportStartDate.toISOString().split('T')[0]}-to-${reportEndDate.toISOString().split('T')[0]}.json`);
            return res.json(reportData);
        }
        
        if (exportFormat === 'csv') {
            // Generate CSV for best selling products
            let csvContent = 'Product Name,Category,Quantity Sold,Revenue,Order Count,Average Price\n';
            bestSellingProducts.forEach(product => {
                csvContent += `"${product.productName}","${product.productCategory}",${product.totalQuantity},${product.totalRevenue},${product.orderCount},${product.avgPrice}\n`;
            });
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=best-selling-products-${reportStartDate.toISOString().split('T')[0]}-to-${reportEndDate.toISOString().split('T')[0]}.csv`);
            return res.send(csvContent);
        }
        
        // Audit log for report generation
        await logAuditAction(
            req.user._id,
            'REPORT_GENERATED',
            'Product Report',
            `Generated product report for ${reportStartDate.toISOString().split('T')[0]} to ${reportEndDate.toISOString().split('T')[0]}`,
            req.ip
        );
        
        // Apply category filter to both statistics and bestSellingProducts if specified
        let filteredBestSellingProducts = reportData.bestSellingProducts;
        let filteredStatistics = reportData.statistics;
        
        if (category) {
            // Filter best selling products by category
            filteredBestSellingProducts = reportData.bestSellingProducts.filter(
                product => product.productCategory === category
            );
            
            // Recalculate statistics based on filtered products
            if (filteredBestSellingProducts.length > 0) {
                filteredStatistics = {
                    totalProductsSold: filteredBestSellingProducts.reduce((sum, p) => sum + p.totalQuantity, 0),
                    totalRevenue: filteredBestSellingProducts.reduce((sum, p) => sum + p.totalRevenue, 0),
                    uniqueProductCount: filteredBestSellingProducts.length,
                    totalOrders: filteredBestSellingProducts.reduce((sum, p) => sum + p.orderCount, 0),
                    avgRevenuePerOrder: 0 // Will calculate below
                };
                // Calculate average revenue per order
                filteredStatistics.avgRevenuePerOrder = filteredStatistics.totalOrders > 0 
                    ? filteredStatistics.totalRevenue / filteredStatistics.totalOrders 
                    : 0;
            } else {
                // No products in this category
                filteredStatistics = {
                    totalProductsSold: 0,
                    totalRevenue: 0,
                    uniqueProductCount: 0,
                    totalOrders: 0,
                    avgRevenuePerOrder: 0
                };
            }
        }
        
        // Get all categories for filter
        const allCategories = await Product.distinct('category');
        
        res.render('admin/reports/products', {
            ...reportData,
            statistics: filteredStatistics,
            bestSellingProducts: filteredBestSellingProducts,
            allCategories,
            filters: req.query,
            title: 'Báo cáo sản phẩm'
        });
        
    } catch (error) {
        console.error('Product report error:', error);
        req.flash('error_msg', 'Có lỗi khi tạo báo cáo sản phẩm');
        res.redirect('/admin');
    }
});

// Sales Report (Báo cáo bán hàng)
router.get('/reports/sales', hasPermission('view_reports'), async (req, res) => {
    try {
        const { startDate, endDate, exportFormat, period } = req.query;
        const vietnamNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));

        const defaultEndDate = new Date();
        const defaultStartDate = new Date();
        defaultStartDate.setDate(defaultStartDate.getDate() - 14);

        const reportStartDate = startDate ? new Date(startDate) : defaultStartDate;
        const reportEndDate = endDate ? new Date(endDate + 'T23:59:59') : defaultEndDate;

        const match = { createdAt: { $gte: reportStartDate, $lte: reportEndDate }, status: 'completed' };

        const [overview, dailySales, revenueByCategory, toppingRevenue, hourlySales, weeklySales, topDays, customerAnalysis, salesByPaymentMethod] = await Promise.all([
            // 1. Overview
            Order.aggregate([
                { $match: match },
                { $group: { _id: null, totalOrders: { $sum: 1 }, totalRevenue: { $sum: '$totalPrice' }, completedOrders: { $sum: 1 } } },
                { $project: { _id: 0, totalOrders: 1, totalRevenue: 1, completedOrders: 1, avgOrderValue: { $cond: [{ $gt: ['$totalOrders', 0] }, { $divide: ['$totalRevenue', '$totalOrders'] }, 0] } } }
            ]),
            // 2. Daily Sales
            Order.aggregate([
                { $match: match },
                { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Ho_Chi_Minh' } }, orderCount: { $sum: 1 }, revenue: { $sum: '$totalPrice' } } },
                { $sort: { _id: 1 } }
            ]),
            // 3. Revenue by Category - Use proportional allocation of actual order totals
            Order.aggregate([
                { $match: match },
                {
                    $addFields: {
                        // Calculate total original price for this order
                        originalOrderTotal: {
                            $sum: {
                                $map: {
                                    input: "$items",
                                    as: "item",
                                    in: {
                                        $multiply: [
                                            "$$item.quantity",
                                            { $ifNull: ["$$item.price", 50000] }
                                        ]
                                    }
                                }
                            }
                        }
                    }
                },
                { $unwind: '$items' },
                { $lookup: { from: 'products', localField: 'items.product', foreignField: '_id', as: 'productInfo' } },
                { $unwind: '$productInfo' },
                {
                    $addFields: {
                        // Calculate proportional revenue for this item based on actual order total
                        itemRevenue: {
                            $cond: [
                                { $gt: ["$originalOrderTotal", 0] },
                                {
                                    $multiply: [
                                        "$totalPrice",
                                        {
                                            $divide: [
                                                { $multiply: ["$items.quantity", { $ifNull: ["$items.price", 50000] }] },
                                                "$originalOrderTotal"
                                            ]
                                        }
                                    ]
                                },
                                { $multiply: ["$items.quantity", { $ifNull: ["$items.price", 50000] }] }
                            ]
                        }
                    }
                },
                {
                    $group: {
                        _id: '$productInfo.category',
                        revenue: { $sum: '$itemRevenue' },
                        quantity: { $sum: '$items.quantity' },
                        orders: { $addToSet: '$_id' }
                    }
                },
                {
                    $project: {
                        _id: 1,
                        revenue: 1,
                        quantity: 1,
                        orderCount: { $size: '$orders' },
                        avgPrice: { $cond: [{ $gt: ['$quantity', 0] }, { $divide: ['$revenue', '$quantity'] }, 0] }
                    }
                },
                { $sort: { revenue: -1 } }
            ]),
            // 4. Topping Revenue (calculated from items that have toppings)
            Order.aggregate([
                { $match: match },
                { $unwind: '$items' },
                { $match: { 'items.toppings': { $exists: true, $ne: [] } } }, // Only items with toppings
                { $unwind: '$items.toppings' },
                { $lookup: { from: 'products', localField: 'items.toppings', foreignField: '_id', as: 'toppingInfo' } },
                { $unwind: '$toppingInfo' },
                {
                    $group: {
                        _id: '$toppingInfo.category',
                        revenue: { $sum: { $multiply: [{ $ifNull: ['$toppingInfo.price', 0] }, '$items.quantity'] } },
                        quantity: { $sum: '$items.quantity' },
                        orders: { $addToSet: '$_id' }
                    }
                },
                { $addFields: { orders: { $size: '$orders' } } },
                { $sort: { revenue: -1 } }
            ]),
            // 5. Hourly Sales (Today)
            Order.aggregate([
                { $match: { 
                    createdAt: { 
                        $gte: new Date(new Date().setHours(0, 0, 0, 0)), 
                        $lt: new Date(new Date().setHours(23, 59, 59, 999)) 
                    }, 
                    status: 'completed' 
                } },
                { $group: { _id: { $hour: { date: '$createdAt', timezone: 'Asia/Ho_Chi_Minh' } }, orders: { $sum: 1 } } },
                { $sort: { _id: 1 } }
            ]),
            // 6. Weekly Sales (This week - Monday to today)
            Order.aggregate([
                { $match: { 
                    createdAt: { 
                        $gte: (() => {
                            const today = new Date();
                            const monday = new Date(today);
                            const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
                            const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // If Sunday, go back 6 days to Monday
                            monday.setDate(today.getDate() - daysToSubtract);
                            monday.setHours(0, 0, 0, 0);
                            console.log('📅 Weekly Sales - Start (Monday):', monday.toISOString());
                            return monday;
                        })(),
                        $lte: (() => {
                            const today = new Date();
                            today.setHours(23, 59, 59, 999);
                            console.log('📅 Weekly Sales - End (Today):', today.toISOString());
                            return today; // Only up to today, not the full week
                        })()
                    }, 
                    status: 'completed' 
                } },
                { 
                    $addFields: {
                        // Keep original dayOfWeek: Sunday=1, Monday=2, ..., Saturday=7
                        adjustedDayOfWeek: { $dayOfWeek: { date: '$createdAt', timezone: 'Asia/Ho_Chi_Minh' } }
                    }
                },
                { $group: { _id: '$adjustedDayOfWeek', orders: { $sum: 1 } } },
                { $sort: { _id: 1 } } // Now Monday=2 comes first, Sunday=7 comes last
            ]),
            // 7. Top Days
            Order.aggregate([
                { $match: match },
                { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Ho_Chi_Minh' } }, orders: { $sum: 1 }, revenue: { $sum: '$totalPrice' } } },
                { $sort: { revenue: -1 } },
                { $limit: 10 }
            ]),
            // 8. Customer Analysis
            Order.aggregate([
                { $match: match },
                { $group: { _id: '$user', totalSpent: { $sum: '$totalPrice' }, orderCount: { $sum: 1 } } },
                { $group: { _id: null, totalCustomers: { $sum: 1 }, newCustomers: { $sum: { $cond: [{ $eq: ['$orderCount', 1] }, 1, 0] } } } },
                { $project: { _id: 0, totalCustomers: 1, newCustomers: 1, returningCustomers: { $subtract: ['$totalCustomers', '$newCustomers'] } } }
            ]),
            // 9. Sales by Payment Method
            Order.aggregate([
                { $match: match },
                { $group: { _id: '$paymentMethod', orders: { $sum: 1 }, revenue: { $sum: '$totalPrice' } } }
            ])
        ]);

        // Debug logs
        console.log('📊 Main products revenue:', revenueByCategory);
        console.log('📊 Topping revenue:', toppingRevenue);
        
        // Merge main products and toppings revenue
        const mergedRevenueByCategory = [...revenueByCategory];
        
        // If topping revenue is empty, calculate it manually from orders with toppings
        if (toppingRevenue.length === 0) {
            console.log('📊 Topping revenue is empty, calculating manually...');
            
            // Get all orders with toppings and calculate topping revenue
            const ordersWithToppings = await Order.aggregate([
                { $match: match },
                { $unwind: '$items' },
                { $match: { 'items.toppings': { $exists: true, $ne: [] } } },
                { $unwind: '$items.toppings' },
                { $lookup: { from: 'products', localField: 'items.toppings', foreignField: '_id', as: 'toppingInfo' } },
                { $unwind: '$toppingInfo' },
                {
                    $group: {
                        _id: null,
                        totalToppingRevenue: { $sum: { $multiply: [{ $ifNull: ['$toppingInfo.price', 0] }, '$items.quantity'] } },
                        totalToppingQuantity: { $sum: '$items.quantity' },
                        totalOrders: { $addToSet: '$_id' }
                    }
                },
                { $addFields: { totalOrders: { $size: '$totalOrders' } } }
            ]);
            
            console.log('📊 Manual topping calculation result:', ordersWithToppings);
            
            if (ordersWithToppings.length > 0 && ordersWithToppings[0].totalToppingRevenue > 0) {
                mergedRevenueByCategory.push({
                    _id: 'Topping',
                    revenue: ordersWithToppings[0].totalToppingRevenue,
                    quantity: ordersWithToppings[0].totalToppingQuantity,
                    orders: ordersWithToppings[0].totalOrders
                });
            }
        } else {
            // Add topping revenue to existing categories or create new ones
            toppingRevenue.forEach(toppingCat => {
                console.log('📊 Processing topping category:', toppingCat);
                const existingCat = mergedRevenueByCategory.find(cat => cat._id === toppingCat._id);
                if (existingCat) {
                    console.log('📊 Adding to existing category:', existingCat._id);
                    existingCat.revenue += toppingCat.revenue;
                    existingCat.quantity += toppingCat.quantity;
                    existingCat.orders += toppingCat.orders;
                } else {
                    console.log('📊 Creating new category for topping:', toppingCat._id);
                    mergedRevenueByCategory.push(toppingCat);
                }
            });
        }
        
        // Sort by revenue descending
        mergedRevenueByCategory.sort((a, b) => b.revenue - a.revenue);
        
        const totalRevenue = (overview[0] && overview[0].totalRevenue) || 0;
        mergedRevenueByCategory.forEach(cat => cat.totalRevenue = totalRevenue);

        // Debug sales data
        console.log('📊 Sales Report Debug:');
        console.log('📊 Overview:', overview[0]);
        console.log('📊 Revenue by Category:', JSON.stringify(revenueByCategory, null, 2));
        console.log('📊 Weekly Sales Data:', JSON.stringify(weeklySales, null, 2));

        res.render('admin/reports/sales', {
            title: 'Báo cáo bán hàng',
            dateRange: { startDate: reportStartDate, endDate: reportEndDate },
            today: vietnamNow,
            filters: req.query,
            overview: overview[0] || { totalOrders: 0, totalRevenue: 0, completedOrders: 0, avgOrderValue: 0 },
            dailySales: dailySales || [],
            revenueByCategory: mergedRevenueByCategory || [],
            hourlySales: hourlySales || [],
            weeklySales: weeklySales || [],
            topDays: topDays || [],
            customerAnalysis: customerAnalysis[0] || { totalCustomers: 0, newCustomers: 0, returningCustomers: 0 },
            salesByPaymentMethod: salesByPaymentMethod || [],
        });

    } catch (error) {
        console.error('Error generating sales report:', error);
        req.flash('error_msg', 'Có lỗi khi tạo báo cáo bán hàng');
        res.redirect('/admin');
    }
});

// System User Report (Báo cáo hoạt động người dùng hệ thống)
router.get('/reports/system-users', hasPermission('view_reports'), async (req, res) => {
    try {
        const { startDate, endDate, exportFormat, userId, action } = req.query;
        
        // Simple system users report - just redirect to existing functionality for now
        res.render('admin/reports/system-users', {
            title: 'Báo cáo Người dùng Hệ thống',
            message: 'System users report functionality coming soon'
        });
        
    } catch (error) {
        console.error('System users report error:', error);
        req.flash('error_msg', 'Có lỗi khi tạo báo cáo người dùng hệ thống');
        res.redirect('/admin');
    }
});

module.exports = router;