const WINDOW_MS = 15 * 60 * 1000; // 15 phút
const MAX_ATTEMPTS = 10; // tối đa 10 lần/15 phút cho mỗi IP+username

const attemptsStore = new Map();

function getClientIP(req) {
    let ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
             req.headers['x-real-ip'] ||
             req.headers['x-client-ip'] ||
             req.ip ||
             req.connection?.remoteAddress ||
             req.socket?.remoteAddress ||
             '127.0.0.1';
    
    // Chuyển đổi IPv6 thành IPv4
    if (ip === '::1') {
        ip = '127.0.0.1';
    } else if (ip && ip.startsWith('::ffff:')) {
        ip = ip.substring(7);
    }
    
    return ip;
}

function cleanupExpired(now) {
    for (const [key, list] of attemptsStore.entries()) {
        const filtered = list.filter(ts => now - ts < WINDOW_MS);
        if (filtered.length === 0) {
            attemptsStore.delete(key);
        } else {
            attemptsStore.set(key, filtered);
        }
    }
}

// Rate limit riêng cho đăng nhập
const loginRateLimiter = (req, res, next) => {
    const now = Date.now();
    cleanupExpired(now);

    const username = (req.body?.email || req.body?.username || '').toLowerCase();
    const ip = getClientIP(req);
    const key = `${ip}:${username}`;

    const list = attemptsStore.get(key) || [];
    if (list.length >= MAX_ATTEMPTS) {
        const retryAfterSec = Math.ceil((WINDOW_MS - (now - list[0])) / 1000);
        res.set('Retry-After', String(retryAfterSec));
        return res.status(429).json({ message: 'Quá nhiều lần thử đăng nhập. Vui lòng thử lại sau.', retryAfterSec });
    }

    list.push(now);
    attemptsStore.set(key, list);
    next();
};

module.exports = { loginRateLimiter };


