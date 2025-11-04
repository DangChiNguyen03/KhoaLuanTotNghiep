const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');
const User = require('../models/User');

module.exports = function(passport) {
    passport.use(
        new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
            try {
                // Match user
                const user = await User.findOne({ email: email });
                if (!user) {
                    return done(null, false, { message: 'Email này chưa được đăng ký' });
                }

                // Kiểm tra tài khoản có bị khóa không
                if (user.isLocked) {
                    const lockUntil = user.lockUntil ? new Date(user.lockUntil) : null;
                    const now = new Date();
                    
                    if (lockUntil && lockUntil > now) {
                        const hoursLeft = Math.ceil((lockUntil - now) / (1000 * 60 * 60));
                        return done(null, false, { 
                            message: `Tài khoản đã bị khóa do đăng nhập sai quá nhiều lần. Vui lòng thử lại sau ${hoursLeft} giờ hoặc liên hệ admin để mở khóa.`,
                            locked: true
                        });
                    } else if (user.lockedReason === 'admin_action') {
                        return done(null, false, { 
                            message: 'Tài khoản đã bị khóa bởi quản trị viên. Vui lòng liên hệ admin để được hỗ trợ.',
                            locked: true
                        });
                    }
                }

                // Match password
                const isMatch = await bcrypt.compare(password, user.password);
                if (!isMatch) {
                    // Tăng số lần đăng nhập sai
                    await user.incLoginAttempts();
                    
                    const attemptsLeft = 5 - (user.loginAttempts + 1);
                    if (attemptsLeft > 0) {
                        return done(null, false, { 
                            message: `Mật khẩu không đúng. Còn ${attemptsLeft} lần thử trước khi tài khoản bị khóa.`
                        });
                    } else {
                        return done(null, false, { 
                            message: 'Tài khoản đã bị khóa do đăng nhập sai quá 5 lần. Vui lòng liên hệ admin để mở khóa.',
                            locked: true
                        });
                    }
                }

                // Đăng nhập thành công - Reset số lần thử
                if (user.loginAttempts > 0) {
                    await user.resetLoginAttempts();
                }

                // Cập nhật lastLogin
                user.lastLogin = new Date();
                await user.save();

                return done(null, user);
            } catch (err) {
                console.error('Passport error:', err);
                return done(err);
            }
        })
    );

    passport.serializeUser((user, done) => {
        done(null, user.id);
    });

    passport.deserializeUser(async (id, done) => {
        try {
            const user = await User.findById(id);
            done(null, user);
        } catch (err) {
            console.error('Deserialize error:', err);
            done(err);
        }
    });
};
