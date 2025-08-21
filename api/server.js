// api/server.js - Complete implementation per assignment requirements
const express = require('express');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
require('dotenv').config();

// Import routes and middleware
const notesRouter = require('./routes/notes');
const authMiddleware = require('./middleware/auth');

const app = express();

// Basic middleware
app.use(express.json({ limit: '10mb' }));
app.use(cors());

// Rate limiting - 60 req/min per IP as specified in assignment
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute per IP
  message: {
    error: 'Too many requests',
    details: ['Rate limit exceeded. Please try again later.']
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url} from ${req.ip}`);
  next();
});

// PUBLIC ENDPOINTS (no auth required)
// GET /health - returns { ok: true }
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// PROTECTED ENDPOINTS (require Bearer token)
// All /api/notes routes require authentication
app.use('/api/notes', authMiddleware, notesRouter);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    details: [`Route ${req.method} ${req.originalUrl} not found`]
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? [err.message] : ['Something went wrong']
  });
});

// Database connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://mongo:27017/droplater');
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Start server
const PORT = process.env.PORT || 3000;

const startServer = async () => {
  await connectDB();
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 DropLater API Server running on port ${PORT}`);
    console.log('📋 Available endpoints:');
    console.log('  PUBLIC:');
    console.log('    GET  /health                    - Health check');
    console.log('  PROTECTED (requires Bearer token):');
    console.log('    POST /api/notes                 - Create note');
    console.log('    GET  /api/notes?status=&page=   - List notes (paginated)');
    console.log('    POST /api/notes/:id/replay      - Replay failed/dead note');
    console.log('💡 Rate limit: 60 requests per minute per IP');
    console.log('🔐 Auth: Bearer token from ADMIN_TOKEN env var');
  });
};

startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});