const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../config/auth');
const VNPayPayment = require('../middleware/vnpay');
const Order = require('../models/Order');
const Payment = require('../models/Payment');
const User = require('../models/User');

// Initialize payment instances
const vnpayPayment = new VNPayPayment();

// ================================
// VNPAY PAYMENT ROUTES
// ================================

/**
 * Create VNPay payment request
 * POST /payment/vnpay/create
 */
router.post('/vnpay/create', ensureAuthenticated, async (req, res) => {
    try {
        const { orderId } = req.body;
        
        if (!orderId) {
            return res.status(400).json({
                success: false,
                message: 'Order ID is required'
            });
        }

        // Handle mock order ID for testing (keep for backward compatibility)
        if (orderId.startsWith('ORDER_') && orderId.length > 20) {
            // This is a mock order ID, create demo payment
            const paymentRequest = vnpayPayment.createPaymentUrl({
                orderId: orderId,
                amount: 30000, // Demo amount
                orderInfo: `Demo thanh toán VNPay - ${orderId}`,
                ipAddr: req.ip || '127.0.0.1'
            });

            if (paymentRequest.success) {
                return res.json({
                    success: true,
                    paymentUrl: paymentRequest.data.paymentUrl,
                    paymentId: 'vnpay_payment_id',
                    gatewayOrderId: orderId
                });
            } else {
                return res.status(500).json({
                    success: false,
                    message: 'Failed to create VNPay payment: ' + paymentRequest.error
                });
            }
        }

        // Find the order (only for valid ObjectIds)
        const order = await Order.findById(orderId).populate('user');
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Check if user owns this order
        if (order.user._id.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        // Create VNPay payment request
        const paymentRequest = vnpayPayment.createPaymentUrl({
            orderId: order._id.toString(),
            amount: order.totalPrice,
            orderInfo: `Thanh toán đơn hàng ${order._id}`,
            ipAddr: req.ip || '127.0.0.1'
        });

        if (paymentRequest.success) {
            // Create payment record
            const payment = new Payment({
                order: order._id,
                user: req.user._id,
                amount: order.totalPrice,
                paymentMethod: 'vnpay',
                status: 'pending',
                gatewayOrderId: order._id.toString()
            });
            await payment.save();

            res.json({
                success: true,
                paymentUrl: paymentRequest.data.paymentUrl,
                paymentId: payment._id,
                gatewayOrderId: order._id
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Failed to create VNPay payment: ' + paymentRequest.error
            });
        }

    } catch (error) {
        console.error('VNPay payment creation error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

/**
 * Handle VNPay callback (return URL)
 * GET /payment/vnpay/callback
 */
router.get('/vnpay/callback', async (req, res) => {
    try {
        console.log('VNPay callback received:', req.query);
        
        // Verify callback
        const verification = vnpayPayment.verifyCallback(req.query);
        
        if (!verification.isValid) {
            console.error('Invalid VNPay signature:', verification);
            return res.render('payment-result', {
                success: false,
                title: 'Thanh toán thất bại',
                message: 'Chữ ký không hợp lệ',
                orderId: verification.orderId
            });
        }

        const isSuccess = verification.responseCode === '00';
        const orderId = verification.orderId;

        // Handle mock order ID (long mock IDs only)
        if (orderId.startsWith('ORDER_') && orderId.length > 20) {
            return res.render('payment-result', {
                success: isSuccess,
                title: isSuccess ? 'Thanh toán thành công!' : 'Thanh toán thất bại',
                message: isSuccess ? 
                    'Cảm ơn bạn đã thanh toán qua VNPay!' : 
                    vnpayPayment.getResponseMessage(verification.responseCode),
                orderId: orderId,
                transactionId: verification.transactionId,
                amount: verification.amount,
                paymentMethod: 'VNPay',
                bankCode: verification.bankCode
            });
        }

        // Find order and payment
        console.log('🔍 Looking for order:', orderId);
        const order = await Order.findById(orderId);
        const payment = await Payment.findOne({ gatewayOrderId: orderId });

        console.log('📦 Found order:', order ? 'YES' : 'NO');
        console.log('💳 Found payment:', payment ? 'YES' : 'NO');
        
        if (order) {
            console.log('👤 Order user:', order.user);
        }

        if (!order || !payment) {
            return res.render('payment-result', {
                success: false,
                title: 'Lỗi hệ thống',
                message: 'Không tìm thấy đơn hàng',
                orderId: orderId
            });
        }

        if (isSuccess) {
            // Update order and payment status
            order.status = 'confirmed';  // Trả lại logic cũ: confirmed → admin sẽ xử lý tiếp
            order.paymentStatus = 'paid';
            await order.save();

            payment.status = 'paid';
            payment.paidAt = new Date();
            payment.gatewayTransactionId = verification.transactionId;
            payment.gatewayResponse = req.query;
            payment.gatewayMetadata = {
                responseCode: verification.responseCode,
                bankCode: verification.bankCode,
                payDate: verification.payDate
            };
            await payment.save();

            // Emit notification đơn hàng mới đến admin/manager/staff (VNPay paid successfully)
            const io = req.app.get('io');
            if (io) {
                const userInfo = await User.findById(order.user);
                io.emit('new-order', {
                    orderId: order._id,
                    customerName: userInfo ? userInfo.name : 'Khách hàng',
                    totalPrice: order.totalPrice,
                    paymentMethod: 'vnpay',
                    timestamp: new Date()
                });
                console.log('🔔 New order notification sent (VNPay paid):', order._id);
            }

            // Clear user cart
            console.log('🧹 Clearing cart for user:', order.user);
            const cartClearResult = await User.updateOne(
                { _id: order.user },
                { $set: { cart: [] } }
            );
            console.log('🧹 Cart clear result:', cartClearResult);

            res.render('payment-result', {
                success: true,
                title: 'Thanh toán thành công!',
                message: 'Cảm ơn bạn đã thanh toán qua VNPay!',
                orderId: orderId,
                transactionId: verification.transactionId,
                amount: verification.amount,
                paymentMethod: 'VNPay',
                bankCode: verification.bankCode
            });
        } else {
            // Update payment status to failed
            payment.status = 'failed';
            payment.gatewayResponse = req.query;
            payment.gatewayMetadata = {
                responseCode: verification.responseCode,
                message: vnpayPayment.getResponseMessage(verification.responseCode)
            };
            await payment.save();

            res.render('payment-result', {
                success: false,
                title: 'Thanh toán thất bại',
                message: vnpayPayment.getResponseMessage(verification.responseCode),
                orderId: orderId,
                paymentMethod: 'VNPay'
            });
        }

    } catch (error) {
        console.error('VNPay callback error:', error);
        res.render('payment-result', {
            success: false,
            title: 'Lỗi hệ thống',
            message: 'Có lỗi xảy ra khi xử lý thanh toán'
        });
    }
});

module.exports = router;
