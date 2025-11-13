/**
 * Script để debug login response
 * Thêm vào routes/users.js để log chi tiết response
 */

// THÊM VÀO routes/users.js SAU DÒNG 61 (sau auditLogin):

/*
// DEBUG: Log response headers
console.log('📊 DEBUG LOGIN RESPONSE:');
console.log('   User:', user.email);
console.log('   Session ID:', req.sessionID);
console.log('   Session:', {
  passport: req.session.passport,
  cookie: req.session.cookie
});

// Intercept response để log headers
const originalRedirect = res.redirect;
res.redirect = function(url) {
  console.log('📤 REDIRECT TO:', url);
  console.log('📤 RESPONSE HEADERS:', res.getHeaders());
  console.log('📤 SET-COOKIE:', res.getHeader('set-cookie'));
  originalRedirect.call(this, url);
};
*/

console.log(`
📋 HƯỚNG DẪN DEBUG LOGIN:

1. Mở routes/users.js
2. Tìm dòng 61: await auditLogin(req, true);
3. Thêm đoạn code debug ở trên (bỏ comment)
4. Restart server: pm2 restart app
5. Login và check logs: pm2 logs yolobrew --lines 50

6. Phải thấy:
   ✅ Session ID: xxx
   ✅ SET-COOKIE: connect.sid=xxx; Path=/; HttpOnly; Secure; SameSite=Lax

7. KHÔNG được thấy:
   ❌ SET-COOKIE: undefined
   ❌ Response status: 204

8. Nếu thấy 204 hoặc không có SET-COOKIE:
   → Vấn đề ở session middleware
   → Check .env: NODE_ENV=production
   → Check MongoDB: sessions collection có data không
`);
