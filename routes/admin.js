const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Product = require('../models/Product');
const { isAdmin } = require('../middleware/auth');
const { validateProduct } = require('../middleware/validate');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'public/images/products';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|gif/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);
        if (extname && mimetype) {
            return cb(null, true);
        }
        cb(new Error('Chỉ chấp nhận file ảnh!'));
    }
});

router.get('/products', isAdmin, async (req, res) => {
    try {
        const products = await Product.find();
        const toppings = await Product.find({ category: 'Topping' }).select('name');
        const toppingList = toppings.map(t => t.name);
        res.render('admin/products', { products, toppings: toppingList });
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Lỗi server khi tải danh sách sản phẩm');
        res.redirect('/admin/products');
    }
});

router.post('/products', isAdmin, upload.single('image'), validateProduct, async (req, res) => {
    try {
        let { name, description, price, category, toppings } = req.body;
        const image = req.file ? '/images/products/' + req.file.filename : '';

        toppings = category === 'Topping' ? [] : (toppings ? (Array.isArray(toppings) ? toppings : [toppings]) : []);

        const validCategories = ['Trà sữa', 'Trà trái cây', 'Đá xay', 'Topping', 'Cà phê']; // Thay "Trà truyền thống" bằng "Cà phê"
        if (!validCategories.includes(category)) {
            throw new Error(`Danh mục '${category}' không hợp lệ. Chọn: ${validCategories.join(', ')}`);
        }

        const product = new Product({
            name,
            description,
            price: parseInt(price),
            category,
            toppings,
            image
        });

        await product.save();
        res.status(201).json({ message: 'Thêm sản phẩm thành công' });
    } catch (err) {
        console.error('Lỗi khi thêm sản phẩm:', err);
        res.status(500).json({ message: err.message || 'Lỗi server khi thêm sản phẩm' });
    }
});

router.get('/products/:id', isAdmin, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
        }
        res.json(product);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Lỗi server khi lấy thông tin sản phẩm' });
    }
});

router.put('/products/:id', isAdmin, upload.single('image'), validateProduct, async (req, res) => {
    try {
        let { name, description, price, category, toppings } = req.body;
        const updateData = { 
            name, 
            description, 
            price: parseInt(price),
            category,
            toppings: toppings ? (Array.isArray(toppings) ? toppings : [toppings]) : []
        };

        if (req.file) {
            updateData.image = '/images/products/' + req.file.filename;
            const product = await Product.findById(req.params.id);
            if (product && product.image) {
                const oldImagePath = path.join('public', product.image);
                if (fs.existsSync(oldImagePath)) {
                    fs.unlinkSync(oldImagePath);
                }
            }
        }

        const product = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true });
        if (!product) {
            return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
        }
        res.status(200).json({ message: 'Cập nhật sản phẩm thành công' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: err.message || 'Lỗi server khi cập nhật sản phẩm' });
    }
});

router.delete('/products/:id', isAdmin, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
        }

        if (product.image) {
            const imagePath = path.join('public', product.image);
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
        }

        await Product.deleteOne({ _id: req.params.id });
        res.status(200).json({ message: 'Xóa sản phẩm thành công' });
    } catch (err) {
        console.error('Lỗi khi xóa sản phẩm:', err);
        res.status(500).json({ message: 'Lỗi server khi xóa sản phẩm' });
    }
});

module.exports = router;