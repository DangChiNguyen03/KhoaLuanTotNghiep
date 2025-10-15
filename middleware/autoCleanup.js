const LoginLog = require('../models/LoginLog');
const AuditLog = require('../models/AuditLog');

// Cấu hình retention (có thể đọc từ env)
const RETENTION_CONFIG = {
    LOGIN_LOGS_DAYS: Number(process.env.LOGIN_LOG_RETENTION_DAYS || 30),
    AUDIT_LOGS_DAYS: Number(process.env.AUDIT_LOG_RETENTION_DAYS || 90)
};

// Auto cleanup login logs cũ
const cleanupLoginLogs = async () => {
    try {
        const cutoffDate = new Date(Date.now() - RETENTION_CONFIG.LOGIN_LOGS_DAYS * 24 * 60 * 60 * 1000);
        const result = await LoginLog.deleteMany({ 
            loginTime: { $lt: cutoffDate } 
        });
        
        if (result.deletedCount > 0) {
            console.log(`🧹 Auto-cleanup: Deleted ${result.deletedCount} login logs older than ${RETENTION_CONFIG.LOGIN_LOGS_DAYS} days`);
        }
        
        return result.deletedCount;
    } catch (error) {
        console.error('❌ Error cleaning up login logs:', error);
        return 0;
    }
};

// Auto cleanup audit logs cũ
const cleanupAuditLogs = async () => {
    try {
        const cutoffDate = new Date(Date.now() - RETENTION_CONFIG.AUDIT_LOGS_DAYS * 24 * 60 * 60 * 1000);
        const result = await AuditLog.deleteMany({ 
            timestamp: { $lt: cutoffDate } 
        });
        
        if (result.deletedCount > 0) {
            console.log(`🧹 Auto-cleanup: Deleted ${result.deletedCount} audit logs older than ${RETENTION_CONFIG.AUDIT_LOGS_DAYS} days`);
        }
        
        return result.deletedCount;
    } catch (error) {
        console.error('❌ Error cleaning up audit logs:', error);
        return 0;
    }
};

// Cleanup tất cả
const performAutoCleanup = async () => {
    console.log('🕐 Starting auto-cleanup process...');
    
    const loginLogsDeleted = await cleanupLoginLogs();
    const auditLogsDeleted = await cleanupAuditLogs();
    
    const totalDeleted = loginLogsDeleted + auditLogsDeleted;
    
    if (totalDeleted > 0) {
        console.log(`✅ Auto-cleanup completed: ${totalDeleted} records deleted`);
    } else {
        console.log('✅ Auto-cleanup completed: No old records to delete');
    }
    
    return {
        loginLogsDeleted,
        auditLogsDeleted,
        totalDeleted
    };
};

// Middleware để chạy cleanup định kỳ
const autoCleanupMiddleware = () => {
    // Chạy cleanup ngay khi khởi động
    setTimeout(performAutoCleanup, 5000); // Delay 5s để đảm bảo DB connected
    
    // Chạy cleanup mỗi 24 giờ (86400000 ms)
    const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
    
    setInterval(async () => {
        await performAutoCleanup();
    }, CLEANUP_INTERVAL);
    
    console.log(`🔄 Auto-cleanup scheduled every 24 hours`);
    console.log(`📅 Login logs retention: ${RETENTION_CONFIG.LOGIN_LOGS_DAYS} days`);
    console.log(`📅 Audit logs retention: ${RETENTION_CONFIG.AUDIT_LOGS_DAYS} days`);
};

module.exports = {
    performAutoCleanup,
    cleanupLoginLogs,
    cleanupAuditLogs,
    autoCleanupMiddleware,
    RETENTION_CONFIG
};
