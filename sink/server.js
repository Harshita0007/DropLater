require('dotenv').config();
const express = require('express');
const Redis = require('ioredis');
const pino = require('pino');

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

const app = express();
const PORT = process.env.PORT || 4000;

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3
});

app.use(express.json({ limit: '10mb' }));

const shouldFail = process.env.SINK_SIMULATE_FAILURE === 'true';

app.post('/sink', async (req, res) => {
  const idempotencyKey = req.headers['x-idempotency-key'];
  const noteId = req.headers['x-note-id'];
  
  if (!idempotencyKey) {
    logger.warn({ noteId }, 'Missing idempotency key');
    return res.status(400).json({
      error: 'Missing X-Idempotency-Key header'
    });
  }
  
  if (!noteId) {
    logger.warn({ idempotencyKey }, 'Missing note ID');
    return res.status(400).json({
      error: 'Missing X-Note-Id header'
    });
  }
  
  if (shouldFail) {
    logger.error({ noteId, idempotencyKey }, 'Simulating failure');
    return res.status(500).json({
      error: 'Simulated failure'
    });
  }
  
  try {
    const key = `idempotency:${idempotencyKey}`;
    const wasSet = await redis.setnx(key, '1');
    
    if (!wasSet) {
      logger.info({ noteId, idempotencyKey }, 'Duplicate request - already processed');
      return res.status(200).json({
        message: 'Already processed',
        duplicate: true
      });
    }
    
    await redis.expire(key, 86400);
    
    logger.info({
      noteId,
      idempotencyKey,
      title: req.body.title,
      deliveredAt: req.body.deliveredAt,
      body: req.body.body ? `${req.body.body.substring(0, 50)}...` : undefined
    }, 'Webhook received and processed');
    
    res.status(200).json({
      message: 'Webhook processed successfully',
      noteId,
      receivedAt: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error({ 
      error: error.message, 
      noteId, 
      idempotencyKey 
    }, 'Error processing webhook');
    
    res.status(500).json({
      error: 'Failed to process webhook'
    });
  }
});

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'sink' });
});

app.post('/toggle-failure', (req, res) => {
  process.env.SINK_SIMULATE_FAILURE = process.env.SINK_SIMULATE_FAILURE === 'true' ? 'false' : 'true';
  logger.info({ simulateFailure: process.env.SINK_SIMULATE_FAILURE }, 'Toggled failure simulation');
  res.json({ 
    message: 'Failure simulation toggled', 
    simulateFailure: process.env.SINK_SIMULATE_FAILURE === 'true'
  });
});

app.use((err, req, res, next) => {
  logger.error({ error: err.message }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error' });
});

app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

async function startSink() {
  try {
    redis.on('error', (err) => {
      logger.error({ error: err.message }, 'Redis error');
    });
    
    redis.on('connect', () => {
      logger.info('Sink connected to Redis');
    });
    
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`Sink server running on port ${PORT}`);
    });
  } catch (error) {
    logger.error(error, 'Failed to start sink');
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  logger.info('Shutting down sink gracefully...');
  await redis.quit();
  process.exit(0);
});

startSink();