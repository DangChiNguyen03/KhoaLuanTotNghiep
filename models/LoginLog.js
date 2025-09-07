const mongoose = require('mongoose');

const loginLogSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    username: {
        type: String,
        required: true
    },
    loginTime: {
        type: Date,
        default: Date.now
    },
    ipAddress: {
        type: String,
        required: true
    },
    userAgent: {
        type: String,
        required: true
    },
    loginStatus: {
        type: String,
        enum: ['success', 'failed'],
        required: true
    },
    failureReason: {
        type: String,
        required: function() {
            return this.loginStatus === 'failed';
        }
    },
    sessionId: {
        type: String
    },
    logoutTime: {
        type: Date
    },
    sessionDuration: {
        type: Number // in minutes
    },
    deviceInfo: {
        browser: String,
        os: String,
        device: String
    },
    location: {
        country: String,
        city: String,
        region: String
    },
    isActive: {
        type: Boolean,
        default: true
    },
    riskLevel: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'low'
    },
    notes: {
        type: String
    }
}, {
    timestamps: true
});

// Index để tối ưu tìm kiếm
loginLogSchema.index({ user: 1, loginTime: -1 });
loginLogSchema.index({ ipAddress: 1 });
loginLogSchema.index({ loginStatus: 1 });
loginLogSchema.index({ loginTime: -1 });

// Virtual để tính session duration
loginLogSchema.virtual('sessionDurationFormatted').get(function() {
    if (!this.sessionDuration) return 'N/A';
    
    const hours = Math.floor(this.sessionDuration / 60);
    const minutes = this.sessionDuration % 60;
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
});

// Method để đánh dấu logout
loginLogSchema.methods.markLogout = function() {
    this.logoutTime = new Date();
    this.sessionDuration = Math.floor((this.logoutTime - this.loginTime) / (1000 * 60)); // minutes
    this.isActive = false;
    return this.save();
};

// Static method để tìm các session đang hoạt động
loginLogSchema.statics.getActiveSessions = function(userId) {
    return this.find({
        user: userId,
        isActive: true,
        loginStatus: 'success'
    }).sort({ loginTime: -1 });
};

// Static method để phát hiện đăng nhập bất thường
loginLogSchema.statics.detectSuspiciousActivity = function(userId, ipAddress) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    return this.aggregate([
        {
            $match: {
                user: new mongoose.Types.ObjectId(userId),
                loginTime: { $gte: oneHourAgo }
            }
        },
        {
            $group: {
                _id: '$ipAddress',
                count: { $sum: 1 },
                failedAttempts: {
                    $sum: { $cond: [{ $eq: ['$loginStatus', 'failed'] }, 1, 0] }
                }
            }
        },
        {
            $match: {
                $or: [
                    { failedAttempts: { $gte: 3 } }, // 3+ failed attempts
                    { count: { $gte: 10 } } // 10+ login attempts
                ]
            }
        }
    ]);
};

module.exports = mongoose.model('LoginLog', loginLogSchema);
