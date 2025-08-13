const mongoose = require('mongoose');
const Product = require('../models/Product');

// Kết nối MongoDB
mongoose.connect('mongodb://127.0.0.1:27017/bubble-tea-shop', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

async function cleanupProductPrices() {
    try {
        console.log('🧹 Bắt đầu dọn dẹp dữ liệu sản phẩm...');

        // 1. Lấy tất cả sản phẩm KHÔNG phải topping và có trường price cũ
        const nonToppingProducts = await Product.find({
            category: { $ne: 'Topping' },
            price: { $exists: true }
        });

        console.log(`📦 Tìm thấy ${nonToppingProducts.length} sản phẩm cần dọn dẹp`);

        // 2. Xóa trường price khỏi sản phẩm không phải topping
        const result1 = await Product.updateMany(
            { 
                category: { $ne: 'Topping' },
                price: { $exists: true }
            },
            { 
                $unset: { price: "" } 
            }
        );

        console.log(`✅ Đã xóa trường price cũ khỏi ${result1.modifiedCount} sản phẩm`);

        // 3. Đảm bảo tất cả topping có trường price
        const toppings = await Product.find({ category: 'Topping' });
        let toppingUpdated = 0;

        for (const topping of toppings) {
            if (!topping.price && topping.sizes && topping.sizes.length > 0) {
                // Nếu topping không có price nhưng có sizes, copy giá từ sizes[0]
                await Product.findByIdAndUpdate(topping._id, {
                    price: topping.sizes[0].price
                });
                toppingUpdated++;
            }
        }

        console.log(`✅ Đã cập nhật price cho ${toppingUpdated} topping`);

        // 4. Kiểm tra kết quả
        const finalCheck = await Product.find({});
        const productStats = {
            totalProducts: finalCheck.length,
            toppingsWithPrice: finalCheck.filter(p => p.category === 'Topping' && p.price).length,
            nonToppingsWithSizes: finalCheck.filter(p => p.category !== 'Topping' && p.sizes && p.sizes.length > 0).length,
            nonToppingsWithOldPrice: finalCheck.filter(p => p.category !== 'Topping' && p.price).length
        };

        console.log('\n📊 Thống kê sau khi dọn dẹp:');
        console.log(`- Tổng sản phẩm: ${productStats.totalProducts}`);
        console.log(`- Topping có price: ${productStats.toppingsWithPrice}`);
        console.log(`- Sản phẩm có sizes: ${productStats.nonToppingsWithSizes}`);
        console.log(`- Sản phẩm còn price cũ: ${productStats.nonToppingsWithOldPrice}`);

        if (productStats.nonToppingsWithOldPrice === 0) {
            console.log('🎉 Dọn dẹp hoàn tất! Database đã đồng bộ.');
        } else {
            console.log('⚠️  Vẫn còn sản phẩm có price cũ cần kiểm tra.');
        }

    } catch (error) {
        console.error('❌ Lỗi khi dọn dẹp:', error);
    } finally {
        mongoose.connection.close();
        console.log('🔌 Đã đóng kết nối database');
    }
}

// Chạy script
cleanupProductPrices();
