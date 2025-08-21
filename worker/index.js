require('dotenv').config();
const { Worker } = require('bullmq');
const Redis = require('ioredis');
const mongoose = require('mongoose');
const axios = require('axios');
const crypto = require('crypto');
const pino = require('pino');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');

dayjs.extend(utc);

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

// Note model (copied from API)
const noteSchema = new mongoose.Schema({
  title: { type: String, required: true },
  body: { type: String, required: true },
  releaseAt: { type: Date, required: true },
  webhookUrl: { type: String, required: true },
  status: {
    type: String,
    enum: ['pending', 'delivered', 'failed', 'dead'],
    default: 'pending'
  },
  attempts: [{
    at: { type: Date, required: true },
    statusCode: { type: Number, required: true },
    ok: { type: Boolean, required: true },
    error: { type: String, required: false }
  }],
  deliveredAt: { type: Date, default: null }
}, { timestamps: true });

const Note = mongoose.model('Note', noteSchema);

// Redis connection
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3
});

// Generate idempotency key
const generateIdempotencyKey = (noteId, releaseAt) => {
  const data = `${noteId}:${releaseAt}`;
  return crypto.createHash('sha256').update(data).digest('hex');
};

// Delivery function
const deliverNote = async (job) => {
  const { noteId } = job.data;
  const startTime = Date.now();
  
  logger.info({ noteId, attempt: job.attemptsMade + 1 }, 'Starting delivery attempt');
  
  try {
    const note = await Note.findById(noteId);
    if (!note) {
      throw new Error(`Note ${noteId} not found`);
    }
    
    if (note.status === 'delivered') {
      logger.info({ noteId }, 'Note already delivered, skipping');
      return;
    }
    
    // Generate idempotency key
    const idempotencyKey = generateIdempotencyKey(noteId, note.releaseAt.toISOString());
    
    // Prepare payload
    const payload = {
      id: noteId,
      title: note.title,
      body: note.body,
      releaseAt: note.releaseAt.toISOString(),
      deliveredAt: dayjs.utc().toISOString()
    };
    
    const headers = {
      'Content-Type': 'application/json',
      'X-Note-Id': noteId,
      'X-Idempotency-Key': idempotencyKey
    };
    
    // Make HTTP request
    const response = await axios.post(note.webhookUrl, payload, {
      headers,
      timeout: 30000, // 30 second timeout
      validateStatus: (status) => status < 500 // Don't throw on 4xx errors
    });
    
    const duration = Date.now() - startTime;
    const attempt = {
      at: new Date(),
      statusCode: response.status,
      ok: response.status >= 200 && response.status < 300,
      error: response.status >= 400 ? `HTTP ${response.status}` : undefined
    };
    
    // Update note with attempt
    note.attempts.push(attempt);
    
    if (attempt.ok) {
      // Success - mark as delivered
      note.status = 'delivered';
      note.deliveredAt = new Date();
      await note.save();
      
      logger.info({
        noteId,
        statusCode: response.status,
        duration,
        attempt: job.attemptsMade + 1
      }, 'Note delivered successfully');
    } else {
      // HTTP error - will retry or fail
      note.status = 'failed';
      await note.save();
      
      logger.warn({
        noteId,
        statusCode: response.status,
        duration,
        attempt: job.attemptsMade + 1,
        error: attempt.error
      }, 'Delivery failed with HTTP error');
      
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // Record attempt
    try {
      const note = await Note.findById(noteId);
      if (note) {
        const attempt = {
          at: new Date(),
          statusCode: 0,
          ok: false,
          error: error.message
        };
        
        note.attempts.push(attempt);
        
        // Check if this is the final attempt
        if (job.attemptsMade + 1 >= 3) {
          note.status = 'dead';
          logger.error({
            noteId,
            duration,
            attempt: job.attemptsMade + 1,
            error: error.message
          }, 'Note marked as dead after max attempts');
        } else {
          note.status = 'failed';
        }
        
        await note.save();
      }
    } catch (updateError) {
      logger.error({ noteId, error: updateError.message }, 'Failed to update note with error attempt');
    }
    
    logger.error({
      noteId,
      duration,
      attempt: job.attemptsMade + 1,
      error: error.message
    }, 'Delivery attempt failed');
    
    throw error; // Re-throw to trigger retry
  }
};

// Create worker
const worker = new Worker('delivery', deliverNote, {
  connection: redis,
  concurrency: 5,
  settings: {
    retryProcessDelay: 1000,
  }
});

// Worker event handlers
worker.on('completed', (job) => {
  logger.info({ jobId: job.id, noteId: job.data.noteId }, 'Job completed successfully');
});

worker.on('failed', (job, err) => {
  logger.error({ 
    jobId: job?.id, 
    noteId: job?.data?.noteId, 
    error: err.message,
    attempts: job?.attemptsMade
  }, 'Job failed');
});

worker.on('error', (err) => {
  logger.error({ error: err.message }, 'Worker error');
});

// Polling mechanism for due notes (alternative approach)
const pollForDueNotes = async () => {
  try {
    const now = new Date();
    const dueNotes = await Note.find({
      status: 'pending',
      releaseAt: { $lte: now }
    }).limit(100);
    
    if (dueNotes.length > 0) {
      logger.info({ count: dueNotes.length }, 'Found due notes via polling');
      
      // Add jobs for due notes
      const jobs = dueNotes.map(note => ({
        name: 'deliver-note',
        data: { noteId: note._id.toString() },
        opts: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            settings: { delay: 1000 }
          }
        }
      }));
      
      const queue = new (require('bullmq').Queue)('delivery', { connection: redis });
      await queue.addBulk(jobs);
    }
  } catch (error) {
    logger.error({ error: error.message }, 'Error in polling for due notes');
  }
};

// Start polling every 5 seconds
const pollInterval = setInterval(pollForDueNotes, 5000);

// Connect to MongoDB
async function startWorker() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    logger.info('Worker connected to MongoDB');
    
    logger.info('Worker started successfully');
  } catch (error) {
    logger.error(error, 'Failed to start worker');
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down worker gracefully...');
  clearInterval(pollInterval);
  await worker.close();
  await redis.quit();
  await mongoose.connection.close();
  process.exit(0);
});

process.on('unhandledRejection', (err) => {
  logger.error(err, 'Unhandled promise rejection in worker');
});

process.on('uncaughtException', (err) => {
  logger.error(err, 'Uncaught exception in worker');
  process.exit(1);
});

startWorker();