const express = require('express');
const router = express.Router();
const Product = require('../models/Product');

// Get all products
router.get('/', async (req, res) => {
    try {
        let query = {};
        let sort = {};

        // Filter by category
        if (req.query.category && req.query.category !== 'all') {
            query.category = req.query.category;
        }

        // Filter by availability
        if (req.query.available) {
            query.isAvailable = req.query.available === 'true';
        }

        // Search by name
        if (req.query.search) {
            query.name = { $regex: req.query.search, $options: 'i' };
        }

        // Sort
        if (req.query.sort) {
            switch (req.query.sort) {
                case 'price_asc':
                    sort.price = 1;
                    break;
                case 'price_desc':
                    sort.price = -1;
                    break;
                case 'name_asc':
                    sort.name = 1;
                    break;
                case 'name_desc':
                    sort.name = -1;
                    break;
                default:
                    sort.createdAt = -1;
            }
        } else {
            sort.createdAt = -1; // Default sort by newest
        }

        const products = await Product.find(query).sort(sort);
        const categories = await Product.distinct('category');
        const toppings = await Product.find({ category: 'Topping' }).select('name');
        const toppingList = toppings.map(t => t.name);

        res.render('products', {
            user: req.user,
            products,
            categories,
            toppings: toppingList, // Truyền danh sách topping vào view
            currentCategory: req.query.category || 'all',
            currentSort: req.query.sort || 'newest',
            searchTerm: req.query.search || ''
        });
    } catch (err) {
        console.error('Products page error:', err);
        req.flash('error_msg', 'Có lỗi khi tải danh sách sản phẩm');
        res.redirect('/');
    }
});

// Get product detail
router.get('/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
        }
        res.json(product); // Trả về JSON cho modal trong views/products.hbs
    } catch (err) {
        console.error('Product detail error:', err);
        res.status(500).json({ message: 'Có lỗi khi tải thông tin sản phẩm' });
    }
});

module.exports = router;