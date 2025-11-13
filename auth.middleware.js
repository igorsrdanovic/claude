const path = require('path');

// Middleware to require authentication
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// Middleware to attach user to request
function attachUser(req, res, next) {
  if (req.session && req.session.userId) {
    req.user = {
      id: req.session.userId,
      email: req.session.email,
      name: req.session.name
    };
  }
  next();
}

// Get user's vault path
function getUserVaultPath(userId, vaultsBasePath) {
  return path.join(vaultsBasePath, `user-${userId}`);
}

// Rate limiting for magic links
const rateLimits = new Map();

function checkMagicLinkRateLimit(email) {
  const key = email.toLowerCase();
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  const maxRequests = 3;

  if (!rateLimits.has(key)) {
    rateLimits.set(key, []);
  }

  const requests = rateLimits.get(key);

  // Remove old requests outside the time window
  const recentRequests = requests.filter(timestamp => now - timestamp < windowMs);
  rateLimits.set(key, recentRequests);

  if (recentRequests.length >= maxRequests) {
    return false; // Rate limit exceeded
  }

  // Add current request
  recentRequests.push(now);
  rateLimits.set(key, recentRequests);

  return true; // Within rate limit
}

// Clean up old rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;

  for (const [email, requests] of rateLimits.entries()) {
    const recentRequests = requests.filter(timestamp => now - timestamp < windowMs);
    if (recentRequests.length === 0) {
      rateLimits.delete(email);
    } else {
      rateLimits.set(email, recentRequests);
    }
  }
}, 10 * 60 * 1000); // Clean up every 10 minutes

module.exports = {
  requireAuth,
  attachUser,
  getUserVaultPath,
  checkMagicLinkRateLimit
};
