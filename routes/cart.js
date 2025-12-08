const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Payment = require("../models/Payment");
const Voucher = require("../models/Voucher");
const { ensureAuthenticated } = require("../config/auth");

// Middleware cho giỏ hàng
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  
  // AJAX thì trả JSON
  if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
    return res.status(401).json({
      success: false,
      message: 'Vui lòng đăng nhập để thực hiện chức năng này'
    });
  }
  
  // Không phải AJAX thì redirect
  req.flash('error_msg', 'Vui lòng đăng nhập để truy cập');
  res.redirect('/users/login');
};

// Trang giỏ hàng
router.get("/", ensureAuthenticated, async (req, res) => {
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
        }

        return {
          ...item.toObject(),
          toppingDetails: toppingDetails,
        };
      })
    );

    let totalPrice = 0;
    cartItems.forEach((item) => {
      let itemPrice = 0;
      
      // Nếu là topping riêng lẻ
      if (item.product.category === "Topping") {
        itemPrice = item.product.price || 8000;
      } else {
        // Sản phẩm thường có giá theo size
        const sizePrice = item.product.sizes?.find(s => s.size === item.size)?.price || 0;
        let toppingPrice = 0;
        
        // Cộng giá topping
        item.toppingDetails.forEach((topping) => {
          const toppingSizePrice = topping.sizes?.find(s => s.size === item.size)?.price || topping.price || 0;
          toppingPrice += toppingSizePrice;
        });
        
        itemPrice = sizePrice + toppingPrice;
      }
      
      const itemTotal = itemPrice * item.quantity;
      totalPrice += itemTotal;
    });

    res.render("cart", {
      cartItems: cartItems,
      totalPrice: totalPrice,
      user: user.toObject(),
    });
  } catch (err) {
    console.error("Error fetching cart:", err);
    req.flash("error_msg", "Có lỗi xảy ra khi tải giỏ hàng");
    res.redirect("/");
  }
});

// Thêm sản phẩm vào giỏ hàng
router.post("/add", isAuthenticated, async (req, res) => {
  try {
    const { productId, quantity, size, sugarLevel, iceLevel, toppings } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: "Không tìm thấy người dùng" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: "Không tìm thấy sản phẩm" });
    }

    // User phải mua topping riêng
    const validToppings = [];

    const existingItemIndex = user.cart.findIndex((item) => {
      return (
        item.product.toString() === productId &&
        item.size === size &&
        item.sugarLevel === sugarLevel &&
        item.iceLevel === iceLevel &&
        JSON.stringify(item.toppings.sort()) === JSON.stringify(validToppings.sort())
      );
    });

    if (existingItemIndex > -1) {
      user.cart[existingItemIndex].quantity += parseInt(quantity);
    } else {
      user.cart.push({
        product: productId,
        quantity: parseInt(quantity),
        size: size,
        sugarLevel: sugarLevel,
        iceLevel: iceLevel,
        toppings: validToppings,
      });
    }

    await user.save();
    
    res.json({ success: true, message: "Đã thêm vào giỏ hàng" });
  } catch (err) {
    console.error("❌ Error adding to cart:", err);
    res.status(500).json({ success: false, message: "Có lỗi xảy ra" });
  }
});

// Cập nhật số lượng sản phẩm trong giỏ hàng
router.put("/update/:itemId", isAuthenticated, async (req, res) => {
  try {
    const { itemId } = req.params;
    const { quantity } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ success: false, message: "Không tìm thấy người dùng" });
    }

    const cartItem = user.cart.id(itemId);
    if (!cartItem) {
      return res.status(404).json({ success: false, message: "Không tìm thấy sản phẩm trong giỏ hàng" });
    }

    if (parseInt(quantity) <= 0) {
      user.cart.pull(itemId);
    } else {
      cartItem.quantity = parseInt(quantity);
    }

    await user.save();
    
    res.json({ success: true, message: "Đã cập nhật giỏ hàng" });
  } catch (err) {
    console.error("❌ Error updating cart:", err);
    res.status(500).json({ success: false, message: "Có lỗi xảy ra" });
  }
});

// Xóa sản phẩm khỏi giỏ hàng
router.delete("/remove/:itemId", isAuthenticated, async (req, res) => {
  try {
    const { itemId } = req.params;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ success: false, message: "Không tìm thấy người dùng" });
    }

    user.cart.pull(itemId);
    await user.save();

    res.json({ success: true, message: "Đã xóa sản phẩm khỏi giỏ hàng" });
  } catch (err) {
    console.error("❌ Error removing from cart:", err);
    res.status(500).json({ success: false, message: "Có lỗi xảy ra" });
  }
});

// Trang thanh toán
router.get("/checkout", ensureAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate("cart.product");
    if (!user) {
      req.flash("error_msg", "Không tìm thấy người dùng");
      return res.redirect("/cart");
    }
    
    if (!user.cart.length) {
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
    cartItems.forEach((item) => {
      let itemPrice = 0;
      
      // Nếu là topping riêng lẻ
      if (item.product.category === "Topping") {
        itemPrice = item.product.price || 8000;
        console.log(`🧩 CHECKOUT - Standalone Topping: ${item.product.name}, Price: ${itemPrice}`);
      } else {
        // Sản phẩm thường có giá theo size
        const sizePrice = item.product.sizes?.find(s => s.size === item.size)?.price || 0;
        let toppingPrice = 0;
        
        // Cộng giá topping
        item.toppingDetails.forEach((topping) => {
          const toppingSizePrice = topping.sizes?.find(s => s.size === item.size)?.price || topping.price || 0;
          toppingPrice += toppingSizePrice;
        });
        
        itemPrice = sizePrice + toppingPrice;
        console.log(`💰 CHECKOUT - Regular Item: ${item.product.name}, Size Price: ${sizePrice}, Topping Price: ${toppingPrice}`);
      }
      
      const itemTotal = itemPrice * item.quantity;
      console.log(`💰 CHECKOUT - Item Total: ${item.product.name} x${item.quantity} = ${itemTotal}`);
      totalPrice += itemTotal;
    });

    let finalPrice = totalPrice;
    let discountAmount = 0;
    let appliedVoucher = null;

    if (req.session.voucher) {
      const voucher = await Voucher.findOne({
        code: req.session.voucher,
        isActive: true
      });

      if (voucher) {
        appliedVoucher = voucher.code;
        console.log('🎫 Applying voucher:', voucher.code, 'Type:', voucher.discountType, 'Value:', voucher.discountValue);
        console.log('🛒 Total price before discount:', totalPrice);
        
        // Calculate discount based on voucher type
        if (voucher.discountType === 'percentage') {
          // Check if voucher applies to specific category
          if (voucher.applicableCategory) {
            let applicableTotalPrice = 0;
            cartItems.forEach((item) => {
              if (item.product.category === voucher.applicableCategory) {
                // For category-specific vouchers, only apply to main product price, not toppings
                let itemPrice = 0;
                if (item.product.category === "Topping") {
                  itemPrice = item.product.price || 8000;
                } else {
                  itemPrice = item.product.sizes?.find(s => s.size === item.size)?.price || 0;
                }
                applicableTotalPrice += itemPrice * item.quantity;
                console.log(`🎫 Category voucher - Item: ${item.product.name}, Category: ${item.product.category}, Price: ${itemPrice}, Applicable: ${itemPrice * item.quantity}`);
              }
            });
            discountAmount = Math.round(applicableTotalPrice * voucher.discountValue / 100);
            console.log(`🎫 Category voucher - Applicable total: ${applicableTotalPrice}, Discount: ${discountAmount}`);
          } else {
            // Apply to all items
            discountAmount = Math.round(totalPrice * voucher.discountValue / 100);
          }
        } else if (voucher.discountType === 'fixed_amount') {
          discountAmount = voucher.discountValue;
        } else if (voucher.discountType === 'special_day_fixed_price') {
          // Special day fixed price: Set specific items to fixed price
          let totalOriginalPrice = 0;
          let totalFixedPrice = 0;
          
          cartItems.forEach((item) => {
            if (item.product.category === voucher.applicableCategory) {
              // Check if item matches size requirement (if any)
              if (!voucher.applicableSize || item.size === voucher.applicableSize) {
                const originalItemPrice = item.product.sizes?.find(s => s.size === item.size)?.price || 0;
                totalOriginalPrice += originalItemPrice * item.quantity;
                totalFixedPrice += voucher.fixedPrice * item.quantity;
                console.log(`🎫 GET Fixed Price - Item: ${item.product.name}, Size: ${item.size}, Original: ${originalItemPrice}, Fixed: ${voucher.fixedPrice}, Quantity: ${item.quantity}`);
              }
            }
          });
          
          discountAmount = totalOriginalPrice - totalFixedPrice;
          console.log(`🎫 GET Fixed Price - Original Total: ${totalOriginalPrice}, Fixed Total: ${totalFixedPrice}, Discount: ${discountAmount}`);
        }
        
        finalPrice = totalPrice - discountAmount;
        if (finalPrice < 0) finalPrice = 0;
        
        console.log('💰 Discount amount:', discountAmount);
        console.log('💳 Final price:', finalPrice);
      }
    }

    res.render("checkout", {
      cartItems: cartItems,
      totalPrice: totalPrice,
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
router.post("/checkout", ensureAuthenticated, async (req, res) => {
  const { paymentMethod, cashAmount } = req.body;
  
  try {
    const user = await User.findById(req.user._id).populate("cart.product");
    if (!user || !user.cart.length) {
      if (paymentMethod === 'vnpay') {
        return res.status(400).json({
          success: false,
          message: "Giỏ hàng trống, không thể thanh toán"
        });
      } else {
        req.flash("error_msg", "Giỏ hàng trống, không thể thanh toán");
        return res.redirect("/cart");
      }
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
      let singleItemPrice = 0;
      
      // Nếu là topping riêng lẻ
      if (item.product.category === "Topping") {
        singleItemPrice = item.product.price || 8000; // Use direct price or fallback
        console.log(`🧩 POST CHECKOUT - Standalone Topping: ${item.product.name}, Price: ${singleItemPrice}`);
      } else {
        // Sản phẩm thường có giá theo size
        const sizePrice = item.product.sizes?.find(s => s.size === item.size)?.price || 0;
        let toppingPrice = 0;
        
        // Cộng giá topping
        item.toppingDetails.forEach((topping) => {
          const toppingSizePrice = topping.sizes?.find(s => s.size === item.size)?.price || topping.price || 0;
          toppingPrice += toppingSizePrice;
        });
        
        singleItemPrice = sizePrice + toppingPrice;
        console.log(`💰 POST CHECKOUT - Regular Item: ${item.product.name}, Size Price: ${sizePrice}, Topping Price: ${toppingPrice}`);
      }
      const itemTotal = singleItemPrice * item.quantity;
      totalPrice += itemTotal;

      orderItems.push({
        product: item.product._id,
        quantity: item.quantity,
        price: singleItemPrice,
        toppings: item.toppings,
        sugarLevel: item.sugarLevel,
        iceLevel: item.iceLevel,
        size: item.size,
      });
    }

    // Apply voucher discount if exists
    let finalPrice = totalPrice;
    let discountAmount = 0;
    let appliedVoucherCode = null;

    if (req.session.voucher) {
      const voucher = await Voucher.findOne({
        code: req.session.voucher,
        isActive: true
      });

      if (voucher) {
        appliedVoucherCode = voucher.code;
        console.log('🎫 POST: Applying voucher:', voucher.code, 'Type:', voucher.discountType, 'Value:', voucher.discountValue);
        
        // Calculate discount based on voucher type
        if (voucher.discountType === 'percentage') {
          // Check if voucher applies to specific category
          if (voucher.applicableCategory) {
            let applicableTotalPrice = 0;
            cartItems.forEach((item) => {
              if (item.product.category === voucher.applicableCategory) {
                // For category-specific vouchers, only apply to main product price, not toppings
                let itemPrice = 0;
                if (item.product.category === "Topping") {
                  itemPrice = item.product.price || 8000;
                } else {
                  itemPrice = item.product.sizes?.find(s => s.size === item.size)?.price || 0;
                }
                applicableTotalPrice += itemPrice * item.quantity;
                console.log(`🎫 Category voucher - Item: ${item.product.name}, Category: ${item.product.category}, Price: ${itemPrice}, Applicable: ${itemPrice * item.quantity}`);
              }
            });
            discountAmount = Math.round(applicableTotalPrice * voucher.discountValue / 100);
            console.log(`🎫 Category voucher - Applicable total: ${applicableTotalPrice}, Discount: ${discountAmount}`);
          } else {
            // Apply to all items
            discountAmount = Math.round(totalPrice * voucher.discountValue / 100);
          }
        } else if (voucher.discountType === 'fixed_amount') {
          discountAmount = voucher.discountValue;
        } else if (voucher.discountType === 'special_day_fixed_price') {
          // Special day fixed price: Set specific items to fixed price
          let totalOriginalPrice = 0;
          let totalFixedPrice = 0;
          
          cartItems.forEach((item) => {
            if (item.product.category === voucher.applicableCategory) {
              // Check if item matches size requirement (if any)
              if (!voucher.applicableSize || item.size === voucher.applicableSize) {
                const originalItemPrice = item.product.sizes?.find(s => s.size === item.size)?.price || 0;
                totalOriginalPrice += originalItemPrice * item.quantity;
                totalFixedPrice += voucher.fixedPrice * item.quantity;
                console.log(`🎫 POST Fixed Price - Item: ${item.product.name}, Size: ${item.size}, Original: ${originalItemPrice}, Fixed: ${voucher.fixedPrice}, Quantity: ${item.quantity}`);
              }
            }
          });
          
          discountAmount = totalOriginalPrice - totalFixedPrice;
          console.log(`🎫 POST Fixed Price - Original Total: ${totalOriginalPrice}, Fixed Total: ${totalFixedPrice}, Discount: ${discountAmount}`);
        }
        
        finalPrice = totalPrice - discountAmount;
        if (finalPrice < 0) finalPrice = 0;
        
        console.log('💰 POST: Discount amount:', discountAmount);
        console.log('💳 POST: Final price:', finalPrice);
      }
    }

    // Kiểm tra phương thức thanh toán
    if (!["cash", "vnpay"].includes(paymentMethod)) {
      if (paymentMethod === 'vnpay') {
        return res.status(400).json({
          success: false,
          message: "Phương thức thanh toán không hợp lệ"
        });
      } else {
        req.flash("error_msg", "Phương thức thanh toán không hợp lệ");
        return res.redirect("/cart/checkout");
      }
    }

    if (paymentMethod === "cash") {
      const cash = parseInt(cashAmount);
      if (isNaN(cash) || cash < finalPrice) {
        req.flash("error_msg", "Số tiền khách đưa không đủ");
        return res.redirect("/cart/checkout");
      }
    }

    const order = new Order({
      user: user._id,
      items: orderItems,
      totalPrice: finalPrice,
      originalPrice: totalPrice,
      voucher: appliedVoucherCode ? {
        code: appliedVoucherCode,
        discountAmount: discountAmount
      } : undefined,
      paymentMethod: paymentMethod,
      status: "pending",
      paymentStatus: paymentMethod === "cash" ? "paid" : "pending",
    });
    await order.save();

    // Emit notification ONLY for COD (paid immediately)
    // VNPay notification will be sent after successful payment in callback
    if (paymentMethod === 'cash') {
      const io = req.app.get('io');
      if (io) {
        io.emit('new-order', {
          orderId: order._id,
          customerName: user.name,
          totalPrice: finalPrice,
          paymentMethod: paymentMethod,
          timestamp: new Date()
        });
        console.log('🔔 New order notification sent (COD):', order._id);
      }
    }

    // Handle different payment methods
    if (paymentMethod === 'vnpay') {
      console.log(`✅ Order created for ${paymentMethod.toUpperCase()}:`, order._id);
      
      const responseData = {
        success: true,
        orderId: order._id,
        message: `Order created successfully. Redirecting to ${paymentMethod.toUpperCase()}...`
      };
      
      console.log(`📤 Sending JSON response for ${paymentMethod}:`, responseData);
      
      return res.json(responseData);
    } else {
      // For cash payments, create payment record immediately
      const payment = new Payment({
        order: order._id,
        user: user._id,
        amount: finalPrice,
        paymentMethod: paymentMethod,
        status: "paid",
        paidAt: new Date(),
      });
      await payment.save();

      order.status = "confirmed";  // Trả lại logic cũ: confirmed → admin sẽ xử lý tiếp
      await order.save();

      // Xóa giỏ hàng và voucher sau khi thanh toán
      await User.updateOne({ _id: user._id }, { $set: { cart: [] } });
      delete req.session.voucher;

      req.flash("success_msg", "Thanh toán thành công! Cảm ơn bạn đã mua hàng.");
      res.redirect("/");
    }
  } catch (err) {
    console.error("Error processing checkout:", err);
    
    // Handle different response types based on payment method
    if (paymentMethod === 'vnpay') {
      return res.status(500).json({
        success: false,
        message: "Có lỗi xảy ra khi xử lý thanh toán: " + err.message
      });
    } else {
      req.flash("error_msg", "Có lỗi xảy ra khi xử lý thanh toán");
      res.redirect("/cart/checkout");
    }
  }
});

// Route để lấy danh sách voucher khả dụng
router.get('/available-vouchers', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('cart.product');
    const Order = require('../models/Order');
    
    if (!user || !user.cart.length) {
      return res.json({ vouchers: [] });
    }

    const vouchers = await Voucher.find({ isActive: true });
    const availableVouchers = [];

    for (const voucher of vouchers) {
      let isApplicable = true;
      let reason = '';
      let applicableItems = 0;
      
      console.log(`🎫 Validating voucher: ${voucher.code}`);

      // ✅ CHECK 1: Kiểm tra role (chức vụ)
      if (isApplicable && voucher.applicableRoles && voucher.applicableRoles.length > 0) {
        if (!voucher.applicableRoles.includes(user.role)) {
          const roleNames = {
            admin: 'Admin',
            manager: 'Quản lý',
            staff: 'Nhân viên',
            customer: 'Khách hàng'
          };
          const allowedRoles = voucher.applicableRoles.map(r => roleNames[r] || r).join(', ');
          reason = `Chỉ dành cho: ${allowedRoles}`;
          isApplicable = false;
        }
      }

      // ✅ CHECK 2: Kiểm tra MANGUOIMOI - chỉ dùng 1 lần cả đời
      if (isApplicable && voucher.code === 'MANGUOIMOI') {
        const hasUsedBefore = await Order.findOne({
          user: user._id,
          'voucher.code': 'MANGUOIMOI'
        });
        
        if (hasUsedBefore) {
          reason = 'Bạn đã sử dụng mã này rồi';
          isApplicable = false;
        }
      }

      // ✅ CHECK 3: Kiểm tra ngày đặc biệt (special day)
      if (isApplicable && voucher.specialDay !== null) {
        const currentDay = new Date().getDay();
        if (currentDay !== voucher.specialDay) {
          const dayNames = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
          reason = `Chỉ áp dụng vào ${dayNames[voucher.specialDay]}`;
          isApplicable = false;
        }
      }

      // ✅ CHECK 4: Kiểm tra khung giờ (time-based)
      if (isApplicable && voucher.startTime !== null && voucher.endTime !== null) {
        const currentHour = new Date().getHours();
        if (currentHour < voucher.startTime || currentHour >= voucher.endTime) {
          reason = `Chỉ áp dụng từ ${voucher.startTime}h đến ${voucher.endTime}h`;
          isApplicable = false;
        }
      }

      // ✅ CHECK 5: Kiểm tra danh mục và size
      if (isApplicable && voucher.applicableCategory) {
        for (const item of user.cart) {
          if (item.product.category === voucher.applicableCategory) {
            if (voucher.applicableSize) {
              if (item.size === voucher.applicableSize) {
                applicableItems++;
              }
            } else {
              applicableItems++;
            }
          }
        }
        if (applicableItems === 0) {
          if (voucher.applicableSize) {
            reason = `Không có sản phẩm '${voucher.applicableCategory}' size '${voucher.applicableSize}' trong giỏ hàng`;
          } else {
            reason = `Không có sản phẩm '${voucher.applicableCategory}' trong giỏ hàng`;
          }
          isApplicable = false;
        }
      } else if (isApplicable) {
        applicableItems = user.cart.length;
      }

      console.log(`🎫 Voucher ${voucher.code} - Applicable: ${isApplicable}, Reason: ${reason || 'Valid'}`);

      // ✅ CHỈ THÊM VOUCHER KHẢ DỤNG VÀO DANH SÁCH
      if (isApplicable) {
        availableVouchers.push({
          code: voucher.code,
          description: voucher.description,
          discountType: voucher.discountType,
          discountValue: voucher.discountValue,
          fixedPrice: voucher.fixedPrice,
          applicableCategory: voucher.applicableCategory,
          startTime: voucher.startTime,
          endTime: voucher.endTime,
          isApplicable: true,
          reason: '',
          applicableItems,
          potentialDiscount: 0
        });
      }
    }
    
    res.json({ vouchers: availableVouchers });
    
  } catch (err) {
    console.error('Error fetching available vouchers:', err);
    res.status(500).json({ message: 'Lỗi server khi lấy danh sách voucher.' });
  }
});

// Route để bỏ voucher
router.post('/remove-voucher', isAuthenticated, async (req, res) => {
  try {
    // Xóa voucher khỏi session
    delete req.session.voucher;
    
    res.json({
      success: true,
      message: 'Đã bỏ voucher thành công'
    });
  } catch (error) {
    console.error('Error removing voucher:', error);
    res.status(500).json({
      success: false,
      message: 'Có lỗi xảy ra khi bỏ voucher'
    });
  }
});

// Route để áp dụng voucher
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

    // Check role-based access
    if (voucher.applicableRoles && voucher.applicableRoles.length > 0) {
      if (!voucher.applicableRoles.includes(user.role)) {
        const roleNames = {
          admin: 'Admin',
          manager: 'Quản lý',
          staff: 'Nhân viên',
          customer: 'Khách hàng'
        };
        const allowedRoles = voucher.applicableRoles.map(r => roleNames[r] || r).join(', ');
        return res.status(403).json({ 
          message: `Voucher này chỉ dành cho: ${allowedRoles}` 
        });
      }
    }

    // Check time restrictions
    if (voucher.startTime !== null && voucher.endTime !== null) {
      const currentHour = new Date().getHours();
      if (currentHour < voucher.startTime || currentHour >= voucher.endTime) {
        return res.status(400).json({ 
          message: `Voucher chỉ áp dụng từ ${voucher.startTime}h đến ${voucher.endTime}h` 
        });
      }
    }

    // Store voucher in session
    req.session.voucher = voucher.code;
    
    res.json({
      success: true,
      message: 'Áp dụng voucher thành công!'
    });

  } catch (error) {
    console.error('Error applying voucher:', error);
    res.status(500).json({
      success: false,
      message: 'Có lỗi xảy ra khi áp dụng voucher'
    });
  }
});

// Xóa topping khỏi sản phẩm trong giỏ hàng
router.delete("/remove-topping/:itemId/:toppingId", isAuthenticated, async (req, res) => {
  try {
    const { itemId, toppingId } = req.params;
    console.log("🗑️ REMOVE TOPPING REQUEST:", { itemId, toppingId, userId: req.user._id });

    const user = await User.findById(req.user._id);
    if (!user) {
      console.log("❌ User not found:", req.user._id);
      return res.status(404).json({ success: false, message: "Không tìm thấy người dùng" });
    }

    // Tìm item trong cart
    const cartItem = user.cart.id(itemId);
    if (!cartItem) {
      console.log("❌ Cart item not found:", itemId);
      return res.status(404).json({ success: false, message: "Không tìm thấy sản phẩm trong giỏ hàng" });
    }

    console.log("📦 Cart item before:", {
      product: cartItem.product,
      toppings: cartItem.toppings
    });

    // Xóa topping khỏi array
    const toppingIndex = cartItem.toppings.findIndex(t => t.toString() === toppingId);
    if (toppingIndex === -1) {
      console.log("❌ Topping not found in item:", toppingId);
      return res.status(404).json({ success: false, message: "Không tìm thấy topping trong sản phẩm" });
    }

    cartItem.toppings.splice(toppingIndex, 1);
    console.log("📦 Cart item after:", {
      product: cartItem.product,
      toppings: cartItem.toppings
    });

    await user.save();
    console.log("💾 Topping removed successfully");

    res.json({ success: true, message: "Đã xóa topping thành công" });
  } catch (err) {
    console.error("❌ Error removing topping:", err);
    res.status(500).json({ success: false, message: "Có lỗi xảy ra khi xóa topping" });
  }
});

module.exports = router;
