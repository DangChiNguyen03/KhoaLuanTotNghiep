const mongoose = require('mongoose');

const VoucherSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        uppercase: true
    },
    description: {
        type: String,
        required: true
    },
    discountType: {
        type: String,
        enum: ['percentage', 'fixed_amount', 'special_day_fixed_price'],
        required: true
    },
    discountValue: {
        type: Number,
        required: true,
    },
    applicableCategory: {
        type: String, // Ví dụ: 'Cà phê'
        default: null
    },

    // --- Special Day Fixed Price Conditions ---
    specialDay: {
        type: Number, // Day of week (0=Sunday, 1=Monday, ..., 6=Saturday)
        min: 0,
        max: 6,
        default: null
    },
    applicableSize: {
        type: String, // e.g., 'L', 'M', 'S'
        trim: true,
        uppercase: true,
        default: null
    },
    fixedPrice: {
        type: Number, // The fixed price for the deal, e.g., 30000
        default: null
    },

    // Điều kiện về thời gian trong ngày (Happy Hour)
    startTime: {
        type: Number, // Giờ bắt đầu (0-23)
        min: 0,
        max: 23,
        default: null
    },
    endTime: {
        type: Number, // Giờ kết thúc (0-23)
        min: 0,
        max: 23,
        default: null
    },
    
    // Phân quyền theo role - Voucher chỉ áp dụng cho các role cụ thể
    applicableRoles: {
        type: [String], // Array of roles: ['admin', 'manager', 'staff', 'customer']
        enum: ['admin', 'manager', 'staff', 'customer'],
        default: ['admin', 'manager', 'staff', 'customer'] // Mặc định áp dụng cho tất cả
    },
    
    isActive: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Voucher', VoucherSchema);
