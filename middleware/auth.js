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
    
    // Nếu là yêu cầu GET (tải trang), chuyển hướng đến trang đăng nhập
    if (req.method === 'GET') {
        req.flash('error_msg', 'Bạn cần đăng nhập để xem trang này.');
        return res.redirect('/users/login');
    }
    
    // Nếu là yêu cầu API (POST, PUT, DELETE), trả về JSON
    res.status(401).json({ message: 'Bạn cần đăng nhập để thực hiện hành động này' });
};

module.exports = {
    isAdmin,
    isAdminOrStaff,
    isAdminOrManager,
    isAuthenticated
};
