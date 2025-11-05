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
    // Ưu tiên các headers từ proxy/load balancer
    let ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
             req.headers['x-real-ip'] ||
             req.headers['x-client-ip'] ||
             req.connection.remoteAddress || 
             req.socket.remoteAddress ||
             (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
             req.ip ||
             '127.0.0.1';
    
    // Chuyển đổi IPv6 thành IPv4
    if (ip === '::1') {
        ip = '127.0.0.1';
    } else if (ip && ip.startsWith('::ffff:')) {
        // IPv6-mapped IPv4: ::ffff:192.168.1.1 -> 192.168.1.1
        ip = ip.substring(7);
    } else if (ip && ip.includes(':') && ip.length > 20) {
        // IPv6 thật: rút gọn để dễ đọc
        // 2402:800:62a7:80c2:41c3:3905:7f89:dc06 -> 2402:800:...:dc06
        const parts = ip.split(':');
        if (parts.length > 4) {
            ip = `${parts[0]}:${parts[1]}:...${parts[parts.length-1]}`;
        }
    }
    
    return ip;
}

// Middleware để log đăng nhập thành công
const logSuccessfulLogin = async (req, res, next) => {
    try {
        if (req.user) {
            // Tự động đánh dấu các session cũ của user này là inactive
            const oldSessions = await LoginLog.find({
                user: req.user._id,
                isActive: true,
                logoutTime: { $exists: false }
            });
            
            for (const session of oldSessions) {
                const sessionDuration = Math.floor((Date.now() - session.loginTime.getTime()) / (1000 * 60));
                await LoginLog.updateOne(
                    { _id: session._id },
                    {
                        $set: {
                            isActive: false,
                            logoutTime: new Date(),
                            sessionDuration: sessionDuration,
                            notes: 'Auto-logged out due to new login'
                        }
                    }
                );
            }
            
            const ipAddress = getClientIP(req);
            const uaHeader = req.get('User-Agent');
            const userAgent = (uaHeader && uaHeader.trim()) ? uaHeader : 'unknown';
            const deviceInfo = parseUserAgent(userAgent);
            
            // Tạo session ID unique
            const sessionId = req.sessionID || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            
            // Kiểm tra hoạt động đáng ngờ
            const suspiciousActivity = await LoginLog.detectSuspiciousActivity(req.user._id, ipAddress);
            const riskLevel = suspiciousActivity.length > 0 ? 'high' : 'low';

            // Gửi cảnh báo Slack nếu high risk và có webhook
            try {
                if (riskLevel === 'high' && process.env.SLACK_WEBHOOK_URL) {
                    const fetch = require('node-fetch');
                    const text = `:warning: High risk login detected for ${req.user.email} from IP ${ipAddress}`;
                    await fetch(process.env.SLACK_WEBHOOK_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text })
                    });
                }
            } catch (e) {
                console.warn('Slack notify error (ignored):', e?.message);
            }
            
            const payload = {
                user: req.user._id,
                username: req.user.username || req.user.email || String(req.user._id),
                loginTime: new Date(),
                ipAddress: ipAddress,
                userAgent: userAgent,
                loginStatus: 'success',
                sessionId: sessionId,
                deviceInfo: deviceInfo,
                riskLevel: riskLevel,
                isActive: true
            };
            console.log('🟢 Attempting to save successful login log with payload:', payload);
            
            const loginLog = new LoginLog(payload);
            const savedLog = await loginLog.save();
            
            // Lưu loginLogId vào session để có thể update khi logout
            req.session.loginLogId = savedLog._id;
            
            console.log(`✅ Login logged (success) for user: ${req.user.username || req.user.email} from IP: ${ipAddress}`);
            console.log('📝 LoginLog saved with ID:', savedLog._id, 'status:', savedLog.loginStatus);
        }
    } catch (error) {
        console.error('❌ Error logging successful login. Details:', {
            message: error?.message,
            name: error?.name,
            code: error?.code,
        }, error);
        // Không throw error để không ảnh hưởng đến quá trình đăng nhập
    }
    
    next();
};

// Middleware để log đăng nhập thất bại
const logFailedLogin = async (username, req, reason = 'Invalid credentials') => {
    try {
        const ipAddress = getClientIP(req);
        const uaHeader = req.get('User-Agent');
        const userAgent = (uaHeader && uaHeader.trim()) ? uaHeader : 'unknown';
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
