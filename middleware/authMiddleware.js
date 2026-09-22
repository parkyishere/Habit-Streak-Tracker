const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Access token missing' });
  }

  const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey123';

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      // PRINT THE EXACT ERROR REASON TO NODEMON TERMINAL
      console.error('[ERROR] JWT Verification Error:', err.message);
      return res.status(403).json({ success: false, error: 'Invalid or expired token' });
    }

    console.log('[AUTH] Token Verified Successfully for User ID:', decoded.id);
    req.user = decoded;
    next();
  });
};