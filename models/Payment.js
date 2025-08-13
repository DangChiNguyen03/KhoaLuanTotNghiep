const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
    // Thông tin đơn hàng liên quan
    order: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: true
    },
    
    // Thông tin khách hàng
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    
    // Số tiền thanh toán
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    
    // Phương thức thanh toán
    paymentMethod: {
        type: String,
        enum: ['cash', 'bank', 'momo', 'zalopay', 'vnpay'],
        required: true
    },
    
    // Trạng thái thanh toán
    status: {
        type: String,
        enum: ['pending', 'paid', 'failed', 'refunded'],
        default: 'pending'
    },
    
    // Mã giao dịch (nếu có)
    transactionId: {
        type: String,
        default: null
    },
    
    // Thông tin ngân hàng/ví (nếu có)
    bankInfo: {
        bankName: String,
        accountNumber: String,
        accountName: String
    },
    
    // Ghi chú
    notes: {
        type: String,
        default: ''
    },
    
    // Thời gian thanh toán
    paidAt: {
        type: Date,
        default: null
    },
    
    // Người xử lý (admin)
    processedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    }
    
}, {
    timestamps: true
});

// Index để tìm kiếm nhanh
PaymentSchema.index({ order: 1 });
PaymentSchema.index({ user: 1 });
PaymentSchema.index({ status: 1 });
PaymentSchema.index({ paymentMethod: 1 });
PaymentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Payment', PaymentSchema);
