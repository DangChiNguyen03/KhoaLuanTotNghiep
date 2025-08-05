const mongoose = require('mongoose');
const User = require('../models/User');

mongoose.connect('mongodb://127.0.0.1:27017/bubble-tea-shop', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

async function makeAdmin(email) {
    try {
        const user = await User.findOneAndUpdate(
            { email: email },
            { role: 'admin' },
            { new: true }
        );

        if (user) {
            console.log(`Đã cập nhật quyền admin cho user: ${user.email}`);
        } else {
            console.log('Không tìm thấy user với email này');
        }
    } catch (err) {
        console.error('Lỗi:', err);
    } finally {
        mongoose.connection.close();
    }
}

makeAdmin('npthinh03062003@gmail.com');
