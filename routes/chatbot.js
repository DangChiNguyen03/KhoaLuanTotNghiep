const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');

// Đổi thành API demo/public nếu bạn có, ở đây dùng endpoint mẫu của OpenAI
// Sử dụng OpenRouter API thay cho OpenAI
const OPENAI_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Debug: In ra API key khi route được gọi (chỉ in 10 ký tự đầu)
console.log('OPENAI_API_KEY loaded:', OPENAI_API_KEY ? OPENAI_API_KEY.substring(0, 10) + '...' : 'NOT FOUND');
console.log('ENV DEBUG:', process.env);

const Product = require('../models/Product');

router.post('/', async (req, res) => {
    const { message } = req.body;
    if (!message) {
        return res.status(400).json({ error: 'Vui lòng nhập câu hỏi.' });
    }
    try {
        // Lấy danh sách sản phẩm từ database (phải đặt ở đây)
        const products = await Product.find({ isAvailable: true }).select('name description price category').lean();
        // Hàm làm sạch ký tự markdown/thừa
        function cleanText(text) {
            return text.replace(/[\*_`~]/g, '').trim();
        }
        let menuString = 'Danh sách món của quán (hãy trả lời thân thiện, tự nhiên, không cần lặp lại format menu):\n';
        products.forEach((p) => {
            menuString += `- ${cleanText(p.name)} (${cleanText(p.category)}): ${p.price} VND. Mô tả: ${cleanText(p.description)}\n`;
        });

        const response = await fetch(OPENAI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'HTTP-Referer': 'https://yourdomain.com',
                'X-Title': 'BubbleTeaShopAI'
            },
            body: JSON.stringify({
                model: 'openrouter/auto',
                messages: [
                    { role: 'system', content: menuString },
                    { role: 'user', content: message }
                ],
                max_tokens: 400,
                temperature: 0.7
            })
        });
        const data = await response.json();
        if (!response.ok) {
            console.error('OpenAI API error:', data);
            return res.status(500).json({ error: 'OpenAI API lỗi', details: data });
        }
        if (data.choices && data.choices[0]) {
            res.json({ reply: data.choices[0].message.content });
        } else {
            console.error('OpenAI API không trả về choices:', data);
            res.status(500).json({ error: 'Không nhận được phản hồi từ AI.', details: data });
        }
    } catch (err) {
        console.error('Lỗi khi gọi OpenAI:', err);
        res.status(500).json({ error: 'Lỗi khi gọi API OpenAI.', details: err.message });
    }
});

module.exports = router;
