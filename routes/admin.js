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

// Login logs route - MUST be before root route
router.get('/login-logs', isAdmin, async (req, res) => {
    console.log('🔍 Login logs route accessed:', req.originalUrl);
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
        
        const stats = {
            success: allStats.find(s => s._id === 'success')?.count || 0,
            failed: allStats.find(s => s._id === 'failed')?.count || 0,
            total: allStats.reduce((sum, s) => sum + s.count, 0)
        };
        
        console.log('📄 Rendering template: admin/login-logs');
        console.log('📊 Data being passed:', { 
            title: 'Quản lý Log Đăng nhập',
            logsCount: logs.length,
            stats,
            currentPage: page,
            totalPages,
            totalLogs,
            debugCounts: { successCount, failedCount }
        });
        
        // Try absolute path first
        const fs = require('fs');
        const path = require('path');
        const templatePath = path.join(__dirname, '..', 'views', 'admin', 'login-logs.hbs');
        console.log('🔍 Checking template path:', templatePath);
        console.log('📁 Template exists:', fs.existsSync(templatePath));
        
        res.render('admin/login-logs', {
            title: 'Quản lý Log Đăng nhập',
            loginLogs: logs,
            stats,
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
    console.log('🔍 Admin root route accessed:', req.originalUrl);
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
    console.log('🔍 Customers route accessed by user:', req.user?.email, 'role:', req.user?.role);
    
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
    
    console.log('👤 User found:', user.email, 'role:', user.role, 'permissions:', user.permissions);
    
    // Get user permissions
    const { DEFAULT_PERMISSIONS } = require('../middleware/permissions');
    let userPermissions = user.permissions && user.permissions.length > 0 
        ? user.permissions 
        : DEFAULT_PERMISSIONS[user.role] || [];
    
    console.log('🔑 User permissions:', userPermissions);
    console.log('🎯 Required permission: manage_customers');
    console.log('✅ Has permission:', userPermissions.includes('manage_customers'));
    console.log('🔍 DEFAULT_PERMISSIONS for admin:', DEFAULT_PERMISSIONS.admin);
    console.log('🔍 User role:', user.role);
    console.log('🔍 User custom permissions:', user.permissions);
    
    // For debugging - temporarily allow admin role regardless of permissions
    if (user.role === 'admin') {
        console.log('🚀 Admin role detected - bypassing permission check for debugging');
    } else if (!userPermissions.includes('manage_customers')) {
        console.log('❌ User does not have manage_customers permission');
        req.flash('error_msg', 'Bạn không có quyền truy cập tính năng này');
        return res.redirect('/admin/dashboard');
    }
    
    console.log('✅ Permission check passed, proceeding to customers list');
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

// Xóa khách hàng (soft delete - chuyển role thành 'inactive')
router.delete('/customers/:id', isAdmin, async (req, res) => {
    try {
        console.log('🗑️ DELETE /customers/:id được gọi với ID:', req.params.id);
        console.log('🗑️ Method:', req.method);
        console.log('🗑️ User:', req.user?.email);
        
        // Kiểm tra xem khách hàng có đơn hàng không
        const orderCount = await Order.countDocuments({ user: req.params.id });
        
        if (orderCount > 0) {
            // Nếu có đơn hàng, chỉ deactivate
            await User.findByIdAndUpdate(req.params.id, { role: 'inactive' });
            req.flash('success_msg', 'Đã vô hiệu hóa tài khoản khách hàng');
        } else {
            // Nếu không có đơn hàng, có thể xóa hoàn toàn
            await User.findByIdAndDelete(req.params.id);
            req.flash('success_msg', 'Đã xóa khách hàng thành công');
        }
        
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
        
        // Kiểm tra xem khách hàng có đơn hàng không
        const orderCount = await Order.countDocuments({ user: req.params.id });
        
        if (orderCount > 0) {
            // Nếu có đơn hàng, chỉ deactivate
            await User.findByIdAndUpdate(req.params.id, { role: 'inactive' });
            req.flash('success_msg', 'Đã vô hiệu hóa tài khoản khách hàng');
        } else {
            // Nếu không có đơn hàng, có thể xóa hoàn toàn
            await User.findByIdAndDelete(req.params.id);
            req.flash('success_msg', 'Đã xóa khách hàng thành công');
        }
        
        res.redirect('/admin/customers');
    } catch (err) {
        console.error('Lỗi khi xóa khách hàng (POST):', err);
        req.flash('error_msg', 'Lỗi khi xóa khách hàng');
        res.redirect('/admin/customers');
    }
});

// ===== SALES MANAGEMENT ROUTES =====

// Dashboard thống kê doanh số
router.get('/dashboard', isAdminOrStaff, async (req, res) => {
    try {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const thisWeek = new Date(now.setDate(now.getDate() - now.getDay()));
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
        const search = req.query.search || '';
        
        // Tạo query lọc
        let query = {};
        if (status) {
            query.status = status;
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
        
        res.render('admin/orders', {
            orders,
            statusStats,
            currentPage: page,
            totalPages,
            status,
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
        
        res.render('admin/payment-methods', {
            paymentMethods,
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

// Khởi tạo dữ liệu mặc định cho phương thức thanh toán
router.post('/init-payment-methods', isAdmin, async (req, res) => {
    try {
        // Kiểm tra xem đã có dữ liệu chưa
        const existingMethods = await PaymentMethod.countDocuments();
        if (existingMethods > 0) {
            req.flash('info_msg', 'Dữ liệu phương thức thanh toán đã tồn tại');
            return res.redirect('/admin/payment-methods');
        }
        
        // Tạo các phương thức thanh toán mặc định
        const defaultMethods = [
            {
                name: 'Tiền mặt',
                code: 'cash',
                description: 'Thanh toán bằng tiền mặt khi nhận hàng',
                icon: '',
                config: {
                    fee: 0,
                    feeType: 'fixed'
                },
                isActive: true,
                order: 1
            },
            {
                name: 'Chuyển khoản ngân hàng',
                code: 'bank',
                description: 'Chuyển khoản qua tài khoản ngân hàng',
                icon: '',
                config: {
                    bankName: 'Vietcombank',
                    accountNumber: '1234567890',
                    accountName: 'YOLO BREW',
                    fee: 0,
                    feeType: 'fixed'
                },
                isActive: true,
                order: 2
            },
            {
                name: 'MoMo',
                code: 'momo',
                description: 'Thanh toán qua ví điện tử MoMo',
                icon: '',
                config: {
                    fee: 0,
                    feeType: 'fixed'
                },
                isActive: false,
                order: 3
            },
            {
                name: 'ZaloPay',
                code: 'zalopay',
                description: 'Thanh toán qua ví điện tử ZaloPay',
                icon: '',
                config: {
                    fee: 0,
                    feeType: 'fixed'
                },
                isActive: false,
                order: 4
            },
            {
                name: 'VNPay',
                code: 'vnpay',
                description: 'Thanh toán qua cổng thanh toán VNPay',
                icon: '',
                config: {
                    fee: 0,
                    feeType: 'fixed'
                },
                isActive: false,
                order: 5
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
            notes,
            reviewedBy: req.user._id,
            reviewedAt: new Date()
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

// Trang quản lý system users (nhân viên)
router.get('/system-users', hasPermission('manage_users'), async (req, res) => {
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
        res.redirect('/admin');
    }
});

// Tạo system user mới
router.post('/system-users', hasPermission('manage_users'), async (req, res) => {
    try {
        const { 
            name, email, password, role, employeeId, department, 
            hireDate, salary, manager, permissions 
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
            hireDate, salary, manager, permissions, isActive 
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

// Xóa audit logs cũ (chỉ admin)
router.post('/audit-logs/cleanup', hasRole('admin'), async (req, res) => {
    try {
        const { days = 90 } = req.body;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - parseInt(days));
        
        const result = await AuditLog.deleteMany({
            timestamp: { $lt: cutoffDate }
        });
        
        // Log the cleanup action
        await logAuditAction(
            req,
            'data_cleanup',
            'System',
            null,
            {
                action: 'audit_logs_cleanup',
                daysKept: parseInt(days),
                recordsDeleted: result.deletedCount,
                cleanupBy: req.user._id
            }
        );
        
        req.flash('success_msg', `Đã xóa ${result.deletedCount} bản ghi audit log cũ hơn ${days} ngày`);
        res.redirect('/admin/audit-logs');
        
    } catch (error) {
        console.error('Error cleaning up audit logs:', error);
        req.flash('error_msg', 'Có lỗi khi dọn dẹp audit logs');
        res.redirect('/admin/audit-logs');
    }
});

// ==================== REPORTS MODULE ====================



// Customer Report (Báo cáo khách hàng)
router.get('/reports/customers', async (req, res) => {
    console.log('🔍 Customer report route accessed by user:', req.user?.email, 'role:', req.user?.role);
    
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
    
    console.log('👤 User found:', user.email, 'role:', user.role, 'permissions:', user.permissions);
    
    // Get user permissions
    const { DEFAULT_PERMISSIONS } = require('../middleware/permissions');
    let userPermissions = user.permissions && user.permissions.length > 0 
        ? user.permissions 
        : DEFAULT_PERMISSIONS[user.role] || [];
    
    console.log('🔑 User permissions:', userPermissions);
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
        
        console.log('🔍 Debug date range:', { reportStartDate, reportEndDate });
        
        // Debug: Kiểm tra dữ liệu user thực tế
        const allUsers = await User.find({}).select('email role createdAt lastLogin date').limit(10);
        console.log('👥 Sample users in DB:', allUsers);
        
        // Kiểm tra field nào có dữ liệu
        const userFieldCheck = await User.findOne({});
        console.log('🔍 User schema fields:', Object.keys(userFieldCheck.toObject()));
        
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

        console.log('📊 New users result:', newCustomerStats);

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

        console.log('🟢 Active users result:', activeCustomerStats);

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
        console.log('📊 Report data keys:', Object.keys(reportData));
        console.log('📊 Final report statistics:', {
            totalCustomers: reportData.statistics.totalCustomers,
            activeCustomers: reportData.statistics.activeCustomers,
            newCustomerStatsRaw: newCustomerStats,
            activeCustomerStatsRaw: activeCustomerStats
        });
        
        res.render('admin/reports/customers', {
            ...reportData,
            title: 'Báo cáo khách hàng',
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
        
        // Default date range (last 30 days)
        const defaultEndDate = new Date();
        const defaultStartDate = new Date();
        defaultStartDate.setDate(defaultStartDate.getDate() - 30);
        
        const reportStartDate = startDate ? new Date(startDate) : defaultStartDate;
        const reportEndDate = endDate ? new Date(endDate + 'T23:59:59') : defaultEndDate;
        
        // Build filter for payments
        const paymentFilter = {
            createdAt: { $gte: reportStartDate, $lte: reportEndDate }
        };
        if (paymentMethod) paymentFilter.paymentMethod = paymentMethod;
        if (status) paymentFilter.status = status;
        
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
        
        // Failed payments analysis
        const failedPayments = await Payment.find({
            ...paymentFilter,
            status: 'failed'
        })
        .populate('user', 'name email')
        .populate('order', 'orderNumber')
        .sort({ createdAt: -1 })
        .limit(10);
        
        // Revenue by hour analysis
        const hourlyRevenue = await Payment.aggregate([
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
                    revenue: { $sum: '$amount' }
                }
            },
            { $sort: { _id: 1 } }
        ]);
        
        // Payment processing time analysis
        const processingTimeStats = await Payment.aggregate([
            {
                $match: {
                    ...paymentFilter,
                    status: 'paid',
                    paidAt: { $exists: true }
                }
            },
            {
                $project: {
                    processingTime: {
                        $divide: [
                            { $subtract: ['$paidAt', '$createdAt'] },
                            1000 // Convert to seconds
                        ]
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    avgProcessingTime: { $avg: '$processingTime' },
                    minProcessingTime: { $min: '$processingTime' },
                    maxProcessingTime: { $max: '$processingTime' }
                }
            }
        ]);
        
        const reportData = {
            dateRange: {
                startDate: reportStartDate,
                endDate: reportEndDate
            },
            statistics: paymentStats[0] || { 
                totalPayments: 0, 
                totalAmount: 0, 
                avgAmount: 0, 
                successfulPayments: 0, 
                failedPayments: 0, 
                pendingPayments: 0 
            },
            paymentTrends,
            paymentMethodStats,
            topTransactions,
            failedPayments,
            hourlyRevenue,
            processingTime: processingTimeStats[0] || { 
                avgProcessingTime: 0, 
                minProcessingTime: 0, 
                maxProcessingTime: 0 
            }
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
            { name: 'banking', displayName: 'Chuyển khoản' }
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
    try {
        const { startDate, endDate, exportFormat, category, status } = req.query;
        
        // Default date range (last 30 days)
        const defaultEndDate = new Date();
        const defaultStartDate = new Date();
        defaultStartDate.setDate(defaultStartDate.getDate() - 30);
        
        const reportStartDate = startDate ? new Date(startDate) : defaultStartDate;
        const reportEndDate = endDate ? new Date(endDate + 'T23:59:59') : defaultEndDate;
        
        // Build filter for products
        const productFilter = {};
        if (category) productFilter.category = category;
        if (status) productFilter.isAvailable = status === 'available';
        
        // Product statistics
        const productStats = await Product.aggregate([
            { $match: productFilter },
            {
                $group: {
                    _id: null,
                    totalProducts: { $sum: 1 },
                    availableProducts: { $sum: { $cond: ['$isAvailable', 1, 0] } },
                    unavailableProducts: { $sum: { $cond: ['$isAvailable', 0, 1] } },
                    avgPrice: { $avg: '$price' }
                }
            }
        ]);
        
        // Best selling products
        const bestSellingProducts = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: reportStartDate, $lte: reportEndDate },
                    status: 'completed'
                }
            },
            { $unwind: '$items' },
            {
                $group: {
                    _id: '$items.product',
                    totalQuantity: { $sum: '$items.quantity' },
                    totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
                    orderCount: { $sum: 1 },
                    avgPrice: { $avg: '$items.price' }
                }
            },
            {
                $lookup: {
                    from: 'products',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'product'
                }
            },
            { $unwind: '$product' },
            {
                $project: {
                    productName: '$product.name',
                    productCategory: '$product.category',
                    productImage: '$product.image',
                    totalQuantity: 1,
                    totalRevenue: 1,
                    orderCount: 1,
                    avgPrice: 1
                }
            },
            { $sort: { totalQuantity: -1 } },
            { $limit: 20 }
        ]);
        
        // Product category performance
        const categoryPerformance = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: reportStartDate, $lte: reportEndDate },
                    status: 'completed'
                }
            },
            { $unwind: '$items' },
            {
                $lookup: {
                    from: 'products',
                    localField: 'items.product',
                    foreignField: '_id',
                    as: 'product'
                }
            },
            { $unwind: '$product' },
            {
                $group: {
                    _id: '$product.category',
                    totalQuantity: { $sum: '$items.quantity' },
                    totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
                    uniqueProducts: { $addToSet: '$items.product' },
                    avgPrice: { $avg: '$items.price' }
                }
            },
            {
                $project: {
                    category: '$_id',
                    totalQuantity: 1,
                    totalRevenue: 1,
                    uniqueProductCount: { $size: '$uniqueProducts' },
                    avgPrice: 1
                }
            },
            { $sort: { totalRevenue: -1 } }
        ]);
        
        // Low stock products
        const lowStockProducts = await Product.find({
            ...productFilter,
            stock: { $lt: 10 },
            isAvailable: true
        }).sort({ stock: 1 }).limit(10);
        
        // Product trends over time
        const productTrends = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: reportStartDate, $lte: reportEndDate },
                    status: 'completed'
                }
            },
            { $unwind: '$items' },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    totalQuantity: { $sum: '$items.quantity' },
                    totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
                    uniqueProducts: { $addToSet: '$items.product' }
                }
            },
            {
                $project: {
                    date: '$_id',
                    totalQuantity: 1,
                    totalRevenue: 1,
                    uniqueProductCount: { $size: '$uniqueProducts' }
                }
            },
            { $sort: { date: 1 } }
        ]);
        
        // Price analysis
        const priceAnalysis = await Product.aggregate([
            { $match: productFilter },
            {
                $group: {
                    _id: '$category',
                    minPrice: { $min: '$price' },
                    maxPrice: { $max: '$price' },
                    avgPrice: { $avg: '$price' },
                    productCount: { $sum: 1 }
                }
            },
            { $sort: { avgPrice: -1 } }
        ]);
        
        // Recently added products
        const recentProducts = await Product.find(productFilter)
            .sort({ createdAt: -1 })
            .limit(10);
        
        // Seasonal analysis (if applicable)
        const seasonalAnalysis = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: reportStartDate, $lte: reportEndDate },
                    status: 'completed'
                }
            },
            { $unwind: '$items' },
            {
                $lookup: {
                    from: 'products',
                    localField: 'items.product',
                    foreignField: '_id',
                    as: 'product'
                }
            },
            { $unwind: '$product' },
            {
                $group: {
                    _id: {
                        month: { $month: '$createdAt' },
                        category: '$product.category'
                    },
                    totalQuantity: { $sum: '$items.quantity' },
                    totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
                }
            },
            { $sort: { '_id.month': 1, totalRevenue: -1 } }
        ]);
        
        const reportData = {
            dateRange: {
                startDate: reportStartDate,
                endDate: reportEndDate
            },
            statistics: productStats[0] || { 
                totalProducts: 0, 
                availableProducts: 0, 
                unavailableProducts: 0, 
                avgPrice: 0 
            },
            bestSellingProducts,
            categoryPerformance,
            lowStockProducts,
            productTrends,
            priceAnalysis,
            recentProducts,
            seasonalAnalysis
        };
        
        // Export functionality
        if (exportFormat === 'json') {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename=product-report-${reportStartDate.toISOString().split('T')[0]}-to-${reportEndDate.toISOString().split('T')[0]}.json`);
            return res.json(reportData);
        }
        
        if (exportFormat === 'csv') {
            // Generate CSV for best selling products
            let csvContent = 'Product Name,Category,Total Sold,Total Revenue,Order Count,Avg Price\n';
            bestSellingProducts.forEach(product => {
                csvContent += `"${product.productName}","${product.productCategory}",${product.totalQuantity},${product.totalRevenue},${product.orderCount},${product.avgPrice.toFixed(2)}\n`;
            });
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=best-selling-products-${reportStartDate.toISOString().split('T')[0]}-to-${reportEndDate.toISOString().split('T')[0]}.csv`);
            return res.send(csvContent);
        }
        
        // Audit log for report generation
        await logAuditAction(
            req,
            'data_export',
            'System',
            null,
            {
                reportType: 'product_report',
                dateRange: `${reportStartDate.toISOString().split('T')[0]} to ${reportEndDate.toISOString().split('T')[0]}`,
                exportFormat: exportFormat || 'view',
                recordCount: reportData.statistics.totalProducts,
                filters: { category, status }
            }
        );
        
        // Get all categories for filter
        const allCategories = await Product.distinct('category');
        
        res.render('admin/reports/products', {
            ...reportData,
            allCategories,
            filters: req.query,
            title: 'Báo cáo Sản phẩm'
        });
        
    } catch (error) {
        console.error('Error generating product report:', error);
        req.flash('error_msg', 'Có lỗi khi tạo báo cáo sản phẩm');
        res.redirect('/admin');
    }
});

// Sales Report (Báo cáo doanh số)
router.get('/reports/sales', hasPermission('view_reports'), async (req, res) => {
    try {
        const { startDate, endDate, exportFormat, period } = req.query;
        
        // Default date range (last 30 days)
        const defaultEndDate = new Date();
        const defaultStartDate = new Date();
        defaultStartDate.setDate(defaultStartDate.getDate() - 30);
        
        const reportStartDate = startDate ? new Date(startDate) : defaultStartDate;
        const reportEndDate = endDate ? new Date(endDate + 'T23:59:59') : defaultEndDate;
        
        // Sales overview statistics
        const salesOverview = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: reportStartDate, $lte: reportEndDate }
                }
            },
            {
                $group: {
                    _id: null,
                    totalOrders: { $sum: 1 },
                    completedOrders: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
                    cancelledOrders: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
                    totalRevenue: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$totalPrice', 0] } },
                    avgOrderValue: { $avg: { $cond: [{ $eq: ['$status', 'completed'] }, '$totalPrice', null] } },
                    totalItems: { $sum: { $size: '$items' } }
                }
            }
        ]);
        
        // Daily sales trends
        const dailySales = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: reportStartDate, $lte: reportEndDate },
                    status: 'completed'
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    orderCount: { $sum: 1 },
                    revenue: { $sum: '$totalPrice' },
                    avgOrderValue: { $avg: '$totalPrice' }
                }
            },
            { $sort: { _id: 1 } }
        ]);
        
        // Monthly comparison (current vs previous period)
        const previousPeriodStart = new Date(reportStartDate);
        const previousPeriodEnd = new Date(reportEndDate);
        const periodDiff = reportEndDate - reportStartDate;
        previousPeriodStart.setTime(previousPeriodStart.getTime() - periodDiff);
        previousPeriodEnd.setTime(previousPeriodEnd.getTime() - periodDiff);
        
        const previousPeriodSales = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: previousPeriodStart, $lte: previousPeriodEnd },
                    status: 'completed'
                }
            },
            {
                $group: {
                    _id: null,
                    totalOrders: { $sum: 1 },
                    totalRevenue: { $sum: '$totalPrice' }
                }
            }
        ]);
        
        // Hourly sales pattern
        const hourlySales = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: reportStartDate, $lte: reportEndDate },
                    status: 'completed'
                }
            },
            {
                $group: {
                    _id: { $hour: '$createdAt' },
                    orderCount: { $sum: 1 },
                    revenue: { $sum: '$totalPrice' }
                }
            },
            { $sort: { _id: 1 } }
        ]);
        
        // Weekly sales pattern
        const weeklySales = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: reportStartDate, $lte: reportEndDate },
                    status: 'completed'
                }
            },
            {
                $group: {
                    _id: { $dayOfWeek: '$createdAt' },
                    orderCount: { $sum: 1 },
                    revenue: { $sum: '$totalPrice' }
                }
            },
            { $sort: { _id: 1 } }
        ]);
        
        // Top performing days
        const topDays = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: reportStartDate, $lte: reportEndDate },
                    status: 'completed'
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    orderCount: { $sum: 1 },
                    revenue: { $sum: '$totalPrice' }
                }
            },
            { $sort: { revenue: -1 } },
            { $limit: 10 }
        ]);
        
        // Sales by payment method
        const salesByPaymentMethod = await Payment.aggregate([
            {
                $match: {
                    createdAt: { $gte: reportStartDate, $lte: reportEndDate },
                    status: 'completed'
                }
            },
            {
                $group: {
                    _id: '$paymentMethod',
                    orderCount: { $sum: 1 },
                    totalAmount: { $sum: '$amount' }
                }
            },
            { $sort: { totalAmount: -1 } }
        ]);
        
        // Customer acquisition and retention
        const customerAnalysis = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: reportStartDate, $lte: reportEndDate },
                    status: 'completed'
                }
            },
            {
                $group: {
                    _id: '$user',
                    orderCount: { $sum: 1 },
                    totalSpent: { $sum: '$totalPrice' },
                    firstOrder: { $min: '$createdAt' },
                    lastOrder: { $max: '$createdAt' }
                }
            },
            {
                $group: {
                    _id: null,
                    totalCustomers: { $sum: 1 },
                    newCustomers: {
                        $sum: {
                            $cond: [
                                { $gte: ['$firstOrder', reportStartDate] },
                                1,
                                0
                            ]
                        }
                    },
                    returningCustomers: {
                        $sum: {
                            $cond: [
                                { $gt: ['$orderCount', 1] },
                                1,
                                0
                            ]
                        }
                    },
                    avgCustomerValue: { $avg: '$totalSpent' }
                }
            }
        ]);
        
        // Revenue breakdown by category - fixed logic
        // First get total items count per order to calculate proportional revenue
        const revenueByCategory = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: reportStartDate, $lte: reportEndDate },
                    status: 'completed'
                }
            },
            {
                $addFields: {
                    totalItems: { $size: '$items' }
                }
            },
            { $unwind: '$items' },
            {
                $lookup: {
                    from: 'products',
                    localField: 'items.product',
                    foreignField: '_id',
                    as: 'product'
                }
            },
            { $unwind: '$product' },
            {
                $group: {
                    _id: '$product.category',
                    revenue: { 
                        $sum: { 
                            $divide: ['$totalPrice', '$totalItems'] 
                        } 
                    }, // Phân bổ doanh thu theo tỷ lệ items
                    quantity: { $sum: '$items.quantity' },
                    orderCount: { $sum: 1 }
                }
            },
            { $sort: { revenue: -1 } }
        ]);
        
        const reportData = {
            dateRange: {
                startDate: reportStartDate,
                endDate: reportEndDate
            },
            overview: salesOverview[0] || {
                totalOrders: 0,
                completedOrders: 0,
                cancelledOrders: 0,
                totalRevenue: 0,
                avgOrderValue: 0,
                totalItems: 0
            },
            previousPeriod: previousPeriodSales[0] || { totalOrders: 0, totalRevenue: 0 },
            dailySales,
            hourlySales,
            weeklySales,
            topDays,
            salesByPaymentMethod,
            customerAnalysis: customerAnalysis[0] || {
                totalCustomers: 0,
                newCustomers: 0,
                returningCustomers: 0,
                avgCustomerValue: 0
            },
            revenueByCategory
        };
        
        // Calculate growth rates
        if (reportData.previousPeriod.totalRevenue > 0) {
            reportData.revenueGrowth = ((reportData.overview.totalRevenue - reportData.previousPeriod.totalRevenue) / reportData.previousPeriod.totalRevenue * 100).toFixed(2);
            reportData.orderGrowth = ((reportData.overview.completedOrders - reportData.previousPeriod.totalOrders) / reportData.previousPeriod.totalOrders * 100).toFixed(2);
        } else {
            reportData.revenueGrowth = 0;
            reportData.orderGrowth = 0;
        }
        
        // Export functionality
        if (exportFormat === 'json') {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename=sales-report-${reportStartDate.toISOString().split('T')[0]}-to-${reportEndDate.toISOString().split('T')[0]}.json`);
            return res.json(reportData);
        }
        
        if (exportFormat === 'csv') {
            // Generate CSV for daily sales
            let csvContent = 'Date,Order Count,Revenue,Avg Order Value\n';
            dailySales.forEach(day => {
                csvContent += `"${day._id}",${day.orderCount},${day.revenue},${day.avgOrderValue.toFixed(2)}\n`;
            });
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=daily-sales-${reportStartDate.toISOString().split('T')[0]}-to-${reportEndDate.toISOString().split('T')[0]}.csv`);
            return res.send(csvContent);
        }
        
        // Audit log for report generation
        await logAuditAction(
            req,
            'data_export',
            'System',
            null,
            {
                reportType: 'sales_report',
                dateRange: `${reportStartDate.toISOString().split('T')[0]} to ${reportEndDate.toISOString().split('T')[0]}`,
                exportFormat: exportFormat || 'view',
                recordCount: reportData.overview.totalOrders
            }
        );
        
        res.render('admin/reports/sales', {
            ...reportData,
            filters: req.query,
            title: 'Báo cáo Doanh số'
        });
        
    } catch (error) {
        console.error('Error generating sales report:', error);
        req.flash('error_msg', 'Có lỗi khi tạo báo cáo doanh số');
        res.redirect('/admin');
    }
});

// System User Report (Báo cáo hoạt động người dùng hệ thống)
router.get('/reports/system-users', hasPermission('view_reports'), async (req, res) => {
    try {
        const { startDate, endDate, exportFormat, userId, action } = req.query;
        
        // Default date range (last 30 days)
        const defaultEndDate = new Date();
        const defaultStartDate = new Date();
        defaultStartDate.setDate(defaultStartDate.getDate() - 30);
        
        const reportStartDate = startDate ? new Date(startDate) : defaultStartDate;
        const reportEndDate = endDate ? new Date(endDate + 'T23:59:59') : defaultEndDate;
        
        // Build match criteria
        const matchCriteria = {
            createdAt: { $gte: reportStartDate, $lte: reportEndDate }
        };
        
        if (userId) matchCriteria.user = new mongoose.Types.ObjectId(userId);
        if (action) matchCriteria.action = action;
        
        // System user activity overview
        const activityOverview = await AuditLog.aggregate([
            { $match: matchCriteria },
            {
                $group: {
                    _id: null,
                    totalActivities: { $sum: 1 },
                    uniqueUsers: { $addToSet: '$user' },
                    successfulActions: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
                    failedActions: { $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] } },
                    suspiciousActivities: { $sum: { $cond: [{ $eq: ['$suspicious', true] }, 1, 0] } }
                }
            },
            {
                $project: {
                    totalActivities: 1,
                    uniqueUsers: { $size: '$uniqueUsers' },
                    successfulActions: 1,
                    failedActions: 1,
                    suspiciousActivities: 1,
                    successRate: { $multiply: [{ $divide: ['$successfulActions', '$totalActivities'] }, 100] }
                }
            }
        ]);
        
        // Daily activity trends
        const dailyActivity = await AuditLog.aggregate([
            { $match: matchCriteria },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    totalActivities: { $sum: 1 },
                    uniqueUsers: { $addToSet: '$user' },
                    successfulActions: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
                    failedActions: { $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] } },
                    suspiciousActivities: { $sum: { $cond: [{ $eq: ['$suspicious', true] }, 1, 0] } }
                }
            },
            {
                $project: {
                    totalActivities: 1,
                    uniqueUsers: { $size: '$uniqueUsers' },
                    successfulActions: 1,
                    failedActions: 1,
                    suspiciousActivities: 1
                }
            },
            { $sort: { _id: 1 } }
        ]);
        
        // Most active users
        const mostActiveUsers = await AuditLog.aggregate([
            { $match: matchCriteria },
            {
                $group: {
                    _id: '$user',
                    totalActivities: { $sum: 1 },
                    successfulActions: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
                    failedActions: { $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] } },
                    suspiciousActivities: { $sum: { $cond: [{ $eq: ['$suspicious', true] }, 1, 0] } },
                    lastActivity: { $max: '$createdAt' },
                    actions: { $addToSet: '$action' }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'userInfo'
                }
            },
            { $unwind: '$userInfo' },
            {
                $project: {
                    username: '$userInfo.username',
                    email: '$userInfo.email',
                    role: '$userInfo.role',
                    totalActivities: 1,
                    successfulActions: 1,
                    failedActions: 1,
                    suspiciousActivities: 1,
                    lastActivity: 1,
                    uniqueActions: { $size: '$actions' },
                    successRate: { $multiply: [{ $divide: ['$successfulActions', '$totalActivities'] }, 100] }
                }
            },
            { $sort: { totalActivities: -1 } },
            { $limit: 20 }
        ]);
        
        // Action breakdown
        const actionBreakdown = await AuditLog.aggregate([
            { $match: matchCriteria },
            {
                $group: {
                    _id: '$action',
                    count: { $sum: 1 },
                    successCount: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
                    errorCount: { $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] } },
                    uniqueUsers: { $addToSet: '$user' },
                    suspiciousCount: { $sum: { $cond: [{ $eq: ['$suspicious', true] }, 1, 0] } }
                }
            },
            {
                $project: {
                    action: '$_id',
                    count: 1,
                    successCount: 1,
                    errorCount: 1,
                    uniqueUsers: { $size: '$uniqueUsers' },
                    suspiciousCount: 1,
                    successRate: { $multiply: [{ $divide: ['$successCount', '$count'] }, 100] }
                }
            },
            { $sort: { count: -1 } }
        ]);
        
        // Hourly activity pattern
        const hourlyActivity = await AuditLog.aggregate([
            { $match: matchCriteria },
            {
                $group: {
                    _id: { $hour: '$createdAt' },
                    count: { $sum: 1 },
                    uniqueUsers: { $addToSet: '$user' }
                }
            },
            {
                $project: {
                    hour: '$_id',
                    count: 1,
                    uniqueUsers: { $size: '$uniqueUsers' }
                }
            },
            { $sort: { _id: 1 } }
        ]);
        
        // Resource access patterns
        const resourceAccess = await AuditLog.aggregate([
            { 
                $match: {
                    ...matchCriteria,
                    resource: { $ne: null }
                }
            },
            {
                $group: {
                    _id: '$resource',
                    accessCount: { $sum: 1 },
                    uniqueUsers: { $addToSet: '$user' },
                    actions: { $addToSet: '$action' },
                    lastAccess: { $max: '$createdAt' }
                }
            },
            {
                $project: {
                    resource: '$_id',
                    accessCount: 1,
                    uniqueUsers: { $size: '$uniqueUsers' },
                    uniqueActions: { $size: '$actions' },
                    lastAccess: 1
                }
            },
            { $sort: { accessCount: -1 } },
            { $limit: 15 }
        ]);
        
        // Failed login attempts
        const failedLogins = await AuditLog.aggregate([
            {
                $match: {
                    ...matchCriteria,
                    action: 'login',
                    status: 'error'
                }
            },
            {
                $group: {
                    _id: {
                        user: '$user',
                        ip: '$details.ip'
                    },
                    attemptCount: { $sum: 1 },
                    lastAttempt: { $max: '$createdAt' },
                    userAgent: { $first: '$details.userAgent' }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id.user',
                    foreignField: '_id',
                    as: 'userInfo'
                }
            },
            {
                $project: {
                    username: { $ifNull: [{ $arrayElemAt: ['$userInfo.username', 0] }, 'Unknown'] },
                    email: { $ifNull: [{ $arrayElemAt: ['$userInfo.email', 0] }, 'Unknown'] },
                    ip: '$_id.ip',
                    attemptCount: 1,
                    lastAttempt: 1,
                    userAgent: 1
                }
            },
            { $sort: { attemptCount: -1, lastAttempt: -1 } },
            { $limit: 10 }
        ]);
        
        // Get all system users for filter
        const allSystemUsers = await User.find({ role: { $in: ['admin', 'manager', 'staff'] } })
            .select('username email role')
            .sort({ username: 1 });
        
        const reportData = {
            dateRange: {
                startDate: reportStartDate,
                endDate: reportEndDate
            },
            overview: activityOverview[0] || {
                totalActivities: 0,
                uniqueUsers: 0,
                successfulActions: 0,
                failedActions: 0,
                suspiciousActivities: 0,
                successRate: 0
            },
            dailyActivity,
            mostActiveUsers,
            actionBreakdown,
            hourlyActivity,
            resourceAccess,
            failedLogins,
            allSystemUsers
        };
        
        // Export functionality
        if (exportFormat === 'json') {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename=system-users-report-${reportStartDate.toISOString().split('T')[0]}-to-${reportEndDate.toISOString().split('T')[0]}.json`);
            return res.json(reportData);
        }
        
        if (exportFormat === 'csv') {
            // Generate CSV for user activities
            let csvContent = 'Username,Email,Role,Total Activities,Successful,Failed,Suspicious,Success Rate,Last Activity\n';
            mostActiveUsers.forEach(user => {
                csvContent += `"${user.username}","${user.email}","${user.role}",${user.totalActivities},${user.successfulActions},${user.failedActions},${user.suspiciousActivities},${user.successRate.toFixed(2)}%,"${user.lastActivity}"\n`;
            });
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=system-users-activities-${reportStartDate.toISOString().split('T')[0]}-to-${reportEndDate.toISOString().split('T')[0]}.csv`);
            return res.send(csvContent);
        }
        
        // Audit log for report generation
        await logAuditAction(
            req,
            'data_export',
            'System',
            null,
            {
                reportType: 'system_users_report',
                dateRange: `${reportStartDate.toISOString().split('T')[0]} to ${reportEndDate.toISOString().split('T')[0]}`,
                exportFormat: exportFormat || 'view',
                recordCount: reportData.overview.totalActivities,
                filters: { userId, action }
            }
        );
        
        res.render('admin/reports/system-users', {
            ...reportData,
            filters: req.query,
            title: 'Báo cáo Hoạt động Người dùng Hệ thống'
        });
        
    } catch (error) {
        console.error('Error generating system users report:', error);
        req.flash('error_msg', 'Có lỗi khi tạo báo cáo hoạt động người dùng hệ thống');
        res.redirect('/admin');
    }
});

// ===== PAYMENT MANAGEMENT ROUTES =====

// Cập nhật trạng thái thanh toán (hoàn tiền, đánh dấu thành công/thất bại)
router.post('/payments/:id/status', isAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        const paymentId = req.params.id;
        
        console.log('💳 Cập nhật trạng thái payment:', paymentId, 'thành:', status);
        
        // Validate status
        const validStatuses = ['pending', 'paid', 'failed', 'refunded'];
        if (!validStatuses.includes(status)) {
            req.flash('error_msg', 'Trạng thái thanh toán không hợp lệ');
            return res.redirect('/admin/payments');
        }
        
        // Tìm payment và populate order để kiểm tra trạng thái
        const payment = await Payment.findById(paymentId).populate('order');
        if (!payment) {
            req.flash('error_msg', 'Không tìm thấy giao dịch thanh toán');
            return res.redirect('/admin/payments');
        }
        
        // Kiểm tra logic hoàn tiền: chỉ cho phép hoàn tiền với đơn hàng đã hủy
        if (status === 'refunded') {
            if (!payment.order || payment.order.status !== 'cancelled') {
                req.flash('error_msg', 'Chỉ có thể hoàn tiền cho đơn hàng đã hủy');
                return res.redirect('/admin/payments');
            }
        }
        
        // Cập nhật trạng thái
        await Payment.findByIdAndUpdate(paymentId, {
            status: status,
            processedBy: req.user._id,
            processedAt: new Date()
        });
        
        // Cập nhật trạng thái đơn hàng tương ứng nếu cần
        if (payment.order) {
            if (status === 'paid') {
                await Order.findByIdAndUpdate(payment.order, {
                    paymentStatus: 'paid'
                });
            } else if (status === 'failed') {
                // Khi đánh dấu payment failed, hủy luôn đơn hàng
                await Order.findByIdAndUpdate(payment.order, {
                    status: 'cancelled',
                    paymentStatus: 'failed'
                });
            } else if (status === 'refunded') {
                await Order.findByIdAndUpdate(payment.order, {
                    paymentStatus: 'failed'
                });
            }
        }
        
        // Audit log
        await logAuditAction(
            req.user._id,
            'update_payment_status',
            'Payment',
            paymentId,
            'success',
            req.ip,
            req.get('User-Agent'),
            {
                oldStatus: payment.status,
                newStatus: status,
                paymentAmount: payment.amount
            }
        );
        
        let message = '';
        switch(status) {
            case 'paid':
                message = 'Đã đánh dấu giao dịch thành công';
                break;
            case 'failed':
                message = 'Đã đánh dấu giao dịch thất bại';
                break;
            case 'refunded':
                message = 'Đã hoàn tiền thành công';
                break;
            default:
                message = 'Đã cập nhật trạng thái thanh toán';
        }
        
        req.flash('success_msg', message);
        res.redirect('/admin/payments');
        
    } catch (error) {
        console.error('Lỗi khi cập nhật trạng thái payment:', error);
        req.flash('error_msg', 'Có lỗi khi cập nhật trạng thái thanh toán');
        res.redirect('/admin/payments');
    }
});

module.exports = router;