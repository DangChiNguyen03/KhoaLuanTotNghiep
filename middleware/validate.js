const validateProduct = (req, res, next) => {
    const { name, description, price, category } = req.body;
    const errors = [];

    if (!name) errors.push('Tên sản phẩm là bắt buộc');
    if (!description) errors.push('Mô tả sản phẩm là bắt buộc');
    if (!price) errors.push('Giá sản phẩm là bắt buộc');
    if (!category) errors.push('Danh mục sản phẩm là bắt buộc');

    if (errors.length > 0) {
        return res.status(400).json({ errors });
    }
    next();
};

module.exports = {
    validateProduct
};
