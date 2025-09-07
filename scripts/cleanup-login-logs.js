require('dotenv').config();
const mongoose = require('mongoose');
const LoginLog = require('../models/LoginLog');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bubble-tea-shop';
const RETENTION_DAYS = Number(process.env.LOGIN_LOG_RETENTION_DAYS || 90);

async function run() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const result = await LoginLog.deleteMany({ loginTime: { $lt: cutoff } });
  console.log(`🧹 Deleted ${result.deletedCount} login logs older than ${RETENTION_DAYS} days`);
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Cleanup login logs error:', err);
  process.exit(1);
});


