const isAdmin = (req, res, next) => {
    if (req.isAuthenticated() && req.user.role === 'admin') {
        return next();
    }
    req.flash('error_msg', 'Bạn không có quyền truy cập trang này');
    res.redirect('/');
};

// Middleware cho phép admin, manager và staff truy cập
const isAdminOrStaff = (req, res, next) => {
    if (req.isAuthenticated() && ['admin', 'manager', 'staff'].includes(req.user.role)) {
        return next();
    }
    req.flash('error_msg', 'Bạn không có quyền truy cập trang này');
    res.redirect('/');
};

// Middleware cho phép admin và manager
const isAdminOrManager = (req, res, next) => {
    if (req.isAuthenticated() && ['admin', 'manager'].includes(req.user.role)) {
        return next();
    }
    req.flash('error_msg', 'Bạn không có quyền truy cập trang này');
    res.redirect('/');
};

const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ message: 'Bạn cần đăng nhập để thực hiện hành động này' });
};

module.exports = {
    isAdmin,
    isAdminOrStaff,
    isAdminOrManager,
    isAuthenticated
};
