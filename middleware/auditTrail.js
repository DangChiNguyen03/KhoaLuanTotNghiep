const AuditLog = require('../models/AuditLog');

// Helper function to get client IP (compatible with proxy/load balancer)
const getClientIP = (req) => {
    // Ưu tiên các headers từ proxy/load balancer (cho production deployment)
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
    }
    
    return ip;
};

// Helper function to extract relevant data from request body
const extractRelevantData = (body, sensitiveFields = ['password', 'newPassword']) => {
    const cleanData = { ...body };
    sensitiveFields.forEach(field => {
        if (cleanData[field]) {
            cleanData[field] = '[HIDDEN]';
        }
    });
    return cleanData;
};

// Main audit logging function
const logAuditAction = async (req, action, resourceType, resourceId = null, details = {}, oldValues = {}, newValues = {}, status = 'success', errorMessage = null) => {
    try {
        if (!req.user) {
            console.warn('Audit log skipped: No user in request');
            return;
        }

        const auditData = {
            user: req.user._id,
            action,
            resourceType,
            resourceId,
            details: extractRelevantData(details),
            oldValues: extractRelevantData(oldValues),
            newValues: extractRelevantData(newValues),
            ipAddress: getClientIP(req),
            userAgent: req.get('User-Agent') || '',
            method: req.method,
            endpoint: req.originalUrl || req.url,
            status,
            errorMessage,
            timestamp: new Date()
        };

        await AuditLog.logAction(auditData);
    } catch (error) {
        console.error('Error in audit logging:', error);
        // Don't throw error to prevent breaking the main operation
    }
};

// Middleware for automatic audit logging based on route patterns
const auditMiddleware = (action, resourceType) => {
    return (req, res, next) => {
        // Store original json and send methods
        const originalJson = res.json;
        const originalSend = res.send;
        
        // Override res.json to capture response
        res.json = function(data) {
            // Log the action after successful response
            if (res.statusCode >= 200 && res.statusCode < 300) {
                setImmediate(() => {
                    logAuditAction(
                        req, 
                        action, 
                        resourceType, 
                        req.params.id || data?._id || data?.id,
                        { 
                            requestBody: req.body,
                            responseData: typeof data === 'object' ? { success: true } : data
                        }
                    );
                });
            } else {
                setImmediate(() => {
                    logAuditAction(
                        req, 
                        action, 
                        resourceType, 
                        req.params.id,
                        { requestBody: req.body },
                        {},
                        {},
                        'failed',
                        data?.error || 'Operation failed'
                    );
                });
            }
            
            return originalJson.call(this, data);
        };
        
        // Override res.send for redirect responses
        res.send = function(data) {
            if (res.statusCode >= 200 && res.statusCode < 400) {
                setImmediate(() => {
                    logAuditAction(
                        req, 
                        action, 
                        resourceType, 
                        req.params.id,
                        { requestBody: req.body }
                    );
                });
            }
            
            return originalSend.call(this, data);
        };
        
        next();
    };
};

// Specific audit functions for common actions
const auditUserAction = (action) => auditMiddleware(action, 'User');
const auditProductAction = (action) => auditMiddleware(action, 'Product');
const auditOrderAction = (action) => auditMiddleware(action, 'Order');
const auditCustomerAction = (action) => auditMiddleware(action, 'Customer');
const auditPaymentAction = (action) => auditMiddleware(action, 'Payment');
const auditSystemAction = (action) => auditMiddleware(action, 'System');

// Manual audit logging functions (for use in route handlers)
const auditLogin = (req, success = true, errorMessage = null) => {
    return logAuditAction(
        req,
        success ? 'login' : 'login_failed',
        'System',
        null,
        { 
            email: req.body.email,
            loginMethod: req.body.loginMethod || 'local'
        },
        {},
        {},
        success ? 'success' : 'failed',
        errorMessage
    );
};

const auditLogout = (req) => {
    return logAuditAction(
        req,
        'logout',
        'System',
        null,
        { sessionDuration: req.session?.loginTime ? Date.now() - req.session.loginTime : null }
    );
};

const auditPasswordReset = (req, targetUserId, success = true) => {
    return logAuditAction(
        req,
        'password_reset',
        'User',
        targetUserId,
        { resetBy: req.user._id },
        {},
        {},
        success ? 'success' : 'failed'
    );
};

const auditRoleChange = (req, targetUserId, oldRole, newRole) => {
    return logAuditAction(
        req,
        'role_changed',
        'User',
        targetUserId,
        { changedBy: req.user._id },
        { role: oldRole },
        { role: newRole }
    );
};

const auditPermissionsUpdate = (req, targetUserId, oldPermissions, newPermissions) => {
    return logAuditAction(
        req,
        'permissions_updated',
        'User',
        targetUserId,
        { updatedBy: req.user._id },
        { permissions: oldPermissions },
        { permissions: newPermissions }
    );
};

const auditStatusChange = (req, resourceType, resourceId, oldStatus, newStatus) => {
    const actionMap = {
        'User': 'user_status_changed',
        'Order': 'order_status_changed',
        'Product': 'product_status_changed'
    };
    
    return logAuditAction(
        req,
        actionMap[resourceType] || 'status_changed',
        resourceType,
        resourceId,
        { changedBy: req.user._id },
        { status: oldStatus },
        { status: newStatus }
    );
};

const auditDataExport = (req, exportType, recordCount) => {
    return logAuditAction(
        req,
        'data_export',
        'System',
        null,
        { 
            exportType,
            recordCount,
            exportedBy: req.user._id
        }
    );
};

const auditSettingsChange = (req, settingName, oldValue, newValue) => {
    return logAuditAction(
        req,
        'settings_changed',
        'System',
        null,
        { 
            settingName,
            changedBy: req.user._id
        },
        { [settingName]: oldValue },
        { [settingName]: newValue }
    );
};

module.exports = {
    logAuditAction,
    auditMiddleware,
    auditUserAction,
    auditProductAction,
    auditOrderAction,
    auditCustomerAction,
    auditPaymentAction,
    auditSystemAction,
    auditLogin,
    auditLogout,
    auditPasswordReset,
    auditRoleChange,
    auditPermissionsUpdate,
    auditStatusChange,
    auditDataExport,
    auditSettingsChange
};
