const LoginLog = require('../models/LoginLog');
// Helper function để parse User Agent đơn giản
function parseUserAgent(userAgent) {
    const ua = userAgent.toLowerCase();
    
    // Detect browser
    let browser = 'Unknown';
    if (ua.includes('chrome')) browser = 'Chrome';
    else if (ua.includes('firefox')) browser = 'Firefox';
    else if (ua.includes('safari')) browser = 'Safari';
    else if (ua.includes('edge')) browser = 'Edge';
    
    // Detect OS
    let os = 'Unknown';
    if (ua.includes('windows')) os = 'Windows';
    else if (ua.includes('mac')) os = 'macOS';
    else if (ua.includes('linux')) os = 'Linux';
    else if (ua.includes('android')) os = 'Android';
    else if (ua.includes('ios')) os = 'iOS';
    
    // Detect device type
    let device = 'desktop';
    if (ua.includes('mobile') || ua.includes('android')) device = 'mobile';
    else if (ua.includes('tablet') || ua.includes('ipad')) device = 'tablet';
    
    return { browser, os, device };
}

// Helper function để lấy IP address
function getClientIP(req) {
    return req.ip || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
           '127.0.0.1';
}

// Middleware để log đăng nhập thành công
const logSuccessfulLogin = async (req, res, next) => {
    try {
        if (req.user) {
            const ipAddress = getClientIP(req);
            const userAgent = req.get('User-Agent') || '';
            const deviceInfo = parseUserAgent(userAgent);
            
            // Tạo session ID unique
            const sessionId = req.sessionID || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            
            // Kiểm tra hoạt động đáng ngờ
            const suspiciousActivity = await LoginLog.detectSuspiciousActivity(req.user._id, ipAddress);
            const riskLevel = suspiciousActivity.length > 0 ? 'high' : 'low';
            
            const loginLog = new LoginLog({
                user: req.user._id,
                username: req.user.username || req.user.email,
                loginTime: new Date(),
                ipAddress: ipAddress,
                userAgent: userAgent,
                loginStatus: 'success',
                sessionId: sessionId,
                deviceInfo: deviceInfo,
                riskLevel: riskLevel,
                isActive: true
            });
            
            await loginLog.save();
            
            // Lưu loginLogId vào session để có thể update khi logout
            req.session.loginLogId = loginLog._id;
            
            console.log(`✅ Login logged for user: ${req.user.username || req.user.email} from IP: ${ipAddress}`);
        }
    } catch (error) {
        console.error('Error logging successful login:', error);
        // Không throw error để không ảnh hưởng đến quá trình đăng nhập
    }
    
    next();
};

// Middleware để log đăng nhập thất bại
const logFailedLogin = async (username, req, reason = 'Invalid credentials') => {
    try {
        const ipAddress = getClientIP(req);
        const userAgent = req.get('User-Agent') || '';
        const deviceInfo = parseUserAgent(userAgent);
        
        // Tìm user để lấy ID (nếu tồn tại)
        const User = require('../models/User');
        const user = await User.findOne({ 
            $or: [{ username: username }, { email: username }] 
        });
        
        const loginLog = new LoginLog({
            user: user ? user._id : null,
            username: username,
            loginTime: new Date(),
            ipAddress: ipAddress,
            userAgent: userAgent,
            loginStatus: 'failed',
            failureReason: reason,
            deviceInfo: deviceInfo,
            riskLevel: 'medium',
            isActive: false
        });
        
        await loginLog.save();
        
        console.log(`❌ Failed login attempt logged for: ${username} from IP: ${ipAddress} - Reason: ${reason}`);
    } catch (error) {
        console.error('Error logging failed login:', error);
    }
};

// Middleware để log logout
const logLogout = async (req, res, next) => {
    try {
        if (req.session && req.session.loginLogId) {
            const loginLog = await LoginLog.findById(req.session.loginLogId);
            if (loginLog) {
                await loginLog.markLogout();
                console.log(`👋 Logout logged for user: ${loginLog.username}`);
            }
        }
    } catch (error) {
        console.error('Error logging logout:', error);
    }
    
    next();
};

// Function để cleanup các session cũ (chạy định kỳ)
const cleanupOldSessions = async () => {
    try {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        // Đánh dấu các session cũ là không hoạt động
        await LoginLog.updateMany(
            {
                isActive: true,
                loginTime: { $lt: oneDayAgo }
            },
            {
                $set: {
                    isActive: false,
                    logoutTime: new Date(),
                    notes: 'Auto-logout due to inactivity'
                }
            }
        );
        
        console.log('🧹 Cleaned up old inactive sessions');
    } catch (error) {
        console.error('Error cleaning up old sessions:', error);
    }
};

// Function để phát hiện và cảnh báo hoạt động đáng ngờ
const checkSuspiciousActivity = async (userId, ipAddress) => {
    try {
        const suspicious = await LoginLog.detectSuspiciousActivity(userId, ipAddress);
        
        if (suspicious.length > 0) {
            console.warn(`⚠️ Suspicious activity detected for user ${userId} from IP ${ipAddress}`);
            
            // Có thể gửi email cảnh báo hoặc notification ở đây
            // await sendSecurityAlert(userId, suspicious);
            
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('Error checking suspicious activity:', error);
        return false;
    }
};

module.exports = {
    logSuccessfulLogin,
    logFailedLogin,
    logLogout,
    cleanupOldSessions,
    checkSuspiciousActivity
};
