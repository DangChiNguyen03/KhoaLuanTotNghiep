const User = require('../models/User');
const Voucher = require('../models/Voucher');
const Order = require('../models/Order');

// Middleware để hiển thị thông báo chào mừng
const welcomeNotification = async (req, res, next) => {
    try {
        // Chỉ hiển thị nếu:
        // 1. User đã đăng nhập
        // 2. Chưa hiển thị thông báo trong session này
        if (req.user && !req.session.welcomeShown) {
            const user = await User.findById(req.user._id);
            
            if (user) {
                // Đánh dấu đã hiển thị trong session
                req.session.welcomeShown = true;
                
                // Lấy voucher đang hoạt động
                const now = new Date();
                const currentHour = now.getHours();
                const currentDay = now.getDay();
                
                const activeVouchers = await Voucher.find({ isActive: true });
                const availableVouchers = [];
                
                for (const voucher of activeVouchers) {
                    let isApplicable = true;
                    
                    // Kiểm tra role
                    if (voucher.applicableRoles && voucher.applicableRoles.length > 0) {
                        if (!voucher.applicableRoles.includes(user.role)) {
                            isApplicable = false;
                        }
                    }
                    
                    // Kiểm tra MANGUOIMOI - chỉ dùng 1 lần
                    if (isApplicable && voucher.code === 'MANGUOIMOI') {
                        const hasUsedBefore = await Order.findOne({
                            user: user._id,
                            voucherCode: 'MANGUOIMOI'
                        });
                        if (hasUsedBefore) {
                            isApplicable = false;
                        }
                    }
                    
                    // Kiểm tra ngày đặc biệt
                    if (isApplicable && voucher.specialDay !== null && voucher.specialDay !== undefined) {
                        if (currentDay !== voucher.specialDay) {
                            isApplicable = false;
                        }
                    }
                    
                    // Kiểm tra khung giờ
                    if (isApplicable && voucher.startTime !== null && voucher.endTime !== null) {
                        if (currentHour < voucher.startTime || currentHour >= voucher.endTime) {
                            isApplicable = false;
                        }
                    }
                    
                    if (isApplicable) {
                        availableVouchers.push({
                            code: voucher.code,
                            description: voucher.description,
                            discountType: voucher.discountType,
                            discountValue: voucher.discountValue,
                            applicableCategory: voucher.applicableCategory,
                            startTime: voucher.startTime,
                            endTime: voucher.endTime
                        });
                    }
                }
                
                // Kiểm tra user mới hay cũ
                if (!user.hasSeenWelcome) {
                    // USER MỚI - Lần đầu đăng nhập
                    await User.findByIdAndUpdate(user._id, {
                        hasSeenWelcome: true
                    });
                    
                    if (user.role === 'customer') {
                        // Customer mới: Có voucher MANGUOIMOI
                        res.locals.welcomeMessage = {
                            isNewUser: true,
                            userName: user.name,
                            voucherCode: 'MANGUOIMOI',
                            discount: '20%',
                            activeVouchers: availableVouchers.filter(v => v.code !== 'MANGUOIMOI')
                        };
                    } else {
                        // Admin/Staff/Manager mới: Không có MANGUOIMOI
                        res.locals.welcomeMessage = {
                            isNewUser: true,
                            userName: user.name,
                            userRole: user.role,
                            activeVouchers: availableVouchers
                        };
                    }
                } else {
                    // USER CŨ - Tất cả role đều hiện thông báo chào mừng quay lại
                    res.locals.welcomeMessage = {
                        isReturningUser: true,
                        userName: user.name,
                        userRole: user.role,
                        activeVouchers: availableVouchers
                    };
                }
            }
        }
        
        next();
    } catch (error) {
        console.error('Welcome notification error:', error);
        next();
    }
};

module.exports = welcomeNotification;
