const logger = (req, res, next) => {
    const timestamp = new Date().toISOString();
    const method = req.method;
    const url = req.url;
    
    // Lấy IP và chuyển đổi IPv6 sang IPv4
    let ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
             req.headers['x-real-ip'] ||
             req.ip ||
             req.connection?.remoteAddress ||
             '127.0.0.1';
    
    // Chuyển đổi IPv6 thành IPv4
    if (ip === '::1') {
        ip = '127.0.0.1';
    } else if (ip && ip.startsWith('::ffff:')) {
        ip = ip.substring(7);
    }
    
    const userAgent = req.headers['user-agent'];

    console.log(`[${timestamp}] ${method} ${url} - IP: ${ip} - User-Agent: ${userAgent}`);
    next();
};

module.exports = logger;
