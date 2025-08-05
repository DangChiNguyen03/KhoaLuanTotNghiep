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

                // Match password
                const isMatch = await bcrypt.compare(password, user.password);
                if (!isMatch) {
                    return done(null, false, { message: 'Mật khẩu không đúng' });
                }

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
