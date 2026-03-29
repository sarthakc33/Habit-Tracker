const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'reality_check_secret_key_123';

const authMiddleware = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { userId, username }
    next();
  } catch (ex) {
    res.status(401).json({ error: 'Invalid token.' });
  }
};

// Export both the middleware AND the secret so authController can use it
authMiddleware.JWT_SECRET = JWT_SECRET;
module.exports = authMiddleware;
