// A tiny in-memory rate limiter (no extra package needed).
module.exports = function rateLimit({ windowMs, max, message }) {
    const hits = new Map(); // ip -> { count, resetAt }

    setInterval(() => {
        const now = Date.now();
        for (const [key, v] of hits)
            if (v.resetAt <= now) hits.delete(key);
    }, windowMs).unref();

    return function limiter(req, res, next) {
        if (process.env.RATE_LIMIT_DISABLED === "1") return next();

        const now = Date.now();
        const key = req.ip || "unknown";
        let entry = hits.get(key);

        if (!entry || entry.resetAt <= now) {
            entry = { count: 0, resetAt: now + windowMs };
            hits.set(key, entry);
        }

        entry.count++;

        if (entry.count > max) {
            res.set("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
            return res.status(429).json({
                success: false,
                message: message || "Too many attempts. Please try again later.",
            });
        }
        next();
    };
};