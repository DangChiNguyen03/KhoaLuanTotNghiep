const mongoose = require('mongoose');

async function createIndexes() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect('mongodb://127.0.0.1:27017/bubble-tea-shop');
    console.log('✅ Connected!\n');
    
    const db = mongoose.connection.db;
    
    console.log('🔄 Creating indexes...\n');
    
    // User indexes
    console.log('📝 Users...');
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('users').createIndex({ role: 1 });
    await db.collection('users').createIndex({ isLocked: 1 });
    await db.collection('users').createIndex({ lastLogin: -1 });
    console.log('✅ Users indexes created');
    
    // Order indexes
    console.log('📝 Orders...');
    await db.collection('orders').createIndex({ user: 1, createdAt: -1 });
    await db.collection('orders').createIndex({ status: 1, createdAt: -1 });
    await db.collection('orders').createIndex({ paymentStatus: 1 });
    await db.collection('orders').createIndex({ createdAt: -1 });
    await db.collection('orders').createIndex({ 'voucher.code': 1 });
    console.log('✅ Orders indexes created');
    
    // Product indexes
    console.log('📝 Products...');
    await db.collection('products').createIndex({ category: 1 });
    await db.collection('products').createIndex({ name: 'text' });
    await db.collection('products').createIndex({ isAvailable: 1 });
    console.log('✅ Products indexes created');
    
    // Payment indexes
    console.log('📝 Payments...');
    await db.collection('payments').createIndex({ order: 1 });
    await db.collection('payments').createIndex({ user: 1, createdAt: -1 });
    await db.collection('payments').createIndex({ status: 1 });
    await db.collection('payments').createIndex({ createdAt: -1 });
    console.log('✅ Payments indexes created');
    
    // LoginLog indexes
    console.log('📝 LoginLogs...');
    await db.collection('loginlogs').createIndex({ user: 1, loginTime: -1 });
    await db.collection('loginlogs').createIndex({ loginTime: -1 });
    await db.collection('loginlogs').createIndex({ success: 1 });
    await db.collection('loginlogs').createIndex({ ipAddress: 1 });
    console.log('✅ LoginLogs indexes created');
    
    // AuditLog indexes
    console.log('📝 AuditLogs...');
    await db.collection('auditlogs').createIndex({ user: 1, timestamp: -1 });
    await db.collection('auditlogs').createIndex({ timestamp: -1 });
    await db.collection('auditlogs').createIndex({ action: 1 });
    await db.collection('auditlogs').createIndex({ resourceType: 1 });
    console.log('✅ AuditLogs indexes created');
    
    // Voucher indexes
    console.log('📝 Vouchers...');
    await db.collection('vouchers').createIndex({ code: 1 }, { unique: true });
    await db.collection('vouchers').createIndex({ isActive: 1 });
    await db.collection('vouchers').createIndex({ validFrom: 1, validTo: 1 });
    console.log('✅ Vouchers indexes created');
    
    console.log('\n🎉 All indexes created successfully!');
    console.log('\n📊 Index Summary:');
    
    const collections = ['users', 'orders', 'products', 'payments', 'loginlogs', 'auditlogs', 'vouchers'];
    for (const collName of collections) {
      const indexes = await db.collection(collName).indexes();
      console.log(`   ${collName}: ${indexes.length} indexes`);
    }
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

createIndexes();
