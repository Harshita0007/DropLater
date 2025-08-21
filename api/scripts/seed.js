require('dotenv').config();
const mongoose = require('mongoose');
const dayjs = require('dayjs');
const Note = require('../models/Note');

const sampleNotes = [
  {
    title: "Welcome Message",
    body: "Welcome to DropLater! This message was scheduled for delivery.",
    releaseAt: dayjs().add(30, 'seconds').toDate(),
    webhookUrl: process.env.WEBHOOK_SINK_URL || "http://localhost:4000/sink",
    status: 'pending'
  },
  {
    title: "Daily Report",
    body: "Here's your daily report. This message demonstrates scheduled delivery.",
    releaseAt: dayjs().add(1, 'minute').toDate(),
    webhookUrl: process.env.WEBHOOK_SINK_URL || "http://localhost:4000/sink",
    status: 'pending'
  },
  {
    title: "Past Due Message",
    body: "This message had a past release time and should be delivered immediately.",
    releaseAt: dayjs().subtract(5, 'minutes').toDate(),
    webhookUrl: process.env.WEBHOOK_SINK_URL || "http://localhost:4000/sink",
    status: 'pending'
  },
  {
    title: "Future Message",
    body: "This message is scheduled for future delivery.",
    releaseAt: dayjs().add(5, 'minutes').toDate(),
    webhookUrl: process.env.WEBHOOK_SINK_URL || "http://localhost:4000/sink",
    status: 'pending'
  },
  {
    title: "Sample Delivered Note",
    body: "This note shows what a delivered message looks like.",
    releaseAt: dayjs().subtract(1, 'hour').toDate(),
    webhookUrl: process.env.WEBHOOK_SINK_URL || "http://localhost:4000/sink",
    status: 'delivered',
    deliveredAt: dayjs().subtract(30, 'minutes').toDate(),
    attempts: [{
      at: dayjs().subtract(30, 'minutes').toDate(),
      statusCode: 200,
      ok: true
    }]
  }
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/droplater');
    console.log('Connected to MongoDB');
    
    // Clear existing notes
    await Note.deleteMany({});
    console.log('Cleared existing notes');
    
    // Insert sample notes
    const createdNotes = await Note.insertMany(sampleNotes);
    console.log(`Created ${createdNotes.length} sample notes:`);
    
    createdNotes.forEach(note => {
      console.log(`- ${note.title} (${note.status}) - releases at ${note.releaseAt}`);
    });
    
    console.log('\nSeed completed successfully!');
    console.log('You can now:');
    console.log('1. Start the services: docker-compose up');
    console.log('2. Check the API: curl http://localhost:3000/health');
    console.log('3. List notes: curl -H "Authorization: Bearer super-secret-admin-token-2024" http://localhost:3000/api/notes');
    
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

seed();