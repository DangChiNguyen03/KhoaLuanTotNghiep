const mongoose = require('mongoose');

async function checkSessions() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bubble-tea-shop');
    console.log('✅ Connected!\n');
    
    const db = mongoose.connection.db;
    
    // Check sessions collection
    const sessions = await db.collection('sessions').find({}).toArray();
    
    console.log('📊 SESSION STATISTICS:');
    console.log('   Total sessions:', sessions.length);
    
    if (sessions.length > 0) {
      console.log('\n📝 ACTIVE SESSIONS:');
      sessions.forEach((session, index) => {
        const data = JSON.parse(session.session);
        const expiresAt = new Date(session.expires);
        const isExpired = expiresAt < new Date();
        
        console.log(`\n   Session ${index + 1}:`);
        console.log('   - ID:', session._id);
        console.log('   - User:', data.passport?.user || 'Not logged in');
        console.log('   - Expires:', expiresAt.toLocaleString());
        console.log('   - Status:', isExpired ? '❌ EXPIRED' : '✅ ACTIVE');
      });
      
      // Count expired sessions
      const expiredCount = sessions.filter(s => new Date(s.expires) < new Date()).length;
      console.log('\n📊 SUMMARY:');
      console.log('   Active sessions:', sessions.length - expiredCount);
      console.log('   Expired sessions:', expiredCount);
      
      if (expiredCount > 0) {
        console.log('\n⚠️  WARNING: You have expired sessions that should be cleaned up!');
        console.log('   Run: db.sessions.deleteMany({ expires: { $lt: new Date() } })');
      }
    } else {
      console.log('   No sessions found.');
    }
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

checkSessions();
