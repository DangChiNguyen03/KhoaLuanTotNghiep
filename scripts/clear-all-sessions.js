const mongoose = require('mongoose');

async function clearAllSessions() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bubble-tea-shop');
    console.log('✅ Connected!\n');
    
    const db = mongoose.connection.db;
    
    // Count sessions before delete
    const beforeCount = await db.collection('sessions').countDocuments();
    console.log('📊 Sessions before delete:', beforeCount);
    
    // Delete all sessions
    const result = await db.collection('sessions').deleteMany({});
    console.log('🗑️  Deleted sessions:', result.deletedCount);
    
    // Verify
    const afterCount = await db.collection('sessions').countDocuments();
    console.log('📊 Sessions after delete:', afterCount);
    
    console.log('\n✅ All sessions cleared!');
    console.log('⚠️  All users will need to login again.');
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

clearAllSessions();
