const validateProduct = (req, res, next) => {
    const { name, description, price, category, sizePriceS, sizePriceM, sizePriceL } = req.body;
    const errors = [];

    if (!name) errors.push('Tên sản phẩm là bắt buộc');
    if (!description) errors.push('Mô tả sản phẩm là bắt buộc');
    if (!category) errors.push('Danh mục sản phẩm là bắt buộc');

    // Validation giá dựa trên danh mục
    if (category === 'Topping') {
        // Sản phẩm Topping cần có giá đơn
        if (!price) errors.push('Giá sản phẩm topping là bắt buộc');
    } else {
        // Sản phẩm khác cần có ít nhất một giá theo size
        if (!sizePriceS && !sizePriceM && !sizePriceL) {
            errors.push('Cần có ít nhất một giá cho size S, M hoặc L');
        }
    }

    if (errors.length > 0) {
        return res.status(400).json({ errors });
    }
    next();
};

module.exports = {
    validateProduct
};
