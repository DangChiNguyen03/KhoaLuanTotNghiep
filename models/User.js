const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    googleId: { type: String },
    address: { type: String },
    phone: { type: String },
    birthday: { type: Date },
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        match: [
            /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
            'Vui lòng nhập địa chỉ email hợp lệ'
        ]
    },
    password: {
        type: String,
        required: function() { return !this.googleId; }
    },
    role: {
        type: String,
        enum: ['admin', 'manager', 'staff', 'customer'],
        default: 'customer'
    },
    employeeId: {
        type: String,
        unique: true,
        sparse: true // Only required for staff/admin users
    },
    department: {
        type: String,
        enum: ['management', 'sales', 'kitchen', 'cashier', 'delivery'],
        required: function() { 
            return ['admin', 'manager', 'staff'].includes(this.role); 
        }
    },
    permissions: [{
        type: String,
        enum: [
            'view_dashboard',
            'manage_products', 
            'manage_orders',
            'manage_customers',
            'manage_payments',
            'manage_users',
            'view_reports',
            'manage_settings'
        ]
    }],
    isActive: {
        type: Boolean,
        default: true
    },
    hireDate: {
        type: Date,
        required: function() { 
            return ['admin', 'manager', 'staff'].includes(this.role); 
        }
    },
    salary: {
        type: Number,
        required: function() { 
            return ['admin', 'manager', 'staff'].includes(this.role); 
        }
    },
    manager: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    lastLogin: {
        type: Date
    },
    loginAttempts: {
        type: Number,
        default: 0
    },
    lockUntil: {
        type: Date
    },
    isLocked: {
        type: Boolean,
        default: false
    },
    lockedReason: {
        type: String,
        enum: ['failed_login', 'admin_action', 'security'],
        default: undefined
    },
    lockedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    lockedAt: {
        type: Date
    },
    cart: [{
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product' // Tham chiếu đến collection `products`
        },
        quantity: {
            type: Number,
            required: true,
            default: 1
        },
        toppings: {
            type: [String],
            default: []
        },
        sugarLevel: {
            type: String,
            default: '50%'
        },
        iceLevel: {
            type: String,
            default: '50%'
        },
        size: {
            type: String,
            default: 'M'
        }
    }],
    date: {
        type: Date,
        default: Date.now
    },
    hasSeenWelcome: {
        type: Boolean,
        default: false
    }
});

// Virtual để kiểm tra tài khoản có bị khóa không
UserSchema.virtual('accountLocked').get(function() {
    return this.isLocked || (this.lockUntil && this.lockUntil > Date.now());
});

// Method để tăng số lần đăng nhập sai
UserSchema.methods.incLoginAttempts = function() {
    // Nếu có lockUntil và đã hết hạn, reset
    if (this.lockUntil && this.lockUntil < Date.now()) {
        return this.updateOne({
            $set: { loginAttempts: 1 },
            $unset: { lockUntil: 1, isLocked: 1, lockedReason: 1, lockedAt: 1 }
        });
    }
    
    // Tăng số lần thử
    const updates = { $inc: { loginAttempts: 1 } };
    
    // Khóa tài khoản nếu đạt 5 lần
    const maxAttempts = 5;
    const isLocked = this.loginAttempts + 1 >= maxAttempts;
    
    if (isLocked) {
        updates.$set = { 
            isLocked: true,
            lockedReason: 'failed_login',
            lockedAt: Date.now(),
            lockUntil: Date.now() + 24 * 60 * 60 * 1000 // Khóa 24 giờ
        };
    }
    
    return this.updateOne(updates);
};

// Method để reset số lần đăng nhập sai
UserSchema.methods.resetLoginAttempts = function() {
    return this.updateOne({
        $set: { loginAttempts: 0 },
        $unset: { lockUntil: 1 }
    });
};

// Method để mở khóa tài khoản (chỉ admin/manager)
UserSchema.methods.unlockAccount = function(unlockedBy) {
    return this.updateOne({
        $set: { 
            isLocked: false,
            loginAttempts: 0
        },
        $unset: { 
            lockUntil: 1, 
            lockedReason: 1, 
            lockedBy: 1,
            lockedAt: 1 
        }
    });
};

module.exports = mongoose.model('User', UserSchema);