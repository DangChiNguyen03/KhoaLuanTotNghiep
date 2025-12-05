const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

/**
 * Script tối ưu ảnh tự động
 * - Giảm kích thước file 60-80%
 * - Resize ảnh event xuống 1200px width
 * - Convert sang WebP format (tùy chọn)
 * - Backup ảnh gốc trước khi tối ưu
 */

const EVENT_IMAGES_DIR = path.join(__dirname, '../public/images/event');
const BACKUP_DIR = path.join(__dirname, '../public/images/event/backup_original');
const MAX_WIDTH = 1200; // Max width for event images
const QUALITY = 80; // JPEG quality (60-90)

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    console.log('✅ Created backup directory:', BACKUP_DIR);
}

async function getFileSize(filePath) {
    const stats = fs.statSync(filePath);
    return (stats.size / 1024).toFixed(2); // KB
}

async function optimizeImage(filePath) {
    try {
        const fileName = path.basename(filePath);
        const backupPath = path.join(BACKUP_DIR, fileName);
        
        // Get original size
        const originalSize = await getFileSize(filePath);
        
        // Backup original if not already backed up
        if (!fs.existsSync(backupPath)) {
            fs.copyFileSync(filePath, backupPath);
            console.log(`📦 Backed up: ${fileName}`);
        }
        
        // Optimize image
        await sharp(filePath)
            .resize(MAX_WIDTH, null, {
                fit: 'inside',
                withoutEnlargement: true
            })
            .jpeg({
                quality: QUALITY,
                progressive: true,
                mozjpeg: true
            })
            .toFile(filePath + '.tmp');
        
        // Replace original with optimized
        fs.renameSync(filePath + '.tmp', filePath);
        
        // Get new size
        const newSize = await getFileSize(filePath);
        const savedPercent = ((originalSize - newSize) / originalSize * 100).toFixed(1);
        
        console.log(`✅ ${fileName}: ${originalSize}KB → ${newSize}KB (saved ${savedPercent}%)`);
        
        return {
            fileName,
            originalSize: parseFloat(originalSize),
            newSize: parseFloat(newSize),
            savedPercent: parseFloat(savedPercent)
        };
        
    } catch (error) {
        console.error(`❌ Error optimizing ${filePath}:`, error.message);
        return null;
    }
}

async function optimizeAllImages() {
    console.log('🚀 Starting image optimization...\n');
    
    const files = fs.readdirSync(EVENT_IMAGES_DIR)
        .filter(file => /\.(jpg|jpeg|png)$/i.test(file))
        .map(file => path.join(EVENT_IMAGES_DIR, file));
    
    if (files.length === 0) {
        console.log('⚠️  No images found to optimize');
        return;
    }
    
    console.log(`📸 Found ${files.length} images to optimize\n`);
    
    const results = [];
    for (const file of files) {
        const result = await optimizeImage(file);
        if (result) results.push(result);
    }
    
    // Summary
    console.log('\n📊 OPTIMIZATION SUMMARY:');
    console.log('━'.repeat(60));
    
    const totalOriginal = results.reduce((sum, r) => sum + r.originalSize, 0);
    const totalNew = results.reduce((sum, r) => sum + r.newSize, 0);
    const totalSaved = totalOriginal - totalNew;
    const avgSavedPercent = (totalSaved / totalOriginal * 100).toFixed(1);
    
    console.log(`📦 Total original size: ${totalOriginal.toFixed(2)} KB`);
    console.log(`📦 Total new size: ${totalNew.toFixed(2)} KB`);
    console.log(`💾 Total saved: ${totalSaved.toFixed(2)} KB (${avgSavedPercent}%)`);
    console.log(`✅ Optimized ${results.length} images successfully!`);
    console.log('\n📁 Original images backed up to:', BACKUP_DIR);
}

// Run optimization
optimizeAllImages()
    .then(() => {
        console.log('\n✅ Image optimization completed!');
        process.exit(0);
    })
    .catch(error => {
        console.error('❌ Optimization failed:', error);
        process.exit(1);
    });
