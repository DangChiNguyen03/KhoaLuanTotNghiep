const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

// Thư mục ảnh gốc
const inputDir = path.join(__dirname, "public/images");

// Thư mục xuất ảnh đã tối ưu (giữ nguyên như bạn đang dùng)
const outputDir = path.join(__dirname, "dist/public/images");

// Kiểm tra thư mục input
if (!fs.existsSync(inputDir)) {
  console.error("❌ Không tìm thấy thư mục ảnh:", inputDir);
  process.exit(1);
}

// Tạo thư mục output gốc nếu chưa có
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Chỉ xử lý các file ảnh có đuôi này
const allowedExt = [".jpg", ".jpeg", ".png", ".webp"];

function processDir(srcDir, destDir) {
  // Đảm bảo thư mục đích tồn tại
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  fs.readdirSync(srcDir).forEach((name) => {
    const srcPath = path.join(srcDir, name);
    const destPath = path.join(destDir, name);
    const stat = fs.lstatSync(srcPath);

    // Nếu là thư mục → đệ quy vào tiếp (event, products, register, ...)
    if (stat.isDirectory()) {
      console.log("📁 Đi vào folder:", path.relative(inputDir, srcPath));
      processDir(srcPath, destPath);
      return;
    }

    const ext = path.extname(name).toLowerCase();

    // Bỏ qua file không phải ảnh
    if (!allowedExt.includes(ext)) {
      console.log(
        "↷ Bỏ qua (không phải ảnh):",
        path.relative(inputDir, srcPath)
      );
      return;
    }

    // Tạo pipeline sharp
    let pipeline = sharp(srcPath).resize({
      width: 1200,
      withoutEnlargement: true, // không phóng to ảnh nhỏ
    });

    // Giữ định dạng gốc
    if (ext === ".png") {
      pipeline = pipeline.png();
    } else if (ext === ".webp") {
      pipeline = pipeline.webp({ quality: 80 });
    } else {
      // jpg, jpeg
      pipeline = pipeline.jpeg({ quality: 80 });
    }

    pipeline
      .toFile(destPath)
      .then(() => {
        console.log("✔ Optimized:", path.relative(inputDir, srcPath));
      })
      .catch((err) => {
        console.error("✖ Error:", path.relative(inputDir, srcPath), err);
      });
  });
}

// Bắt đầu từ thư mục gốc public/images
processDir(inputDir, outputDir);
