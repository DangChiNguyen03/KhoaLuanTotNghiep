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
        enum: ['admin', 'customer'],
        default: 'customer'
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
        }
    }],
    date: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('User', UserSchema);