const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    items: [{
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },
        quantity: {
            type: Number,
            required: true
        },
        price: { // Giá của 1 sản phẩm tại thời điểm mua hàng (đã bao gồm topping)
            type: Number,
            required: true
        },
        toppings: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product'
        }],
        sugarLevel: String,
        iceLevel: String,
        size: {
            type: String,
            default: 'M'
        }
    }],
    totalPrice: {
        type: Number,
        required: true
    },
    originalPrice: { // Giá gốc trước khi giảm
        type: Number
    },
    voucher: {
        code: String,
        discountAmount: Number
    },
    paymentMethod: {
        type: String,
        enum: ['cash', 'bank', 'momo', 'zalopay', 'vnpay'],
        required: true
    },
    // Trạng thái đơn hàng
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'],
        default: 'pending'
    },
    // Trạng thái thanh toán
    paymentStatus: {
        type: String,
        enum: ['pending', 'paid', 'failed', 'refunded'],
        default: 'pending'
    },
    // Reference đến Payment record
    payment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Payment',
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Order', orderSchema);