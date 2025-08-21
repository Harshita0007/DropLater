const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized',
      details: ['Missing or invalid Authorization header']
    });
  }
  
  const token = authHeader.substring(7); 
  const expectedToken = process.env.ADMIN_TOKEN;
  
  if (!expectedToken) {
    console.error('ADMIN_TOKEN environment variable not set');
    return res.status(500).json({
      error: 'Server configuration error',
      details: ['Authentication not properly configured']
    });
  }
  
  if (token !== expectedToken) {
    return res.status(401).json({
      error: 'Unauthorized', 
      details: ['Invalid authentication token']
    });
  }
  
  next();
};


module.exports = authMiddleware;