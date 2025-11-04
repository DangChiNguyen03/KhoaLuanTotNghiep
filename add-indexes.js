// Script để thêm MongoDB indexes cho performance
require('dotenv').config();
const mongoose = require('mongoose');

async function addIndexes() {
  try {
    // Kết nối MongoDB
    await mongoose.connect('mongodb://127.0.0.1:27017/bubble-tea-shop', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;

    // User indexes
    console.log('\n📝 Creating User indexes...');
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('users').createIndex({ role: 1 });
    await db.collection('users').createIndex({ createdAt: -1 });
    console.log('✅ User indexes created');

    // Product indexes
    console.log('\n📝 Creating Product indexes...');
    await db.collection('products').createIndex({ name: 1 });
    await db.collection('products').createIndex({ category: 1 });
    await db.collection('products').createIndex({ available: 1 });
    await db.collection('products').createIndex({ createdAt: -1 });
    console.log('✅ Product indexes created');

    // Order indexes
    console.log('\n📝 Creating Order indexes...');
    await db.collection('orders').createIndex({ user: 1 });
    await db.collection('orders').createIndex({ status: 1 });
    await db.collection('orders').createIndex({ paymentStatus: 1 });
    await db.collection('orders').createIndex({ createdAt: -1 });
    await db.collection('orders').createIndex({ user: 1, createdAt: -1 });
    await db.collection('orders').createIndex({ paymentStatus: 1, createdAt: -1 });
    console.log('✅ Order indexes created');

    // Cart indexes
    console.log('\n📝 Creating Cart indexes...');
    await db.collection('carts').createIndex({ user: 1 }, { unique: true });
    console.log('✅ Cart indexes created');

    // Voucher indexes
    console.log('\n📝 Creating Voucher indexes...');
    await db.collection('vouchers').createIndex({ code: 1 }, { unique: true });
    await db.collection('vouchers').createIndex({ active: 1 });
    await db.collection('vouchers').createIndex({ validFrom: 1, validTo: 1 });
    console.log('✅ Voucher indexes created');

    // LoginLog indexes
    console.log('\n📝 Creating LoginLog indexes...');
    await db.collection('loginlogs').createIndex({ user: 1 });
    await db.collection('loginlogs').createIndex({ timestamp: -1 });
    await db.collection('loginlogs').createIndex({ success: 1 });
    await db.collection('loginlogs').createIndex({ user: 1, timestamp: -1 });
    console.log('✅ LoginLog indexes created');

    // AuditLog indexes
    console.log('\n📝 Creating AuditLog indexes...');
    await db.collection('auditlogs').createIndex({ user: 1 });
    await db.collection('auditlogs').createIndex({ action: 1 });
    await db.collection('auditlogs').createIndex({ timestamp: -1 });
    await db.collection('auditlogs').createIndex({ user: 1, timestamp: -1 });
    console.log('✅ AuditLog indexes created');

    // Session indexes (cho MongoStore)
    console.log('\n📝 Creating Session indexes...');
    await db.collection('sessions').createIndex({ expires: 1 }, { expireAfterSeconds: 0 });
    console.log('✅ Session indexes created');

    // Liệt kê tất cả indexes
    console.log('\n📊 All indexes:');
    const collections = ['users', 'products', 'orders', 'carts', 'vouchers', 'loginlogs', 'auditlogs', 'sessions'];
    
    for (const collName of collections) {
      const indexes = await db.collection(collName).indexes();
      console.log(`\n${collName}:`);
      indexes.forEach(idx => {
        console.log(`  - ${JSON.stringify(idx.key)}`);
      });
    }

    console.log('\n🎉 All indexes created successfully!');
    console.log('⚡ Your database is now optimized for performance!');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Disconnected from MongoDB');
    process.exit(0);
  }
}

// Chạy script
addIndexes();
