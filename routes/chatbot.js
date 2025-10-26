const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Order = require('../models/Order');
const Voucher = require('../models/Voucher');
const fetch = require('node-fetch');
global.fetch = fetch;  // Override built-in fetch
const { GoogleGenAI } = require('@google/genai');

// Khởi tạo Gemini AI - SDK mới
const genAI = new GoogleGenAI({});

// Hàm gọi Gemini AI đơn giản
async function callGeminiAI(message, products, bestSellers, vouchers) {
    try {
        console.log('🤖 Đang gọi Gemini AI...');
        console.log(`📊 Database info: ${products.length} products, ${bestSellers.length} best sellers`);
        
        // Tạo prompt với thông tin database
        let prompt = `Bạn là tư vấn viên bán hàng AI của YOLOBrew - cửa hàng trà sữa. Trả lời ngắn gọn, thân thiện bằng tiếng Việt.

QUAN TRỌNG: CHỈ khi khách hàng đã CHỐT/QUYẾT ĐỊNH MUA (vd: "cho tôi cà phê đen", "tôi muốn order", "lấy ly trà sữa") thì mới hướng dẫn:
- Đăng ký tài khoản trên website để đặt hàng online
- Hoặc gọi hotline 0123-456-789 để đặt hàng  
- Hoặc ghé trực tiếp cửa hàng

Thông tin cửa hàng: YOLOBrew Milk Tea Shop, mở cửa 7:00-22:00, giao hàng miễn phí bán kính 3km.`;

        // Thêm menu từ database
        if (products.length > 0) {
            prompt += `\n\nMENU CỬA HÀNG:`;
            const categories = [...new Set(products.map(p => p.category))];
            categories.forEach(category => {
                const items = products.filter(p => p.category === category).slice(0, 5);
                prompt += `\n• ${category}: `;
                items.forEach((item, index) => {
                    prompt += `${item.name} (${item.price?.toLocaleString()}đ)`;
                    if (index < items.length - 1) prompt += ', ';
                });
            });
        }

        // Thêm sản phẩm bán chạy
        if (bestSellers.length > 0) {
            prompt += `\n\nSẢN PHẨM BÁN CHẠY: `;
            bestSellers.slice(0, 5).forEach((item, index) => {
                prompt += item.productName;
                if (index < bestSellers.length - 1) prompt += ', ';
            });
        }

        // Thêm thông tin vouchers/mã giảm giá
        if (vouchers.length > 0) {
            prompt += `\n\nMÃ GIẢM GIÁ HIỆN TẠI:`;
            vouchers.forEach(voucher => {
                prompt += `\n• ${voucher.code}: ${voucher.description}`;
                if (voucher.discountType === 'percentage') {
                    prompt += ` (Giảm ${voucher.discountValue}%)`;
                } else if (voucher.discountType === 'special_day_fixed_price') {
                    prompt += ` (Đồng giá ${voucher.fixedPrice?.toLocaleString()}đ)`;
                }
                if (voucher.applicableCategory) {
                    prompt += ` - Áp dụng: ${voucher.applicableCategory}`;
                }
                if (voucher.startTime && voucher.endTime) {
                    prompt += ` - Thời gian: ${voucher.startTime}h-${voucher.endTime}h`;
                }
            });
        }

        prompt += `\n\nKhách hàng hỏi: ${message}

Hãy trả lời dựa trên menu thực tế. CHỈ hướng dẫn đặt hàng khi khách hàng đã chốt/quyết định mua:`;

        // Retry logic với exponential backoff
        const maxRetries = 3;
        let retryCount = 0;
        
        while (retryCount < maxRetries) {
            try {
                const result = await genAI.models.generateContent({
                    model: "gemini-2.5-pro",  // Model stable, ít overload hơn
                    contents: prompt  // Nội dung prompt là string đơn giản
                });
                const text = result.text;  // Lấy text từ response
                
                console.log('✅ Gemini AI thành công!');
                return text;
                
            } catch (error) {
                if (error.status === 503) {  // Overload
                    retryCount++;
                    const delay = Math.pow(2, retryCount) * 1000;  // 2s, 4s, 8s
                    console.log(`⚠️ Overload, retry sau ${delay/1000}s... (lần ${retryCount})`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else if (error.status === 429) {  // Quota exceeded
                    console.log('🚫 Quota exceeded - chuyển sang fallback ngay');
                    throw new Error('Quota exceeded - dùng fallback');
                } else {
                    throw error;  // Lỗi khác không retry
                }
            }
        }
        
        throw new Error('Max retries reached for overload error');
        
    } catch (error) {
        console.log('❌ Gemini lỗi chi tiết:', error); // In full error để debug
        
        // Fallback thông minh với database
        console.log('🔄 Dùng AI fallback thông minh...');
        return generateSmartFallback(message, products, bestSellers, vouchers);
    }
}

// Fallback thông minh khi Gemini lỗi
function generateSmartFallback(message, products, bestSellers, vouchers) {
    const msg = message.toLowerCase();
    
    // Kiểm tra nếu khách hàng đã chốt/quyết định mua
    const isOrdering = msg.includes('cho tôi') || msg.includes('lấy') || msg.includes('order') || 
                      msg.includes('mua') || msg.includes('đặt') || msg.includes('muốn');
    
    // Chào hỏi
    if (msg.includes('chào') || msg.includes('hello') || msg.includes('hi')) {
        return '👋 Xin chào! Tôi là trợ lý AI của YOLOBrew. Tôi có thể giúp bạn:\n\n🍹 Tư vấn menu và sản phẩm\n💰 Báo giá chi tiết\n🏆 Gợi ý món bán chạy\n🎉 Thông tin khuyến mãi\n🚚 Hướng dẫn đặt hàng\n\nBạn cần hỗ trợ gì ạ? 😊';
    }
    // Hỏi về trà sữa - dùng database thực tế
    if (msg.includes('trà sữa') || msg.includes('tra sua') || msg.includes('milk tea')) {
        if (products.length > 0) {
            const milkTeaProducts = products.filter(p => 
                p.name.toLowerCase().includes('trà sữa') || 
                p.category.toLowerCase().includes('trà sữa') ||
                p.category.toLowerCase().includes('milk tea')
            ).slice(0, 5);
            
            if (milkTeaProducts.length > 0) {
                let response = '🍵 **Menu trà sữa YOLOBrew:**\n\n';
                milkTeaProducts.forEach(product => {
                    response += `• ${product.name} - ${product.price?.toLocaleString()}đ\n`;
                });
                // Không có khuyến mãi mặc định
                
                // Chỉ thêm hướng dẫn đặt hàng khi khách đã chốt
                if (isOrdering) {
                    response += '\n\n🛒 **ĐẶT HÀNG NGAY:**\n';
                    response += '• 🌐 Đăng ký tài khoản trên website\n';
                    response += '• 📞 Gọi hotline: 0123-456-789\n';
                    response += '• 🏪 Ghé trực tiếp cửa hàng 😊';
                } else {
                    response += '\n\nBạn muốn thử món nào không? 😊';
                }
                return response;
            }
        }
        return '🍵 Chúng tôi có nhiều loại trà sữa ngon! Bạn có thể xem menu đầy đủ hoặc liên hệ 0123-456-789 để được tư vấn chi tiết! 😊';
    }
    
    // Menu - dùng database thực tế
    if (msg.includes('menu') || msg.includes('món')) {
        if (products.length > 0) {
            let response = '📋 **MENU YOLOBREW:**\n\n';
            const categories = [...new Set(products.map(p => p.category))];
            categories.slice(0, 4).forEach(category => {
                const items = products.filter(p => p.category === category).slice(0, 3);
                response += `🍹 **${category}:**\n`;
                items.forEach(item => {
                    response += `• ${item.name} - ${item.price?.toLocaleString()}đ\n`;
                });
                response += '\n';
            });
            // Không có khuyến mãi mặc định
            
            // Chỉ thêm hướng dẫn đặt hàng khi khách đã chốt
            if (isOrdering) {
                response += '\n\n🛒 **ĐẶT HÀNG NGAY:**\n';
                response += '• 🌐 Đăng ký tài khoản trên website\n';
                response += '• 📞 Gọi hotline: 0123-456-789\n';
                response += '• 🏪 Ghé trực tiếp cửa hàng 😊';
            } else {
                response += '\n\nBạn muốn biết chi tiết món nào không? 😊';
            }
            return response;
        }
        return '📋 Chúng tôi có menu đa dạng! Liên hệ 0123-456-789 để được tư vấn chi tiết! 😊';
    }
    
    // Sản phẩm bán chạy - dùng database thực tế
    if (msg.includes('bán chạy') || msg.includes('phổ biến') || msg.includes('hot')) {
        if (bestSellers.length > 0) {
            let response = '🏆 **TOP SẢN PHẨM BÁN CHẠY:**\n\n';
            bestSellers.slice(0, 5).forEach((item, index) => {
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🏅';
                response += `${medal} ${item.productName} - Đã bán ${item.totalQuantity} ly\n`;
            });
            response += '\n✨ Những món này được khách hàng yêu thích nhất!';
            
            // Chỉ thêm hướng dẫn đặt hàng khi khách đã chốt
            if (isOrdering) {
                response += '\n\n🛒 **ĐẶT HÀNG NGAY:**\n';
                response += '• 🌐 Đăng ký tài khoản trên website\n';
                response += '• 📞 Gọi hotline: 0123-456-789\n';
                response += '• 🏪 Ghé trực tiếp cửa hàng 😊';
            } else {
                response += '\n\nBạn có muốn thử món nào không? 😊';
            }
            return response;
        }
        return '🏆 Sản phẩm bán chạy: Trà sữa trân châu, Cà phê sữa đá, Sinh tố bơ!\n📞 **Đặt hàng:** 0123-456-789 😊';
    }
    
    // Giá cả
    if (msg.includes('giá') || msg.includes('bao nhiêu') || msg.includes('tiền')) {
        return '💰 **BẢNG GIÁ YOLOBREW:**\n\n🍹 Đồ uống: 25,000đ - 65,000đ\n🧋 Topping: 5,000đ - 10,000đ\n🚚 Giao hàng: MIỄN PHÍ (bán kính 3km)\n\nBạn muốn biết giá món cụ thể nào không? 😊';
    }
    
    // Vouchers/Mã giảm giá
    if (msg.includes('voucher') || msg.includes('mã giảm giá') || msg.includes('khuyến mãi') || msg.includes('giảm giá') || msg.includes('ưu đãi')) {
        if (vouchers.length > 0) {
            let response = '🎉 **MÃ GIẢM GIÁ HIỆN TẠI:**\n\n';
            vouchers.forEach(voucher => {
                response += `🎫 **${voucher.code}**\n`;
                response += `📝 ${voucher.description}\n`;
                
                if (voucher.discountType === 'percentage') {
                    response += `💰 Giảm ${voucher.discountValue}%\n`;
                } else if (voucher.discountType === 'special_day_fixed_price') {
                    response += `💰 Đồng giá ${voucher.fixedPrice?.toLocaleString()}đ\n`;
                }
                
                if (voucher.applicableCategory) {
                    response += `🏷️ Áp dụng: ${voucher.applicableCategory}\n`;
                }
                
                if (voucher.startTime && voucher.endTime) {
                    response += `⏰ Thời gian: ${voucher.startTime}h - ${voucher.endTime}h\n`;
                }
                
                if (voucher.specialDay !== null) {
                    const days = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
                    response += `📅 Ngày áp dụng: ${days[voucher.specialDay]}\n`;
                }
                
                response += '\n';
            });
            response += '✨ Nhập mã khi đặt hàng để được giảm giá!';
            
            if (isOrdering) {
                response += '\n\n🛒 **ĐẶT HÀNG NGAY:**\n';
                response += '• 🌐 Đăng ký tài khoản trên website\n';
                response += '• 📞 Gọi hotline: 0123-456-789\n';
                response += '• 🏪 Ghé trực tiếp cửa hàng 😊';
            }
            return response;
        }
        return '🎉 Chúng tôi thường xuyên có các chương trình khuyến mãi hấp dẫn! Liên hệ 0123-456-789 để biết thêm chi tiết! 😊';
    }
    
    // Đặt hàng
    if (msg.includes('đặt hàng') || msg.includes('order') || msg.includes('mua')) {
        return '🛒 **CÁCH ĐẶT HÀNG TẠI YOLOBREW:**\n\n1️⃣ Chọn món yêu thích từ menu\n2️⃣ Thêm vào giỏ hàng\n3️⃣ Điền thông tin giao hàng\n4️⃣ Chọn phương thức thanh toán\n5️⃣ Xác nhận đơn hàng\n\n📞 **Hotline hỗ trợ:** 0123-456-789\n🚚 **Giao hàng:** 15-30 phút\n💳 **Thanh toán:** Tiền mặt, chuyển khoản, ví điện tử\n\nBạn cần hỗ trợ thêm gì không? 😊';
    }
    
    return '🤔 Tôi hiểu bạn đang quan tâm đến YOLOBrew! \n\n✨ **Tôi có thể giúp bạn:**\n🍹 Tư vấn menu và sản phẩm\n💰 Báo giá chi tiết\n🏆 Gợi ý món bán chạy\n🎉 Thông tin khuyến mãi\n🛒 Hướng dẫn đặt hàng\n\nHãy cho tôi biết bạn muốn tìm hiểu về gì nhé! 😊';
}


router.post('/', async (req, res) => {
    const { message } = req.body;
    if (!message) {
        return res.status(400).json({ error: 'Vui lòng nhập câu hỏi.' });
    }
    
    try {
        // Lấy danh sách sản phẩm từ database
        const products = await Product.find({}).select('name description price category sizes').lean();
        console.log(`📦 Tìm thấy ${products.length} sản phẩm trong database`);
        
        // Lấy sản phẩm bán chạy từ đơn hàng
        const bestSellers = await Order.aggregate([
            { $match: { status: 'completed' } },
            { $unwind: '$items' },
            { 
                $group: {
                    _id: '$items.product',
                    totalQuantity: { $sum: '$items.quantity' }
                }
            },
            {
                $lookup: {
                    from: 'products',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'productInfo'
                }
            },
            { $unwind: '$productInfo' },
            {
                $project: {
                    productName: '$productInfo.name',
                    totalQuantity: 1
                }
            },
            { $sort: { totalQuantity: -1 } },
            { $limit: 10 }
        ]);
        console.log(`🏆 Tìm thấy ${bestSellers.length} sản phẩm bán chạy`);
        
        // Lấy vouchers đang hoạt động
        const vouchers = await Voucher.find({ isActive: true }).lean();
        console.log(`🎫 Tìm thấy ${vouchers.length} vouchers đang hoạt động`);
        
        // Gọi Gemini AI
        const reply = await callGeminiAI(message, products, bestSellers, vouchers);
        
        res.json({ reply });
        
    } catch (err) {
        console.error('Lỗi chatbot:', err);
        res.status(500).json({ 
            error: 'Xin lỗi, tôi gặp sự cố kỹ thuật. Vui lòng thử lại sau!',
            details: err.message 
        });
    }
});

module.exports = router;
