const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    price: {
        type: Number,
        required: true
    },
    image: {
        type: String,
        required: true
    },
    category: {
        type: String,
        required: true,
        enum: ['Trà sữa', 'Trà trái cây', 'Đá xay', 'Topping', 'Trà truyền thống'] // Thêm 'Trà truyền thống'
    },
    toppings: [{
        type: String
    }],
    sugarLevels: {
        type: [String],
        default: ['0%', '25%', '50%', '70%', '100%']
    },
    iceLevels: {
        type: [String],
        default: ['0%', '25%', '50%', '70%', '100%']
    },
    isAvailable: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const Product = mongoose.model('Product', ProductSchema);

module.exports = Product;