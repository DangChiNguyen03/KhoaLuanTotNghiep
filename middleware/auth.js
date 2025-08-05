const isAdmin = (req, res, next) => {
    if (req.isAuthenticated() && req.user.role === 'admin') {
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
    isAuthenticated
};
