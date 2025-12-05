const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const inputDir = path.join(__dirname, "public/images");
const outputDir = path.join(__dirname, "dist/public/images");

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

fs.readdirSync(inputDir).forEach((file) => {
  const inputPath = path.join(inputDir, file);
  const outputPath = path.join(outputDir, file);

  sharp(inputPath)
    .resize(1200)
    .jpeg({ quality: 80 })
    .toFile(outputPath)
    .then(() => console.log("✔ Optimized:", file))
    .catch((err) => console.error("✖ Error:", file, err));
});
