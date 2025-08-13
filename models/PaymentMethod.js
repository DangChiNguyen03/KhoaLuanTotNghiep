const mongoose = require('mongoose');

const PaymentMethodSchema = new mongoose.Schema({
    // Tên phương thức thanh toán
    name: {
        type: String,
        required: true,
        trim: true
    },
    
    // Mã phương thức (cash, bank, momo, etc.)
    code: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    
    // Mô tả
    description: {
        type: String,
        default: ''
    },
    
    // Icon/Logo
    icon: {
        type: String,
        default: ''
    },
    
    // Thông tin cấu hình (JSON)
    config: {
        // Thông tin ngân hàng
        bankName: String,
        accountNumber: String,
        accountName: String,
        
        // Thông tin API (cho ví điện tử)
        apiKey: String,
        secretKey: String,
        webhookUrl: String,
        
        // Phí giao dịch
        fee: {
            type: Number,
            default: 0,
            min: 0
        },
        feeType: {
            type: String,
            enum: ['fixed', 'percent'],
            default: 'fixed'
        }
    },
    
    // Trạng thái hoạt động
    isActive: {
        type: Boolean,
        default: true
    },
    
    // Thứ tự hiển thị
    order: {
        type: Number,
        default: 0
    }
    
}, {
    timestamps: true
});

// Index
PaymentMethodSchema.index({ code: 1 });
PaymentMethodSchema.index({ isActive: 1, order: 1 });

module.exports = mongoose.model('PaymentMethod', PaymentMethodSchema);
