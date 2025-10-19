// routes/products.js
const express = require("express");
const router = express.Router();
const Product = require("../models/Product");
const {
  getBasePrice,
  getDiscountedAmountForBase,
} = require("../utils/priceUtils");

// Get all products
router.get("/", async (req, res) => {
  try {
    let query = {};

    // Filter by category
    if (req.query.category && req.query.category !== "all") {
      query.category = req.query.category;
    }

    // Filter by availability
    if (req.query.available) {
      query.isAvailable = req.query.available === "true";
    }

    // Search by name
    if (req.query.search) {
      query.name = { $regex: req.query.search, $options: "i" };
    }

    // Lấy danh sách sản phẩm
    let products = await Product.find(query).lean();

    // Gắn giá hiển thị (original + final + isDiscounted)
    products = products.map((p) => {
      // Lấy base price đại diện: p.price hoặc sizes[0].price
      const base = getBasePrice(p, null); // null => dùng sizes[0] hoặc price
      const discountInfo = getDiscountedAmountForBase(
        base,
        p.category,
        p.name,
        new Date()
      );
      return {
        ...p,
        originalPrice: base,
        finalPrice: discountInfo.finalBasePrice,
        isDiscounted: discountInfo.isDiscounted,
      };
    });

    // Sắp xếp bằng JavaScript theo finalPrice nếu sort theo price
    if (req.query.sort) {
      switch (req.query.sort) {
        case "price_asc":
          products.sort((a, b) => (a.finalPrice || 0) - (b.finalPrice || 0));
          break;
        case "price_desc":
          products.sort((a, b) => (b.finalPrice || 0) - (a.finalPrice || 0));
          break;
        case "name_asc":
          products.sort((a, b) => a.name.localeCompare(b.name));
          break;
        case "name_desc":
          products.sort((a, b) => b.name.localeCompare(a.name));
          break;
        default:
          products.sort(
            (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
          );
      }
    } else {
      products.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // mặc định mới nhất
    }

    const categories = await Product.distinct("category");
    const toppings = await Product.find({ category: "Topping" }).select("name _id");
    
    res.render("products", {
      user: req.user,
      products,
      categories,
      toppings: toppings, // Truyền topping objects với _id và name
      currentCategory: req.query.category || "all",
      currentSort: req.query.sort || "newest",
      searchTerm: req.query.search || "",
    });
  } catch (err) {
    console.error("Products page error:", err);
    req.flash("error_msg", "Có lỗi khi tải danh sách sản phẩm");
    res.redirect("/");
  }
});

// Get product detail (JSON) - để modal / ajax sử dụng
router.get("/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).lean();
    if (!product) {
      return res.status(404).json({ message: "Không tìm thấy sản phẩm" });
    }

    // Trả kèm giá đại diện (size[0] hoặc price) và không tính topping
    const base = getBasePrice(product, null);
    const discountInfo = getDiscountedAmountForBase(
      base,
      product.category,
      product.name,
      new Date()
    );

    res.json({
      ...product,
      originalPrice: base,
      finalPrice: discountInfo.finalBasePrice,
      isDiscounted: discountInfo.isDiscounted,
    });
  } catch (err) {
    console.error("Product detail error:", err);
    res.status(500).json({ message: "Có lỗi khi tải thông tin sản phẩm" });
  }
});

module.exports = router;
