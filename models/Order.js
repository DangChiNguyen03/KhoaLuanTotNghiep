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
            required: true,
            min: 1
        },
        toppings: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product'
        }],
        sugarLevel: String,
        iceLevel: String
    }],
    totalPrice: {
        type: Number,
        required: true
    },
    paymentMethod: {
        type: String,
        enum: ['cash', 'bank'],
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'completed'],
        default: 'completed'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Order', orderSchema);