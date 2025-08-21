const mongoose = require('mongoose');

const attemptSchema = new mongoose.Schema({
  at: { type: Date, required: true },
  statusCode: { type: Number, required: true },
  ok: { type: Boolean, required: true },
  error: { type: String, required: false }
}, { _id: false });

const noteSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  body: {
    type: String,
    required: true,
    trim: true,
    maxlength: 5000
  },
  releaseAt: {
    type: Date,
    required: true,
    index: true // Index for finding due notes quickly
  },
  webhookUrl: {
    type: String,
    required: true,
    trim: true,
    match: /^https?:\/\/.+/
  },
  status: {
    type: String,
    enum: ['pending', 'delivered', 'failed', 'dead'],
    default: 'pending',
    index: true // Index for listing by status
  },
  attempts: {
    type: [attemptSchema],
    default: []
  },
  deliveredAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  toJSON: { 
    transform: (doc, ret) => {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

// Compound index for efficient querying
noteSchema.index({ status: 1, releaseAt: 1 });

module.exports = mongoose.model('Note', noteSchema);