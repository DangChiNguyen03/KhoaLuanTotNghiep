const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
    sizes: {
        type: [{
            size: { type: String, required: true },
            price: { type: Number, required: true }
        }],
        default: function() {
            if (this.category === 'Topping') return [];
            return [
                { size: 'S', price: null },
                { size: 'M', price: null },
                { size: 'L', price: null }
            ];
        }
    },
    name: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },

    image: {
        type: String,
        required: true
    },
    category: {
        type: String,
        required: true,
        enum: ['Trà sữa', 'Trà trái cây', 'Đá xay', 'Topping', 'Cà phê', 'Nước ép']    },
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