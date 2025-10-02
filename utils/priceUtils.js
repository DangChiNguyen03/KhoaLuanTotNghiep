// utils/priceUtils.js
// Hàm này tính toán giá cuối cùng (finalPrice) dựa theo product, size và toppings.
// Trả về object: { originalBasePrice, finalBasePrice, toppingTotal, finalPrice, isDiscounted }

function normalizeCategory(cat = "") {
  return String(cat).trim().toLowerCase();
}

function getBasePrice(product, size) {
  // Nếu product có sizes (mảng), và size được truyền thì tìm giá của size đó
  if (product.sizes && Array.isArray(product.sizes) && size) {
    const found = product.sizes.find((s) => String(s.size) === String(size));
    if (found && typeof found.price === "number") return found.price;
  }

  // Nếu có sizes nhưng không truyền size, fallback sizes[0]
  if (
    product.sizes &&
    Array.isArray(product.sizes) &&
    product.sizes.length > 0
  ) {
    const first = product.sizes[0];
    if (first && typeof first.price === "number") return first.price;
  }

  // Cuối cùng dùng product.price
  if (typeof product.price === "number") return product.price;

  // Nếu không có gì, trả 0
  return 0;
}

function getDiscountedAmountForBase(
  basePrice,
  category = "",
  name = "",
  now = new Date()
) {
  // Trả về { finalBasePrice, isDiscounted }
  const cat = normalizeCategory(category);
  const nm = String(name || "").toLowerCase();
  const day = now.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const hour = now.getHours();

  let finalBase = basePrice;
  let isDiscounted = false;

  // Thứ 2 - Thứ 6
  if (day >= 1 && day <= 5) {
    // Cà phê 5h-8h giảm 15%
    if (
      cat.includes("cà phê") ||
      cat.includes("ca phe") ||
      nm.includes("cà phê") ||
      nm.includes("ca phe")
    ) {
      if (hour >= 5 && hour < 8) {
        finalBase = Math.round(basePrice * 0.85);
        isDiscounted = true;
      }
    }
    // Trà sữa 15h-19h giảm 15%
    if (
      cat.includes("trà sữa") ||
      cat.includes("tra sua") ||
      nm.includes("trà sữa") ||
      nm.includes("tra sua")
    ) {
      if (hour >= 15 && hour < 19) {
        finalBase = Math.round(basePrice * 0.85);
        isDiscounted = true;
      }
    }
  }

  // Thứ 7 (6) và Chủ nhật (0): trà sữa đồng giá 20k
  if (
    (day === 6 || day === 0) &&
    (cat.includes("trà sữa") ||
      cat.includes("tra sua") ||
      nm.includes("trà sữa") ||
      nm.includes("tra sua"))
  ) {
    finalBase = 20000;
    isDiscounted = true;
  }

  return { finalBasePrice: finalBase, isDiscounted };
}

function computeFinalPrice(product, options = {}) {
  // options: { size: 'M', toppingProducts: [ { price, sizes } , ... ], now: Date }
  const size = options.size;
  const toppings = Array.isArray(options.toppingProducts)
    ? options.toppingProducts
    : [];
  const now = options.now || new Date();

  const originalBasePrice = getBasePrice(product, size);
  const { finalBasePrice, isDiscounted } = getDiscountedAmountForBase(
    originalBasePrice,
    product.category,
    product.name,
    now
  );

  // Topping total: sum of each topping's base price (if topping has sizes, take sizes[0] or price)
  let toppingTotal = 0;
  for (const t of toppings) {
    if (typeof t.price === "number" && t.price > 0) {
      toppingTotal += t.price;
    } else if (
      t.sizes &&
      Array.isArray(t.sizes) &&
      t.sizes.length > 0 &&
      typeof t.sizes[0].price === "number"
    ) {
      toppingTotal += t.sizes[0].price;
    } else {
      toppingTotal += 0;
    }
  }

  // Final price = discounted base price + toppingTotal
  const finalPrice = Math.round(finalBasePrice + toppingTotal);

  return {
    originalBasePrice,
    finalBasePrice,
    toppingTotal,
    finalPrice,
    isDiscounted,
  };
}

module.exports = {
  getBasePrice,
  getDiscountedAmountForBase,
  computeFinalPrice,
};
