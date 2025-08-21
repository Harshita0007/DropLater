// api/routes/notes.js - All endpoints as specified in assignment
const express = require('express');
const { z } = require('zod');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const Note = require('../models/Note');
const { Queue } = require('bullmq');
const { getRedisClient } = require('../config/redis');

dayjs.extend(utc);

const router = express.Router();

// Validation schemas as per assignment requirements
const createNoteSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  body: z.string().min(1).max(5000).trim(),
  releaseAt: z.string().datetime(), // ISO string format
  webhookUrl: z.string().url().refine(url => url.startsWith('http://') || url.startsWith('https://'), {
    message: 'Webhook URL must start with http:// or https://'
  })
});

const listNotesSchema = z.object({
  status: z.enum(['pending', 'delivered', 'failed', 'dead']).optional(),
  page: z.string().transform(val => parseInt(val) || 1).refine(val => val >= 1, {
    message: 'Page must be >= 1'
  }).optional().default('1')
});

// Initialize delivery queue
let deliveryQueue;
const initQueue = async () => {
  if (!deliveryQueue) {
    const redis = getRedisClient();
    deliveryQueue = new Queue('delivery', { 
      connection: redis,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50
      }
    });
  }
  return deliveryQueue;
};

// POST /api/notes - Create note
// Validates payload (title, body, releaseAt, webhookUrl) and returns created id
router.post('/', async (req, res) => {
  try {
    // Validate payload as specified in assignment
    const validatedData = createNoteSchema.parse(req.body);
    
    const note = new Note({
      title: validatedData.title,
      body: validatedData.body,
      releaseAt: new Date(validatedData.releaseAt),
      webhookUrl: validatedData.webhookUrl,
      status: 'pending',
      attempts: []
    });
    
    await note.save();
    
    // Initialize queue
    await initQueue();
    
    // Calculate delay for delivery
    const now = dayjs.utc();
    const releaseTime = dayjs.utc(validatedData.releaseAt);
    const delayMs = Math.max(0, releaseTime.diff(now));
    
    // Add job to queue with delay
    await deliveryQueue.add('deliver-note', 
      { noteId: note._id.toString() },
      { 
        delay: delayMs,
        attempts: 3,
        backoff: {
          type: 'exponential',
          settings: {
            delay: 1000
          }
        },
        jobId: `note-${note._id}-${note.releaseAt.getTime()}`
      }
    );
    
    console.log(`✅ Note created: ${note._id} (delivery in ${delayMs}ms)`);
    
    // Return the created id as specified
    res.status(201).json({ id: note._id });
    
  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: 'Invalid request data',
        details: error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`)
      });
    }
    
    console.error('Error creating note:', error);
    res.status(500).json({
      error: 'Failed to create note',
      details: ['Internal server error']
    });
  }
});

// GET /api/notes?status=&page= - List notes (paginated 20 per page)
router.get('/', async (req, res) => {
  try {
    const { status, page } = listNotesSchema.parse(req.query);
    const pageSize = 20; // As specified in assignment
    const skip = (parseInt(page) - 1) * pageSize;
    
    const filter = {};
    if (status) {
      filter.status = status;
    }
    
    const [notes, total] = await Promise.all([
      Note.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
      Note.countDocuments(filter)
    ]);
    
    res.json({
      notes: notes.map(note => ({
        id: note._id,
        title: note.title,
        body: note.body,
        releaseAt: note.releaseAt,
        webhookUrl: note.webhookUrl,
        status: note.status,
        attempts: note.attempts || [],
        deliveredAt: note.deliveredAt,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt
      })),
      pagination: {
        page: parseInt(page),
        pageSize,
        total,
        pages: Math.ceil(total / pageSize)
      }
    });
  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`)
      });
    }
    
    console.error('Error listing notes:', error);
    res.status(500).json({
      error: 'Failed to list notes',
      details: ['Internal server error']
    });
  }
});

// POST /api/notes/:id/replay - Requeue a note that failed or is dead
router.post('/:id/replay', async (req, res) => {
  try {
    const noteId = req.params.id;
    
    // Validate MongoDB ObjectId format
    if (!/^[0-9a-fA-F]{24}$/.test(noteId)) {
      return res.status(400).json({
        error: 'Invalid note ID format',
        details: ['Note ID must be a valid MongoDB ObjectId']
      });
    }
    
    const note = await Note.findById(noteId);
    if (!note) {
      return res.status(404).json({
        error: 'Note not found',
        details: ['No note found with the specified ID']
      });
    }
    
    // Only allow replay of failed or dead notes (as per assignment)
    if (note.status === 'delivered') {
      return res.status(400).json({
        error: 'Cannot replay delivered note',
        details: ['Note has already been successfully delivered']
      });
    }
    
    if (note.status === 'pending') {
      return res.status(400).json({
        error: 'Cannot replay pending note',
        details: ['Note is already pending delivery']
      });
    }
    
    // Reset note status to pending for replay
    note.status = 'pending';
    await note.save();
    
    // Initialize queue
    await initQueue();
    
    // Add job to queue immediately (no delay for replays)
    await deliveryQueue.add('deliver-note', 
      { noteId: noteId },
      { 
        attempts: 3,
        backoff: {
          type: 'exponential',
          settings: {
            delay: 1000
          }
        },
        jobId: `replay-${noteId}-${Date.now()}`
      }
    );
    
    console.log(`🔄 Note replayed: ${noteId}`);
    
    res.json({
      message: 'Note queued for replay',
      id: noteId
    });
  } catch (error) {
    console.error('Error replaying note:', error);
    res.status(500).json({
      error: 'Failed to replay note',
      details: ['Internal server error']
    });
  }
});

module.exports = router;