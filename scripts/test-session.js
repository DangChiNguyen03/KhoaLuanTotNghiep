const mongoose = require('mongoose');

async function testSession() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bubble-tea-shop');
    console.log('✅ Connected!\n');
    
    const db = mongoose.connection.db;
    
    // Get all sessions
    const sessions = await db.collection('sessions').find({}).toArray();
    
    console.log('📊 TOTAL SESSIONS:', sessions.length);
    console.log('');
    
    if (sessions.length === 0) {
      console.log('✅ No sessions found. All users need to login.');
      process.exit(0);
    }
    
    // Analyze sessions
    const activeSessions = [];
    const expiredSessions = [];
    const userSessions = new Map();
    
    for (const session of sessions) {
      try {
        const data = JSON.parse(session.session);
        const expiresAt = new Date(session.expires);
        const isExpired = expiresAt < new Date();
        const userId = data.passport?.user;
        
        const sessionInfo = {
          id: session._id,
          userId: userId || 'Not logged in',
          expires: expiresAt,
          isExpired
        };
        
        if (isExpired) {
          expiredSessions.push(sessionInfo);
        } else {
          activeSessions.push(sessionInfo);
          
          if (userId) {
            if (!userSessions.has(userId)) {
              userSessions.set(userId, []);
            }
            userSessions.get(userId).push(sessionInfo);
          }
        }
      } catch (err) {
        console.error('Error parsing session:', err.message);
      }
    }
    
    console.log('📊 SESSION BREAKDOWN:');
    console.log('   Active sessions:', activeSessions.length);
    console.log('   Expired sessions:', expiredSessions.length);
    console.log('');
    
    // Check for duplicate user sessions
    console.log('👥 USERS WITH MULTIPLE SESSIONS:');
    let hasDuplicates = false;
    for (const [userId, sessions] of userSessions.entries()) {
      if (sessions.length > 1) {
        hasDuplicates = true;
        console.log(`   ⚠️  User ${userId}: ${sessions.length} sessions`);
        sessions.forEach((s, i) => {
          console.log(`      ${i + 1}. Expires: ${s.expires.toLocaleString()}`);
        });
      }
    }
    
    if (!hasDuplicates) {
      console.log('   ✅ No duplicate sessions found');
    }
    console.log('');
    
    // Recommendations
    if (expiredSessions.length > 0) {
      console.log('⚠️  RECOMMENDATION:');
      console.log(`   You have ${expiredSessions.length} expired sessions.`);
      console.log('   Run: node scripts/clear-all-sessions.js');
      console.log('');
    }
    
    if (hasDuplicates) {
      console.log('🚨 WARNING:');
      console.log('   Multiple sessions detected for same user!');
      console.log('   This can cause login issues.');
      console.log('   Run: node scripts/clear-all-sessions.js');
      console.log('');
    }
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

testSession();
