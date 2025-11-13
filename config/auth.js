module.exports = {
  ensureAuthenticated: function(req, res, next) {
    if (req.isAuthenticated()) {
      return next();
    }
    
    // Check if this is an AJAX request
    const isAjax = req.xhr || 
                   req.headers.accept?.indexOf('json') > -1 ||
                   req.headers['content-type']?.includes('application/json') ||
                   (req.headers['content-type']?.includes('application/x-www-form-urlencoded') && 
                    (req.body.paymentMethod === 'momo' || req.body.paymentMethod === 'vnpay'));
    
    if (isAjax) {
      return res.status(401).json({
        success: false,
        message: 'Vui lòng đăng nhập để thực hiện chức năng này'
      });
    }
    
    req.flash('error_msg', 'Vui lòng đăng nhập để truy cập');
    res.redirect('/users/login');
  },
  forwardAuthenticated: function(req, res, next) {
    if (!req.isAuthenticated()) {
      return next();
    }
    // Redirect về trang chủ thay vì dashboard
    res.redirect('/');      
  }
};
