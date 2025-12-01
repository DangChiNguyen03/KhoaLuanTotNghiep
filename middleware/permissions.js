const User = require('../models/User');

// Default permissions for each role
const DEFAULT_PERMISSIONS = {
    admin: [
        'view_dashboard',
        'manage_products', 
        'manage_orders',
        'manage_customers',
        'manage_payments',
        'manage_users',
        'view_reports',
        'manage_settings',
        'view_login_logs',      // Chỉ admin mới xem được login logs
        'view_audit_logs'       // Chỉ admin mới xem được audit logs
    ],
    manager: [
        'view_dashboard',
        'manage_products', 
        'manage_orders',
        'manage_customers',
        'manage_payments',
        'manage_users',         // Manager có thể quản lý users
        'view_reports'
        // KHÔNG có view_login_logs và view_audit_logs
    ],
    staff: [
        'view_dashboard',
        'manage_products', 
        'manage_orders',
        'manage_customers',
        'manage_payments',
        'manage_users',         // Staff giờ có thể quản lý users như manager
        'view_reports'
        // KHÔNG có view_login_logs và view_audit_logs (chỉ admin)
    ],
    customer: []
};

// Middleware to check if user has specific permission
const hasPermission = (requiredPermission) => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                req.flash('error_msg', 'Vui lòng đăng nhập để tiếp tục');
                return res.redirect('/users/login');
            }

            // Get user with full permissions
            const user = await User.findById(req.user._id);
            if (!user) {
                req.flash('error_msg', 'Người dùng không tồn tại');
                return res.redirect('/users/login');
            }

            // Check if user is active
            if (!user.isActive) {
                req.flash('error_msg', 'Tài khoản đã bị vô hiệu hóa');
                return res.redirect('/users/login');
            }

            // Get user permissions (custom or default based on role)
            let userPermissions = user.permissions && user.permissions.length > 0 
                ? user.permissions 
                : DEFAULT_PERMISSIONS[user.role] || [];

            // Check if user has required permission
            if (!userPermissions.includes(requiredPermission)) {
                req.flash('error_msg', 'Bạn không có quyền truy cập tính năng này');
                // Always redirect to admin dashboard for admin routes
                return res.redirect('/admin/dashboard');
            }

            next();
        } catch (error) {
            console.error('Permission check error:', error);
            req.flash('error_msg', 'Có lỗi khi kiểm tra quyền truy cập');
            // Always redirect to admin dashboard for admin routes
            res.redirect('/admin/dashboard');
        }
    };
};

// Middleware to check if user has any of the specified permissions
const hasAnyPermission = (requiredPermissions) => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                req.flash('error_msg', 'Vui lòng đăng nhập để tiếp tục');
                return res.redirect('/users/login');
            }

            const user = await User.findById(req.user._id);
            if (!user || !user.isActive) {
                req.flash('error_msg', 'Tài khoản không hợp lệ hoặc đã bị vô hiệu hóa');
                return res.redirect('/users/login');
            }

            let userPermissions = user.permissions && user.permissions.length > 0 
                ? user.permissions 
                : DEFAULT_PERMISSIONS[user.role] || [];

            // Check if user has any of the required permissions
            const hasAccess = requiredPermissions.some(permission => 
                userPermissions.includes(permission)
            );

            if (!hasAccess) {
                req.flash('error_msg', 'Bạn không có quyền truy cập tính năng này');
                // Always redirect to admin dashboard for admin routes
                return res.redirect('/admin/dashboard');
            }

            next();
        } catch (error) {
            console.error('Permission check error:', error);
            req.flash('error_msg', 'Có lỗi khi kiểm tra quyền truy cập');
            // Always redirect to admin dashboard for admin routes
            res.redirect('/admin/dashboard');
        }
    };
};

// Middleware to check role
const hasRole = (requiredRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            req.flash('error_msg', 'Vui lòng đăng nhập để tiếp tục');
            return res.redirect('/users/login');
        }

        const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
        
        if (!roles.includes(req.user.role)) {
            req.flash('error_msg', 'Bạn không có quyền truy cập tính năng này');
            // Redirect to admin dashboard if user is admin/staff, otherwise to regular dashboard
            if (['admin', 'manager', 'staff'].includes(req.user.role)) {
                return res.redirect('/admin/dashboard');
            } else {
                return res.redirect('/dashboard');
            }
        }

        next();
    };
};

// Helper function to get user permissions
const getUserPermissions = async (userId) => {
    try {
        const user = await User.findById(userId);
        if (!user) return [];

        return user.permissions && user.permissions.length > 0 
            ? user.permissions 
            : DEFAULT_PERMISSIONS[user.role] || [];
    } catch (error) {
        console.error('Error getting user permissions:', error);
        return [];
    }
};

// Helper function to check if user can access a specific feature
const canAccess = async (userId, permission) => {
    try {
        const userPermissions = await getUserPermissions(userId);
        return userPermissions.includes(permission);
    } catch (error) {
        console.error('Error checking access:', error);
        return false;
    }
};

// Middleware to add permissions to response locals for templates
const addPermissionsToLocals = async (req, res, next) => {
    if (req.user) {
        try {
            const userPermissions = await getUserPermissions(req.user._id);
            res.locals.userPermissions = userPermissions;
            res.locals.canAccess = (permission) => userPermissions.includes(permission);
        } catch (error) {
            console.error('Error adding permissions to locals:', error);
            res.locals.userPermissions = [];
            res.locals.canAccess = () => false;
        }
    } else {
        res.locals.userPermissions = [];
        res.locals.canAccess = () => false;
    }
    next();
};

module.exports = {
    hasPermission,
    hasAnyPermission,
    hasRole,
    getUserPermissions,
    canAccess,
    addPermissionsToLocals,
    DEFAULT_PERMISSIONS
};
