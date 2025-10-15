const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Product = require("../models/Product");
const User = require("../models/User");
const Order = require("../models/Order");
const Payment = require("../models/Payment");
const { isAuthenticated } = require("../middleware/auth");
const Voucher = require('../models/Voucher');

// Xem giỏ hàng
router.get("/", isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate("cart.product");
    if (!user) {
      req.flash("error_msg", "Không tìm thấy người dùng");
      return res.redirect("/");
    }


    const cartItems = await Promise.all(
      user.cart.map(async (item) => {
        const validToppingIds = item.toppings.filter((t) =>
          mongoose.Types.ObjectId.isValid(t)
        );
        let toppingDetails = [];
        if (validToppingIds.length > 0) {
          toppingDetails = await Product.find({
            _id: { $in: validToppingIds },
            category: "Topping",
          }).select("name price sizes");

          // Đảm bảo mỗi topping có giá hiển thị đúng
          toppingDetails = toppingDetails.map((topping) => ({
            ...topping.toObject(),
            price:
              topping.price ||
              (topping.sizes && topping.sizes[0] ? topping.sizes[0].price : 0),
          }));
        }

        return {
          ...item.toObject(),
          toppingDetails: toppingDetails,
        };
      })
    );

    let totalPrice = 0;
    for (const item of cartItems) {
      if (item.product) {
        // Tính giá sản phẩm chính - luôn lấy giá mới nhất từ database
        let itemTotal = 0;
        if (item.product.category === "Topping") {
          // Topping: lấy từ price hoặc sizes[0].price
          itemTotal =
            item.product.price ||
            (item.product.sizes && item.product.sizes[0]
              ? item.product.sizes[0].price
              : 0);
        } else {
          // Sản phẩm thường: lấy giá theo size đã chọn
          if (
            item.product.sizes &&
            Array.isArray(item.product.sizes) &&
            item.size
          ) {
            const sizeObj = item.product.sizes.find(
              (s) => s.size === item.size
            );
            itemTotal = sizeObj ? sizeObj.price : 0;
          } else {
            itemTotal = item.product.price || 0;
          }
        }

        // Tính giá topping dựa trên giá thực tế
        let toppingTotal = 0;
        if (item.toppingDetails && item.toppingDetails.length > 0) {
          toppingTotal = item.toppingDetails.reduce((sum, topping) => {
            const toppingPrice =
              topping.price ||
              (topping.sizes && topping.sizes[0] ? topping.sizes[0].price : 0);
            return sum + toppingPrice;
          }, 0);
        }

        itemTotal += toppingTotal;
        itemTotal *= item.quantity;
        totalPrice += itemTotal;
      }
    }

    res.render("cart", {
      cart: cartItems,
      totalPrice: totalPrice,
    });
  } catch (err) {
    console.error("Error fetching cart:", err);
    req.flash("error_msg", "Có lỗi xảy ra khi tải giỏ hàng");
    res.redirect("/");
  }
});

// Thêm vào giỏ hàng
router.post("/add", isAuthenticated, async (req, res) => {
  try {
    const {
      productId,
      quantity = 1,
      toppings = [],
      sugarLevel,
      iceLevel,
      size,
    } = req.body;


    if (!productId) {
      return res.status(400).json({ message: "Thiếu productId" });
    }

    const qty = parseInt(quantity);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ message: "Số lượng không hợp lệ" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Không tìm thấy sản phẩm" });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }

    const toppingProducts = await Product.find({
      name: { $in: toppings },
      category: "Topping",
    }).select("_id");
    const toppingIds = toppingProducts.map((t) => t._id);

    // Lấy giá đúng theo size
    let price = 0;
    if (product.sizes && Array.isArray(product.sizes)) {
      const sizeObj = product.sizes.find((s) => s.size === size);
      if (sizeObj) price = sizeObj.price;
    }
    const cartItemIndex = user.cart.findIndex(
      (item) =>
        item.product.toString() === productId &&
        JSON.stringify(item.toppings.sort()) ===
          JSON.stringify(toppingIds.sort()) &&
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
        price: price,
      });
    }

    // Sử dụng updateOne để tránh validation issues với admin accounts
    await User.updateOne({ _id: user._id }, { $set: { cart: user.cart } });

    res.json({ message: "Thêm vào giỏ hàng thành công", cart: user.cart });
  } catch (err) {
    console.error("Error adding to cart:", err);
    res.status(500).json({ message: "Có lỗi xảy ra khi thêm vào giỏ hàng" });
  }
});

// Cập nhật số lượng
router.put("/update/:itemId", isAuthenticated, async (req, res) => {
  try {
    const { quantity } = req.body;


    const qty = parseInt(quantity);
    if (!quantity || isNaN(qty) || qty <= 0) {
      return res.status(400).json({ message: "Số lượng không hợp lệ" });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }

    const cartItem = user.cart.id(req.params.itemId);
    if (!cartItem) {
      return res
        .status(404)
        .json({ message: "Không tìm thấy sản phẩm trong giỏ hàng" });
    }

    cartItem.quantity = qty;
    await user.save();

    res.json({ message: "Cập nhật giỏ hàng thành công", cart: user.cart });
  } catch (err) {
    console.error("Error updating cart:", err);
    res.status(500).json({ message: "Có lỗi xảy ra" });
  }
});

// Xóa sản phẩm
router.delete("/remove/:itemId", isAuthenticated, async (req, res) => {
  try {

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }

    user.cart.pull({ _id: req.params.itemId });
    await user.save();

    res.json({
      message: "Xóa sản phẩm khỏi giỏ hàng thành công",
      cart: user.cart,
    });
  } catch (err) {
    console.error("Error removing from cart:", err);
    res.status(500).json({ message: "Có lỗi xảy ra" });
  }
});

// Xóa topping
router.delete(
  "/remove-topping/:itemId/:toppingId",
  isAuthenticated,
  async (req, res) => {
    try {
      const { itemId, toppingId } = req.params;

      const user = await User.findById(req.user._id);
      if (!user) {
        return res.status(404).json({ message: "Không tìm thấy người dùng" });
      }

      const cartItem = user.cart.id(itemId);
      if (!cartItem) {
        return res
          .status(404)
          .json({ message: "Không tìm thấy sản phẩm trong giỏ hàng" });
      }

      cartItem.toppings = cartItem.toppings.filter(
        (t) => t.toString() !== toppingId
      );
      await user.save();

      res.json({ message: "Xóa topping thành công", cart: user.cart });
    } catch (err) {
      console.error("Error removing topping from cart:", err);
      res.status(500).json({ message: "Có lỗi xảy ra khi xóa topping" });
    }
  }
);

// Trang thanh toán
router.get("/checkout", isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate("cart.product");
    if (!user || !user.cart.length) {
      req.flash("error_msg", "Giỏ hàng trống, không thể thanh toán");
      return res.redirect("/cart");
    }

    const cartItems = await Promise.all(
      user.cart.map(async (item) => {
        const validToppingIds = item.toppings.filter((t) =>
          mongoose.Types.ObjectId.isValid(t)
        );
        let toppingDetails = [];
        if (validToppingIds.length > 0) {
          toppingDetails = await Product.find({
            _id: { $in: validToppingIds },
            category: "Topping",
          }).select("name price sizes");
        }

        return {
          ...item.toObject(),
          toppingDetails: toppingDetails,
        };
      })
    );

    let totalPrice = 0;
    for (const item of cartItems) {
      if (item.product) {
        // Tính giá sản phẩm chính - luôn lấy giá mới nhất từ database
        let itemTotal = 0;
        if (item.product.category === "Topping") {
          // Topping: lấy từ price hoặc sizes[0].price
          itemTotal =
            item.product.price ||
            (item.product.sizes && item.product.sizes[0]
              ? item.product.sizes[0].price
              : 0);
        } else {
          // Sản phẩm thường: lấy giá theo size đã chọn
          if (
            item.product.sizes &&
            Array.isArray(item.product.sizes) &&
            item.size
          ) {
            const sizeObj = item.product.sizes.find(
              (s) => s.size === item.size
            );
            itemTotal = sizeObj ? sizeObj.price : 0;
          } else {
            itemTotal = item.product.price || 0;
          }
        }

        // Tính giá topping dựa trên giá thực tế
        let toppingTotal = 0;
        if (item.toppingDetails && item.toppingDetails.length > 0) {
          toppingTotal = item.toppingDetails.reduce((sum, topping) => {
            const toppingPrice =
              topping.price ||
              (topping.sizes && topping.sizes[0] ? topping.sizes[0].price : 0);
            return sum + toppingPrice;
          }, 0);
        }

        itemTotal += toppingTotal;
        itemTotal *= item.quantity;
        totalPrice += itemTotal;
      }
    }

    let finalPrice = totalPrice;
    let discountAmount = 0;
    let appliedVoucher = null;

    if (req.session.voucher) {
      const voucher = await Voucher.findOne({
        code: req.session.voucher.code,
        isActive: true,
      });
      if (voucher) {
        const vietnamTime = new Date(
          new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" })
        );
        const currentDay = vietnamTime.getDay();
        const currentHour = vietnamTime.getHours();
        let isVoucherApplicable = false;

        // Check Happy Hour condition first
        if (voucher.startTime !== null && voucher.endTime !== null) {
          if (currentHour >= voucher.startTime && currentHour < voucher.endTime) {
            isVoucherApplicable = true;
          }
        }

        // Check Special Day condition
        if (voucher.discountType === "special_day_fixed_price") {
          if (voucher.specialDay === currentDay) {
            let itemsToDiscountCount = 0;
            for (const item of cartItems) {
              if (
                item.product.category === voucher.applicableCategory &&
                item.size === voucher.applicableSize
              ) {
                itemsToDiscountCount++;
                const originalItemPrice = item.product.sizes.find(
                  (s) => s.size === item.size
                ).price;
                discountAmount += (originalItemPrice - voucher.fixedPrice) * item.quantity;
              }
            }
            if (itemsToDiscountCount > 0) isVoucherApplicable = true;
          }
        } else {
          // Percentage or Fixed Amount
          let applicableTotal = 0;
          for (const item of cartItems) {
            if (
              !voucher.applicableCategory ||
              item.product.category === voucher.applicableCategory
            ) {
              const sizeInfo = item.product.sizes.find((s) => s.size === item.size);
              if (sizeInfo) {
                applicableTotal += sizeInfo.price * item.quantity;
              }
            }
          }
          if (applicableTotal > 0) {
            if (voucher.discountType === "percentage") {
              discountAmount = applicableTotal * (voucher.discountValue / 100);
            } else if (voucher.discountType === "fixed_amount") {
              discountAmount = voucher.discountValue;
            }
            isVoucherApplicable = true;
          }
        }

        if (isVoucherApplicable) {
          finalPrice = totalPrice - discountAmount;
          appliedVoucher = voucher.code;
        } else {
          // Voucher exists but conditions not met, so we remove it
          delete req.session.voucher;
        }
      }
    }

    res.render("checkout", {
      cart: cartItems,
      originalPrice: totalPrice,
      finalPrice: finalPrice,
      discountAmount: discountAmount,
      appliedVoucher: appliedVoucher,
      user: user.toObject(),
    });
  } catch (err) {
    console.error("Error loading checkout:", err);
    req.flash("error_msg", "Có lỗi xảy ra khi tải trang thanh toán");
    res.redirect("/cart");
  }
});

// Xử lý thanh toán
router.post("/checkout", isAuthenticated, async (req, res) => {
  try {
    const { paymentMethod, cashAmount } = req.body;
    const user = await User.findById(req.user._id).populate("cart.product");
    if (!user || !user.cart.length) {
      req.flash("error_msg", "Giỏ hàng trống, không thể thanh toán");
      return res.redirect("/cart");
    }

    const cartItems = await Promise.all(
      user.cart.map(async (item) => {
        const validToppingIds = item.toppings.filter((t) =>
          mongoose.Types.ObjectId.isValid(t)
        );
        let toppingDetails = [];
        if (validToppingIds.length > 0) {
          toppingDetails = await Product.find({
            _id: { $in: validToppingIds },
            category: "Topping",
          }).select("name price sizes");
        }
        return {
          ...item.toObject(),
          toppingDetails: toppingDetails,
        };
      })
    );

    let totalPrice = 0;
    const orderItems = [];

    for (const item of cartItems) {
      if (item.product) {
        let productPrice = 0;
        if (item.product.category === "Topping") {
          productPrice =
            item.product.price ||
            (item.product.sizes && item.product.sizes[0]
              ? item.product.sizes[0].price
              : 0);
        } else {
          const sizeObj = item.product.sizes.find((s) => s.size === item.size);
          if (sizeObj) {
            productPrice = sizeObj.price;
          } else {
            console.warn(
              `Sản phẩm ${item.product.name} không có giá cho size ${item.size}`
            );
          }
        }

        let toppingPrice = 0;
        if (item.toppingDetails && item.toppingDetails.length > 0) {
          toppingPrice = item.toppingDetails.reduce((sum, topping) => {
            // Consistent topping price calculation
            let tPrice = topping.price || 
                        (topping.sizes && topping.sizes[0] ? topping.sizes[0].price : 0);
            return sum + tPrice;
          }, 0);
        }

        const singleItemPrice = productPrice + toppingPrice;
        totalPrice += singleItemPrice * item.quantity;


        orderItems.push({
          product: item.product._id,
          quantity: item.quantity,
          price: singleItemPrice, // Lưu giá của 1 sản phẩm (đã bao gồm topping)
          toppings: item.toppings,
          sugarLevel: item.sugarLevel,
          iceLevel: item.iceLevel,
          size: item.size,
        });
      }
    }

    // Kiểm tra phương thức thanh toán
    if (!["cash", "bank"].includes(paymentMethod)) {
      req.flash("error_msg", "Phương thức thanh toán không hợp lệ");
      return res.redirect("/cart/checkout");
    }

    if (paymentMethod === "cash") {
      const cash = parseInt(cashAmount);
      if (isNaN(cash) || cash < totalPrice) {
        req.flash("error_msg", "Số tiền khách đưa không đủ");
        return res.redirect("/cart/checkout");
      }
    }

    // Kiểm tra và áp dụng voucher từ session - LOGIC ĐỒNG BỘ VỚI TRANG CHECKOUT
    let finalPrice = totalPrice;
    let discountAmount = 0;
    let voucherInfo = {};

    if (req.session.voucher) {
        const voucher = await Voucher.findOne({ code: req.session.voucher.code, isActive: true });
        if (voucher) {
            const vietnamTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
            const currentDay = vietnamTime.getDay();
            const currentHour = vietnamTime.getHours();
            let isVoucherApplicable = false;

            // Logic for Special Day
            if (voucher.discountType === 'special_day_fixed_price') {
                if (voucher.specialDay === currentDay) {
                    for (const item of cartItems) { // cartItems has populated product info
                        if (item.product.category === voucher.applicableCategory && item.size === voucher.applicableSize) {
                            const originalItemPrice = item.product.sizes.find(s => s.size === item.size).price;
                            discountAmount += (originalItemPrice - voucher.fixedPrice) * item.quantity;
                            isVoucherApplicable = true;
                        }
                    }
                }
            } else { // Logic for Percentage / Fixed Amount
                let applicableTotal = 0;
                for (const item of cartItems) {
                    if (!voucher.applicableCategory || item.product.category === voucher.applicableCategory) {
                        const sizeInfo = item.product.sizes.find(s => s.size === item.size);
                        if (sizeInfo) {
                            applicableTotal += sizeInfo.price * item.quantity;
                        }
                    }
                }
                if (applicableTotal > 0) {
                    if (voucher.discountType === 'percentage') {
                        discountAmount = applicableTotal * (voucher.discountValue / 100);
                    } else if (voucher.discountType === 'fixed_amount') {
                        discountAmount = voucher.discountValue;
                    }
                    isVoucherApplicable = true;
                }
            }

            if (isVoucherApplicable) {
                finalPrice = totalPrice - discountAmount;
                voucherInfo = { code: voucher.code, discountAmount: discountAmount };
                delete req.session.voucher; // Clear voucher after use
            }
        }
    }


    // Lưu đơn hàng vào MongoDB
    const order = new Order({
      user: user._id,
      items: orderItems, // Sử dụng mảng đã có giá
      totalPrice: finalPrice, // Sử dụng giá cuối cùng đã giảm
      originalPrice: totalPrice, // Lưu giá gốc
      voucher: voucherInfo, // Lưu thông tin voucher
      paymentMethod: paymentMethod,
      status: "pending",
      paymentStatus: paymentMethod === "cash" ? "paid" : "pending",
    });
    await order.save();

    // Tạo Payment record
    const payment = new Payment({
      order: order._id,
      user: user._id,
      amount: finalPrice, // Use the final, discounted price for the payment record
      paymentMethod: paymentMethod,
      status: "paid", // Sử dụng enum value đúng từ Payment model
      paidAt: new Date(),
    });
    await payment.save();

    // Cập nhật Order với Payment reference
    order.payment = payment._id;
    await order.save();

    // Xóa giỏ hàng sau khi thanh toán - sử dụng updateOne để tránh validation
    await User.updateOne({ _id: user._id }, { $set: { cart: [] } });

    req.flash("success_msg", "Thanh toán thành công! Cảm ơn bạn đã mua hàng.");
    res.redirect("/");
  } catch (err) {
    console.error("Error processing checkout:", err);
    req.flash("error_msg", "Có lỗi xảy ra khi xử lý thanh toán");
    res.redirect("/cart/checkout");
  }
});

// Get available vouchers for current cart
router.get('/available-vouchers', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).populate('cart.product');
        
        if (!user || !user.cart.length) {
            return res.json({ vouchers: [] });
        }

        // Get all active vouchers
        const allVouchers = await Voucher.find({ isActive: true });
        
        const vietnamTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
        const currentDay = vietnamTime.getDay();
        const currentHour = vietnamTime.getHours();
        
        const availableVouchers = [];
        
        for (const voucher of allVouchers) {
            let isApplicable = false;
            let reason = '';
            let applicableItems = 0;
            
            // Check time conditions (Happy Hour)
            if (voucher.startTime !== null && voucher.endTime !== null) {
                if (currentHour < voucher.startTime || currentHour >= voucher.endTime) {
                    reason = `Chỉ có hiệu lực từ ${voucher.startTime}h đến ${voucher.endTime}h`;
                } else {
                    isApplicable = true;
                }
            } else {
                isApplicable = true;
            }
            
            // Check special day conditions
            if (voucher.discountType === 'special_day_fixed_price') {
                if (voucher.specialDay !== currentDay) {
                    const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
                    reason = `Chỉ có hiệu lực vào ${days[voucher.specialDay]}`;
                    isApplicable = false;
                } else {
                    // Check if cart has applicable items
                    for (const item of user.cart) {
                        if (item.product.category === voucher.applicableCategory && 
                            item.size === voucher.applicableSize) {
                            applicableItems++;
                        }
                    }
                    if (applicableItems === 0) {
                        reason = `Cần có sản phẩm '${voucher.applicableCategory}' size '${voucher.applicableSize}'`;
                        isApplicable = false;
                    }
                }
            } else {
                // Check category conditions for percentage/fixed amount vouchers
                if (voucher.applicableCategory) {
                    for (const item of user.cart) {
                        if (item.product.category === voucher.applicableCategory) {
                            applicableItems++;
                        }
                    }
                    if (applicableItems === 0) {
                        reason = `Không có sản phẩm '${voucher.applicableCategory}' trong giỏ hàng`;
                        isApplicable = false;
                    }
                } else {
                    applicableItems = user.cart.length;
                }
            }
            
            // Calculate potential discount
            let potentialDiscount = 0;
            if (isApplicable) {
                if (voucher.discountType === 'special_day_fixed_price') {
                    for (const item of user.cart) {
                        if (item.product.category === voucher.applicableCategory && 
                            item.size === voucher.applicableSize) {
                            const originalPrice = item.product.sizes.find(s => s.size === item.size)?.price || 0;
                            potentialDiscount += (originalPrice - voucher.fixedPrice) * item.quantity;
                        }
                    }
                } else {
                    let applicableTotal = 0;
                    for (const item of user.cart) {
                        if (!voucher.applicableCategory || item.product.category === voucher.applicableCategory) {
                            const sizePrice = item.product.sizes?.find(s => s.size === item.size)?.price || 0;
                            applicableTotal += sizePrice * item.quantity;
                        }
                    }
                    
                    if (voucher.discountType === 'percentage') {
                        potentialDiscount = applicableTotal * (voucher.discountValue / 100);
                    } else if (voucher.discountType === 'fixed_amount') {
                        potentialDiscount = voucher.discountValue;
                    }
                }
            }
            
            availableVouchers.push({
                code: voucher.code,
                description: voucher.description,
                discountType: voucher.discountType,
                discountValue: voucher.discountValue,
                applicableCategory: voucher.applicableCategory,
                startTime: voucher.startTime,
                endTime: voucher.endTime,
                specialDay: voucher.specialDay,
                applicableSize: voucher.applicableSize,
                fixedPrice: voucher.fixedPrice,
                isApplicable,
                reason,
                applicableItems,
                potentialDiscount: Math.round(potentialDiscount)
            });
        }
        
        res.json({ vouchers: availableVouchers });
        
    } catch (err) {
        console.error('Error fetching available vouchers:', err);
        res.status(500).json({ message: 'Lỗi server khi lấy danh sách voucher.' });
    }
});

// Áp dụng voucher
router.post('/apply-voucher', isAuthenticated, async (req, res) => {
    try {
        const { voucherCode } = req.body;
        const user = await User.findById(req.user._id).populate('cart.product');

        if (!voucherCode) {
            return res.status(400).json({ message: 'Vui lòng nhập mã voucher.' });
        }

        const voucher = await Voucher.findOne({ code: voucherCode.toUpperCase(), isActive: true });

        if (!voucher) {
            return res.status(404).json({ message: 'Mã giảm giá không hợp lệ hoặc đã hết hạn.' });
        }

        // --- Start of Voucher Application Logic ---
        const vietnamTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
        const currentDay = vietnamTime.getDay(); // 0=Sunday, 1=Monday, ...
        const currentHour = vietnamTime.getHours();

        // Kiểm tra điều kiện thời gian (Happy Hour)
        if (voucher.startTime !== null && voucher.endTime !== null) {
            if (currentHour < voucher.startTime || currentHour >= voucher.endTime) {
                return res.status(400).json({ message: `Mã này chỉ có hiệu lực từ ${voucher.startTime}h đến ${voucher.endTime}h.` });
            }
        }

        let originalTotal = 0;
        let discountAmount = 0;
        let isVoucherApplicable = false;

        // First, calculate the original total of the cart
        for (const item of user.cart) {
            let productPrice = 0;
            const sizeInfo = item.product.sizes.find(s => s.size === item.size);
            if (sizeInfo) {
                productPrice = sizeInfo.price;
            }
            originalTotal += productPrice * item.quantity;
        }

        if (voucher.discountType === 'special_day_fixed_price') {
            if (voucher.specialDay !== currentDay) {
                const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
                return res.status(400).json({ message: `Mã này chỉ có hiệu lực vào ${days[voucher.specialDay]}.` });
            }

            let itemsToDiscountCount = 0;
            for (const item of user.cart) {
                if (item.product.category === voucher.applicableCategory && item.size === voucher.applicableSize) {
                    itemsToDiscountCount++;
                    const originalItemPrice = item.product.sizes.find(s => s.size === item.size).price;
                    discountAmount += (originalItemPrice - voucher.fixedPrice) * item.quantity;
                }
            }

            if (itemsToDiscountCount === 0) {
                return res.status(400).json({ message: `Voucher không áp dụng. Cần có sản phẩm '${voucher.applicableCategory}' size '${voucher.applicableSize}'.` });
            }
            isVoucherApplicable = true;

        } else { // Percentage or Fixed Amount
            let applicableTotal = 0;
            for (const item of user.cart) {
                if (!voucher.applicableCategory || item.product.category === voucher.applicableCategory) {
                    const sizeInfo = item.product.sizes.find(s => s.size === item.size);
                    if (sizeInfo) {
                        applicableTotal += sizeInfo.price * item.quantity;
                    }
                }
            }

            if (applicableTotal > 0) {
                isVoucherApplicable = true;
                if (voucher.discountType === 'percentage') {
                    discountAmount = applicableTotal * (voucher.discountValue / 100);
                } else if (voucher.discountType === 'fixed_amount') {
                    discountAmount = voucher.discountValue;
                }
            }
        }

        if (!isVoucherApplicable) {
            return res.status(400).json({ message: `Voucher không áp dụng cho sản phẩm nào trong giỏ hàng.` });
        }

        const finalTotal = originalTotal - discountAmount;

        // Lưu thông tin voucher vào session
        req.session.voucher = {
            code: voucher.code,
            discountAmount: discountAmount
        };

        res.json({
            message: 'Áp dụng mã giảm giá thành công!',
            originalTotal,
            discountAmount,
            finalTotal
        });

    } catch (err) {
        console.error('Lỗi khi áp dụng voucher:', err);
        res.status(500).json({ message: 'Lỗi server khi áp dụng mã giảm giá.' });
    }
});

module.exports = router;
