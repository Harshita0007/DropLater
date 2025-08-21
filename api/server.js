const express = require('express');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
require('dotenv').config();

const notesRouter = require('./routes/notes');
const authMiddleware = require('./middleware/auth');

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(cors());

const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, 
  max: 60, 
  message: {
    error: 'Too many requests',
    details: ['Rate limit exceeded. Please try again later.']
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);


app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url} from ${req.ip}`);
  next();
});


app.get('/health', (req, res) => {
  res.json({ ok: true });
});
app.use('/api/notes', authMiddleware, notesRouter);


app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    details: [`Route ${req.method} ${req.originalUrl} not found`]
  });
});


app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? [err.message] : ['Something went wrong']
  });
});

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://mongo:27017/droplater');
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};


const PORT = process.env.PORT || 3000;

const startServer = async () => {
  await connectDB();
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(` DropLater API Server running on port ${PORT}`);
    console.log(' Available endpoints:');
    console.log('  PUBLIC:');
    console.log('    GET  /health                    - Health check');
    console.log('  PROTECTED (requires Bearer token):');
    console.log('    POST /api/notes                 - Create note');
    console.log('    GET  /api/notes?status=&page=   - List notes (paginated)');
    console.log('    POST /api/notes/:id/replay      - Replay failed/dead note');
    console.log(' Rate limit: 60 requests per minute per IP');
    console.log(' Auth: Bearer token from ADMIN_TOKEN env var');
  });
};

startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});