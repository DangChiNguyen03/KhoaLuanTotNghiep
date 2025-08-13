const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
    // User who performed the action
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    
    // Action performed
    action: {
        type: String,
        required: true,
        enum: [
            // User management actions
            'user_created', 'user_updated', 'user_deleted', 'user_activated', 'user_deactivated',
            'password_reset', 'role_changed', 'permissions_updated',
            
            // Product management actions
            'product_created', 'product_updated', 'product_deleted', 'product_price_changed',
            
            // Order management actions
            'order_created', 'order_updated', 'order_status_changed', 'order_cancelled',
            
            // Customer management actions
            'customer_created', 'customer_updated', 'customer_deleted',
            
            // Payment management actions
            'payment_created', 'payment_updated', 'payment_method_created', 'payment_method_updated',
            
            // System actions
            'login', 'logout', 'login_failed', 'data_export', 'data_import', 'settings_changed'
        ]
    },
    
    // Resource type being acted upon
    resourceType: {
        type: String,
        required: true,
        enum: ['User', 'Product', 'Order', 'Customer', 'Payment', 'PaymentMethod', 'System']
    },
    
    // ID of the resource being acted upon
    resourceId: {
        type: mongoose.Schema.Types.ObjectId,
        required: false // Some actions like login don't have a specific resource
    },
    
    // Details about what changed
    details: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    
    // Previous values (for updates)
    oldValues: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    
    // New values (for updates)
    newValues: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    
    // IP address of the user
    ipAddress: {
        type: String,
        required: true
    },
    
    // User agent
    userAgent: {
        type: String,
        required: false
    },
    
    // HTTP method and endpoint
    method: {
        type: String,
        required: false
    },
    
    endpoint: {
        type: String,
        required: false
    },
    
    // Status of the action
    status: {
        type: String,
        enum: ['success', 'failed', 'error'],
        default: 'success'
    },
    
    // Error message if action failed
    errorMessage: {
        type: String,
        required: false
    },
    
    // Timestamp
    timestamp: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Indexes for better query performance
auditLogSchema.index({ user: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ resourceType: 1, resourceId: 1, timestamp: -1 });
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ ipAddress: 1, timestamp: -1 });

// Static method to log an action
auditLogSchema.statics.logAction = async function(logData) {
    try {
        const auditLog = new this(logData);
        await auditLog.save();
        return auditLog;
    } catch (error) {
        console.error('Error saving audit log:', error);
        // Don't throw error to prevent breaking the main operation
        return null;
    }
};

// Static method to get user activity
auditLogSchema.statics.getUserActivity = async function(userId, options = {}) {
    const {
        limit = 50,
        skip = 0,
        action = null,
        resourceType = null,
        startDate = null,
        endDate = null
    } = options;
    
    const query = { user: userId };
    
    if (action) query.action = action;
    if (resourceType) query.resourceType = resourceType;
    if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);
    }
    
    return this.find(query)
        .populate('user', 'name email role')
        .sort({ timestamp: -1 })
        .limit(limit)
        .skip(skip);
};

// Static method to get system activity summary
auditLogSchema.statics.getActivitySummary = async function(options = {}) {
    const {
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
        endDate = new Date()
    } = options;
    
    return this.aggregate([
        {
            $match: {
                timestamp: { $gte: startDate, $lte: endDate }
            }
        },
        {
            $group: {
                _id: {
                    action: '$action',
                    date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } }
                },
                count: { $sum: 1 }
            }
        },
        {
            $group: {
                _id: '$_id.action',
                totalCount: { $sum: '$count' },
                dailyActivity: {
                    $push: {
                        date: '$_id.date',
                        count: '$count'
                    }
                }
            }
        },
        {
            $sort: { totalCount: -1 }
        }
    ]);
};

// Static method to detect suspicious activity
auditLogSchema.statics.detectSuspiciousActivity = async function(options = {}) {
    const {
        timeWindow = 60, // minutes
        threshold = 10 // number of actions
    } = options;
    
    const startTime = new Date(Date.now() - timeWindow * 60 * 1000);
    
    return this.aggregate([
        {
            $match: {
                timestamp: { $gte: startTime }
            }
        },
        {
            $group: {
                _id: {
                    user: '$user',
                    ipAddress: '$ipAddress'
                },
                actionCount: { $sum: 1 },
                actions: { $push: '$action' },
                firstAction: { $min: '$timestamp' },
                lastAction: { $max: '$timestamp' }
            }
        },
        {
            $match: {
                actionCount: { $gte: threshold }
            }
        },
        {
            $lookup: {
                from: 'users',
                localField: '_id.user',
                foreignField: '_id',
                as: 'userInfo'
            }
        },
        {
            $unwind: '$userInfo'
        },
        {
            $project: {
                user: '$userInfo',
                ipAddress: '$_id.ipAddress',
                actionCount: 1,
                actions: 1,
                firstAction: 1,
                lastAction: 1,
                timeSpan: {
                    $divide: [
                        { $subtract: ['$lastAction', '$firstAction'] },
                        1000 * 60 // Convert to minutes
                    ]
                }
            }
        },
        {
            $sort: { actionCount: -1 }
        }
    ]);
};

module.exports = mongoose.model('AuditLog', auditLogSchema);
