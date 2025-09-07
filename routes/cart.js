const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const User = require('../models/User');
const Order = require('../models/Order');
const Payment = require('../models/Payment');
const { isAuthenticated } = require('../middleware/auth'); 

// Xem giỏ hàng
router.get('/', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).populate('cart.product');
        if (!user) {
            req.flash('error_msg', 'Không tìm thấy người dùng');
            return res.redirect('/');
        }

        console.log('Cart data:', user.cart);

        const cartItems = await Promise.all(user.cart.map(async (item) => {
            const validToppingIds = item.toppings.filter(t => mongoose.Types.ObjectId.isValid(t));
            let toppingDetails = [];
            if (validToppingIds.length > 0) {
                toppingDetails = await Product.find({ 
                    _id: { $in: validToppingIds }, 
                    category: 'Topping' 
                }).select('name price sizes');
                
                // Đảm bảo mỗi topping có giá hiển thị đúng
                toppingDetails = toppingDetails.map(topping => ({
                    ...topping.toObject(),
                    price: topping.price || (topping.sizes && topping.sizes[0] ? topping.sizes[0].price : 0)
                }));
            }

            return {
                ...item.toObject(),
                toppingDetails: toppingDetails
            };
        }));

        let totalPrice = 0;
        for (const item of cartItems) {
            if (item.product) {
                // Tính giá sản phẩm chính - luôn lấy giá mới nhất từ database
                let itemTotal = 0;
                if (item.product.category === 'Topping') {
                    // Topping: lấy từ price hoặc sizes[0].price
                    itemTotal = item.product.price || (item.product.sizes && item.product.sizes[0] ? item.product.sizes[0].price : 0);
                } else {
                    // Sản phẩm thường: lấy giá theo size đã chọn
                    if (item.product.sizes && Array.isArray(item.product.sizes) && item.size) {
                        const sizeObj = item.product.sizes.find(s => s.size === item.size);
                        itemTotal = sizeObj ? sizeObj.price : 0;
                    } else {
                        itemTotal = item.product.price || 0;
                    }
                }
                
                // Tính giá topping dựa trên giá thực tế
                let toppingTotal = 0;
                if (item.toppingDetails && item.toppingDetails.length > 0) {
                    toppingTotal = item.toppingDetails.reduce((sum, topping) => {
                        const toppingPrice = topping.price || (topping.sizes && topping.sizes[0] ? topping.sizes[0].price : 0);
                        return sum + toppingPrice;
                    }, 0);
                }
                
                itemTotal += toppingTotal;
                itemTotal *= item.quantity;
                totalPrice += itemTotal;
            }
        }

        res.render('cart', { 
            cart: cartItems,
            totalPrice: totalPrice 
        });
    } catch (err) {
        console.error('Error fetching cart:', err);
        req.flash('error_msg', 'Có lỗi xảy ra khi tải giỏ hàng');
        res.redirect('/');
    }
});

// Thêm vào giỏ hàng
router.post('/add', isAuthenticated, async (req, res) => {
    try {
        const { productId, quantity = 1, toppings = [], sugarLevel = '50%', iceLevel = '50%', size = 'M' } = req.body;

        console.log('Adding product to cart:', { productId, quantity, toppings, sugarLevel, iceLevel });

        if (!productId) {
            return res.status(400).json({ message: 'Thiếu productId' });
        }

        const qty = parseInt(quantity);
        if (isNaN(qty) || qty <= 0) {
            return res.status(400).json({ message: 'Số lượng không hợp lệ' });
        }

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
        }

        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ message: 'Không tìm thấy người dùng' });
        }

        const toppingProducts = await Product.find({ 
            name: { $in: toppings }, 
            category: 'Topping' 
        }).select('_id');
        const toppingIds = toppingProducts.map(t => t._id);

        
        // Lấy giá đúng theo size
        let price = 0;
        if (product.sizes && Array.isArray(product.sizes)) {
            const sizeObj = product.sizes.find(s => s.size === size);
            if (sizeObj) price = sizeObj.price;
        }
        const cartItemIndex = user.cart.findIndex(item =>
            item.product.toString() === productId &&
            JSON.stringify(item.toppings.sort()) === JSON.stringify(toppingIds.sort()) &&
            item.sugarLevel === sugarLevel &&
            item.iceLevel === iceLevel &&
            item.size === size
        );

        if (cartItemIndex > -1) {
            user.cart[cartItemIndex].quantity += qty;
        } else {
            user.cart.push({
                product: productId,
                quantity: qty,
                toppings: toppingIds,
                sugarLevel: sugarLevel,
                iceLevel: iceLevel,
                size: size,
                price: price
            });
        }

        // Sử dụng updateOne để tránh validation issues với admin accounts
        await User.updateOne(
            { _id: user._id },
            { $set: { cart: user.cart } }
        );
        console.log('Updated cart:', user.cart);

        res.json({ message: 'Thêm vào giỏ hàng thành công', cart: user.cart });
    } catch (err) {
        console.error('Error adding to cart:', err);
        res.status(500).json({ message: 'Có lỗi xảy ra khi thêm vào giỏ hàng' });
    }
});

// Cập nhật số lượng
router.put('/update/:itemId', isAuthenticated, async (req, res) => {
    try {
        const { quantity } = req.body;

        console.log('Updating cart item:', { itemId: req.params.itemId, quantity });

        const qty = parseInt(quantity);
        if (!quantity || isNaN(qty) || qty <= 0) {
            return res.status(400).json({ message: 'Số lượng không hợp lệ' });
        }

        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ message: 'Không tìm thấy người dùng' });
        }

        const cartItem = user.cart.id(req.params.itemId);
        if (!cartItem) {
            return res.status(404).json({ message: 'Không tìm thấy sản phẩm trong giỏ hàng' });
        }

        cartItem.quantity = qty;
        await user.save();

        res.json({ message: 'Cập nhật giỏ hàng thành công', cart: user.cart });
    } catch (err) {
        console.error('Error updating cart:', err);
        res.status(500).json({ message: 'Có lỗi xảy ra' });
    }
});

// Xóa sản phẩm
router.delete('/remove/:itemId', isAuthenticated, async (req, res) => {
    try {
        console.log('Removing item from cart:', req.params.itemId);

        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ message: 'Không tìm thấy người dùng' });
        }

        user.cart.pull({ _id: req.params.itemId });
        await user.save();

        res.json({ message: 'Xóa sản phẩm khỏi giỏ hàng thành công', cart: user.cart });
    } catch (err) {
        console.error('Error removing from cart:', err);
        res.status(500).json({ message: 'Có lỗi xảy ra' });
    }
});

// Xóa topping
router.delete('/remove-topping/:itemId/:toppingId', isAuthenticated, async (req, res) => {
    try {
        const { itemId, toppingId } = req.params;
        console.log('Removing topping from cart item:', { itemId, toppingId });

        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ message: 'Không tìm thấy người dùng' });
        }

        const cartItem = user.cart.id(itemId);
        if (!cartItem) {
            return res.status(404).json({ message: 'Không tìm thấy sản phẩm trong giỏ hàng' });
        }

        cartItem.toppings = cartItem.toppings.filter(t => t.toString() !== toppingId);
        await user.save();

        res.json({ message: 'Xóa topping thành công', cart: user.cart });
    } catch (err) {
        console.error('Error removing topping from cart:', err);
        res.status(500).json({ message: 'Có lỗi xảy ra khi xóa topping' });
    }
});

// Trang thanh toán
router.get('/checkout', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).populate('cart.product');
        if (!user || !user.cart.length) {
            req.flash('error_msg', 'Giỏ hàng trống, không thể thanh toán');
            return res.redirect('/cart');
        }

        const cartItems = await Promise.all(user.cart.map(async (item) => {
            const validToppingIds = item.toppings.filter(t => mongoose.Types.ObjectId.isValid(t));
            let toppingDetails = [];
            if (validToppingIds.length > 0) {
                toppingDetails = await Product.find({ 
                    _id: { $in: validToppingIds }, 
                    category: 'Topping' 
                }).select('name price sizes');
            }

            return {
                ...item.toObject(),
                toppingDetails: toppingDetails
            };
        }));

        let totalPrice = 0;
        for (const item of cartItems) {
            if (item.product) {
                // Tính giá sản phẩm chính - luôn lấy giá mới nhất từ database
                let itemTotal = 0;
                if (item.product.category === 'Topping') {
                    // Topping: lấy từ price hoặc sizes[0].price
                    itemTotal = item.product.price || (item.product.sizes && item.product.sizes[0] ? item.product.sizes[0].price : 0);
                } else {
                    // Sản phẩm thường: lấy giá theo size đã chọn
                    if (item.product.sizes && Array.isArray(item.product.sizes) && item.size) {
                        const sizeObj = item.product.sizes.find(s => s.size === item.size);
                        itemTotal = sizeObj ? sizeObj.price : 0;
                    } else {
                        itemTotal = item.product.price || 0;
                    }
                }
                
                // Tính giá topping dựa trên giá thực tế
                let toppingTotal = 0;
                if (item.toppingDetails && item.toppingDetails.length > 0) {
                    toppingTotal = item.toppingDetails.reduce((sum, topping) => {
                        const toppingPrice = topping.price || (topping.sizes && topping.sizes[0] ? topping.sizes[0].price : 0);
                        return sum + toppingPrice;
                    }, 0);
                }
                
                itemTotal += toppingTotal;
                itemTotal *= item.quantity;
                totalPrice += itemTotal;
            }
        }

        res.render('checkout', { 
            cart: cartItems,
            totalPrice: totalPrice,
            user: user.toObject()
        });
    } catch (err) {
        console.error('Error loading checkout:', err);
        req.flash('error_msg', 'Có lỗi xảy ra khi tải trang thanh toán');
        res.redirect('/cart');
    }
});

// Xử lý thanh toán
router.post('/checkout', isAuthenticated, async (req, res) => {
    try {
        const { paymentMethod, cashAmount } = req.body;
        const user = await User.findById(req.user._id).populate('cart.product');
        if (!user || !user.cart.length) {
            req.flash('error_msg', 'Giỏ hàng trống, không thể thanh toán');
            return res.redirect('/cart');
        }

        const cartItems = await Promise.all(user.cart.map(async (item) => {
            const validToppingIds = item.toppings.filter(t => mongoose.Types.ObjectId.isValid(t));
            let toppingDetails = [];
            if (validToppingIds.length > 0) {
                toppingDetails = await Product.find({ 
                    _id: { $in: validToppingIds }, 
                    category: 'Topping' 
                }).select('name price sizes');
            }
            return {
                ...item.toObject(),
                toppingDetails: toppingDetails
            };
        }));

        let totalPrice = 0;
        for (const item of cartItems) {
            if (item.product) {
                // Tính giá sản phẩm chính - luôn lấy giá mới nhất từ database
                let itemTotal = 0;
                if (item.product.category === 'Topping') {
                    // Topping: lấy từ price hoặc sizes[0].price
                    itemTotal = item.product.price || (item.product.sizes && item.product.sizes[0] ? item.product.sizes[0].price : 0);
                } else {
                    // Sản phẩm thường: lấy giá theo size đã chọn
                    if (item.product.sizes && Array.isArray(item.product.sizes) && item.size) {
                        const sizeObj = item.product.sizes.find(s => s.size === item.size);
                        itemTotal = sizeObj ? sizeObj.price : 0;
                    } else {
                        // Fallback cho sản phẩm cũ không có sizes
                        itemTotal = 0;
                        console.warn(`Sản phẩm ${item.product.name} không có giá cho size ${item.size}`);
                    }
                }
                
                // Tính giá topping dựa trên giá thực tế
                let toppingTotal = 0;
                if (item.toppingDetails && item.toppingDetails.length > 0) {
                    toppingTotal = item.toppingDetails.reduce((sum, topping) => {
                        const toppingPrice = topping.price || (topping.sizes && topping.sizes[0] ? topping.sizes[0].price : 0);
                        return sum + toppingPrice;
                    }, 0);
                }
                
                itemTotal += toppingTotal;
                itemTotal *= item.quantity;
                totalPrice += itemTotal;
            }
        }

        // Kiểm tra phương thức thanh toán
        if (!['cash', 'bank'].includes(paymentMethod)) {
            req.flash('error_msg', 'Phương thức thanh toán không hợp lệ');
            return res.redirect('/cart/checkout');
        }

        if (paymentMethod === 'cash') {
            const cash = parseInt(cashAmount);
            if (isNaN(cash) || cash < totalPrice) {
                req.flash('error_msg', 'Số tiền khách đưa không đủ');
                return res.redirect('/cart/checkout');
            }
        }

        // Lưu đơn hàng vào MongoDB
        const order = new Order({
            user: user._id,
            items: user.cart.map(item => ({
                product: item.product,
                quantity: item.quantity,
                toppings: item.toppings,
                sugarLevel: item.sugarLevel,
                iceLevel: item.iceLevel,
                size: item.size
            })),
            totalPrice: totalPrice,
            paymentMethod: paymentMethod,
            status: 'pending',
            paymentStatus: paymentMethod === 'cash' ? 'paid' : 'pending'
        });
        await order.save();

        // Tạo Payment record
        const payment = new Payment({
            order: order._id,
            user: user._id,
            amount: totalPrice,
            paymentMethod: paymentMethod,
            status: 'paid', // Sử dụng enum value đúng từ Payment model
            paidAt: new Date()
        });
        await payment.save();

        // Cập nhật Order với Payment reference
        order.payment = payment._id;
        await order.save();

        // Xóa giỏ hàng sau khi thanh toán - sử dụng updateOne để tránh validation
        await User.updateOne(
            { _id: user._id },
            { $set: { cart: [] } }
        );

        req.flash('success_msg', 'Thanh toán thành công! Cảm ơn bạn đã mua hàng.');
        res.redirect('/');
    } catch (err) {
        console.error('Error processing checkout:', err);
        req.flash('error_msg', 'Có lỗi xảy ra khi xử lý thanh toán');
        res.redirect('/cart/checkout');
    }
});

module.exports = router;