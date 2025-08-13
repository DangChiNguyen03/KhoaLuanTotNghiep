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
    }
});

module.exports = mongoose.model('User', UserSchema);