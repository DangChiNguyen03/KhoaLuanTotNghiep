const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const Product = require('../models/Product');
const Order = require('../models/Order');

async function checkDataConsistency() {
    try {
        // Connect to MongoDB
        await mongoose.connect("mongodb://127.0.0.1:27017/bubble-tea-shop", {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        
        console.log('🔍 KIỂM TRA TÍNH NHẤT QUÁN DỮ LIỆU');
        console.log('=====================================\n');

        // 1. Check Product Pricing Consistency
        console.log('1. 📦 KIỂM TRA GIÁ SẢN PHẨM:');
        const products = await Product.find();
        
        let productIssues = 0;
        for (const product of products) {
            if (product.category === 'Topping') {
                // Topping should have either price field or sizes[0].price
                const hasPrice = product.price !== undefined && product.price !== null;
                const hasSizePrice = product.sizes && product.sizes[0] && product.sizes[0].price;
                
                if (!hasPrice && !hasSizePrice) {
                    console.log(`❌ ${product.name}: Topping thiếu giá (không có price và sizes[0].price)`);
                    productIssues++;
                } else if (hasPrice && hasSizePrice && product.price !== product.sizes[0].price) {
                    console.log(`⚠️  ${product.name}: Giá không khớp (price: ${product.price}, sizes[0].price: ${product.sizes[0].price})`);
                    productIssues++;
                } else {
                    console.log(`✅ ${product.name}: OK (${hasPrice ? product.price : product.sizes[0].price}đ)`);
                }
            } else {
                // Regular products should have sizes array with prices
                if (!product.sizes || product.sizes.length === 0) {
                    console.log(`❌ ${product.name}: Sản phẩm thường thiếu sizes array`);
                    productIssues++;
                } else {
                    const invalidSizes = product.sizes.filter(s => !s.price || s.price <= 0);
                    if (invalidSizes.length > 0) {
                        console.log(`❌ ${product.name}: Có size thiếu giá: ${invalidSizes.map(s => s.size).join(', ')}`);
                        productIssues++;
                    } else {
                        console.log(`✅ ${product.name}: OK (${product.sizes.length} sizes)`);
                    }
                }
            }
        }
        
        console.log(`\n📊 Tổng kết sản phẩm: ${productIssues} vấn đề / ${products.length} sản phẩm\n`);

        // 2. Check Order Pricing Consistency
        console.log('2. 🛒 KIỂM TRA GIÁ TRONG ĐỚN HÀNG:');
        const orders = await Order.find().populate('items.product').limit(10);
        
        let orderIssues = 0;
        for (const order of orders) {
            console.log(`\n📋 Đơn hàng ${order._id}:`);
            console.log(`   Tổng giá: ${order.totalPrice}đ | Giá gốc: ${order.originalPrice || 'N/A'}đ`);
            
            let calculatedTotal = 0;
            for (const item of order.items) {
                if (item.product) {
                    let expectedPrice = 0;
                    
                    if (item.product.category === 'Topping') {
                        expectedPrice = item.product.price || 
                                     (item.product.sizes && item.product.sizes[0] ? item.product.sizes[0].price : 0);
                    } else {
                        const sizeObj = item.product.sizes?.find(s => s.size === item.size);
                        expectedPrice = sizeObj ? sizeObj.price : 0;
                    }
                    
                    calculatedTotal += expectedPrice * item.quantity;
                    
                    if (item.price && Math.abs(item.price - expectedPrice) > 1) {
                        console.log(`   ⚠️  ${item.product.name}: Giá lưu (${item.price}đ) ≠ Giá tính (${expectedPrice}đ)`);
                        orderIssues++;
                    } else {
                        console.log(`   ✅ ${item.product.name}: OK (${expectedPrice}đ x ${item.quantity})`);
                    }
                }
            }
            
            // Check if calculated total matches stored total (allowing for voucher discounts)
            if (order.originalPrice && Math.abs(calculatedTotal - order.originalPrice) > 1) {
                console.log(`   ❌ Tổng tính toán (${calculatedTotal}đ) ≠ Giá gốc lưu (${order.originalPrice}đ)`);
                orderIssues++;
            }
        }
        
        console.log(`\n📊 Tổng kết đơn hàng: ${orderIssues} vấn đề / ${orders.length} đơn hàng kiểm tra\n`);

        // 3. Summary
        console.log('3. 📋 TỔNG KẾT:');
        if (productIssues === 0 && orderIssues === 0) {
            console.log('🎉 HOÀN HẢO! Không có vấn đề về tính nhất quán dữ liệu.');
        } else {
            console.log(`⚠️  Phát hiện ${productIssues + orderIssues} vấn đề cần khắc phục:`);
            console.log(`   - Sản phẩm: ${productIssues} vấn đề`);
            console.log(`   - Đơn hàng: ${orderIssues} vấn đề`);
            console.log('\n💡 Khuyến nghị:');
            console.log('   1. Cập nhật giá sản phẩm thiếu');
            console.log('   2. Kiểm tra logic tính giá trong checkout');
            console.log('   3. Chạy lại báo cáo sau khi sửa');
        }

    } catch (error) {
        console.error('❌ Lỗi khi kiểm tra:', error);
    } finally {
        await mongoose.connection.close();
        console.log('\n🔌 Đã ngắt kết nối database');
    }
}

// Run the check
checkDataConsistency();
