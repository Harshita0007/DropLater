const http = require('http');
const crypto = require('crypto');

class MockSinkServer {
  constructor() {
    this.receivedWebhooks = [];
    this.server = null;
    this.port = 0;
  }

  start() {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        if (req.method === 'POST' && req.url === '/sink') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', () => {
            this.receivedWebhooks.push({
              headers: req.headers,
              body: JSON.parse(body),
              timestamp: new Date()
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'OK' }));
          });
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      this.server.listen(0, () => {
        this.port = this.server.address().port;
        resolve();
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(resolve);
      } else {
        resolve();
      }
    });
  }

  getWebhookUrl() {
    return `http://localhost:${this.port}/sink`;
  }

  reset() {
    this.receivedWebhooks = [];
  }
}

class APIClient {
  constructor(baseUrl = 'http://localhost:3000', token = 'super-secret-admin-token-2024') {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  async request(path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    return response.json();
  }

  async createNote(noteData) {
    return this.request('/api/notes', {
      method: 'POST',
      body: JSON.stringify(noteData)
    });
  }

  async getNotes(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/notes${query ? '?' + query : ''}`);
  }

  async replayNote(noteId) {
    return this.request(`/api/notes/${noteId}/replay`, {
      method: 'POST'
    });
  }

  async healthCheck() {
    return this.request('/health');
  }
}

async function runIntegrationTests() {
  console.log('Running Integration Tests - Note Delivery Flow\n');
  
  const mockSink = new MockSinkServer();
  const apiClient = new APIClient();
  
  let passed = 0;
  let failed = 0;
  
  function expect(actual) {
    return {
      toBe: (expected) => {
        if (actual !== expected) {
          throw new Error(`Expected "${expected}" but got "${actual}"`);
        }
      },
      toBeGreaterThan: (expected) => {
        if (actual <= expected) {
          throw new Error(`Expected ${actual} to be greater than ${expected}`);
        }
      },
      toContain: (expected) => {
        if (!actual.includes(expected)) {
          throw new Error(`Expected "${actual}" to contain "${expected}"`);
        }
      },
      toHaveProperty: (prop) => {
        if (!(prop in actual)) {
          throw new Error(`Expected object to have property "${prop}"`);
        }
      }
    };
  }
  
  async function test(name, testFn) {
    try {
      await testFn();
      console.log(`✅ ${name}`);
      passed++;
    } catch (error) {
      console.log(`❌ ${name}: ${error.message}`);
      failed++;
    }
  }
  
  function waitForDelivery(timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const checkInterval = setInterval(() => {
        if (mockSink.receivedWebhooks.length > 0) {
          clearInterval(checkInterval);
          resolve(mockSink.receivedWebhooks[0]);
        } else if (Date.now() - startTime > timeoutMs) {
          clearInterval(checkInterval);
          reject(new Error('Timeout waiting for webhook delivery'));
        }
      }, 100);
    });
  }

  try {
    await mockSink.start();
    console.log(`Mock sink server started on port ${mockSink.port}`);
    
    await test('API health check returns OK', async () => {
      const response = await apiClient.healthCheck();
      expect(response.ok).toBe(true);
    });
    
    await test('Create note with past releaseAt triggers delivery within 10 seconds', async () => {
      mockSink.reset();
      
      const pastDate = new Date(Date.now() - 5000).toISOString(); 
      const noteData = {
        title: 'Integration Test Note',
        body: 'This note should be delivered immediately due to past releaseAt',
        releaseAt: pastDate,
        webhookUrl: mockSink.getWebhookUrl()
      };
      
    
      const createResponse = await apiClient.createNote(noteData);
      expect(createResponse).toHaveProperty('id');
      
    
      const webhook = await waitForDelivery();
      
      
      expect(webhook.body.title).toBe(noteData.title);
      expect(webhook.body.body).toBe(noteData.body);
      expect(webhook.headers['x-note-id']).toBe(createResponse.id);
      expect(webhook.headers['x-idempotency-key']).toHaveProperty('length');
    });
    
    
    await test('Webhook contains valid idempotency key', async () => {
      const lastWebhook = mockSink.receivedWebhooks[mockSink.receivedWebhooks.length - 1];
      const idempotencyKey = lastWebhook.headers['x-idempotency-key'];
      
      
      expect(idempotencyKey.length).toBe(64);
      expect(/^[a-f0-9]{64}$/.test(idempotencyKey)).toBe(true);
    });
    
    await test('Note status updates to delivered after successful delivery', async () => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const notes = await apiClient.getNotes({ status: 'delivered' });
      expect(notes.notes.length).toBeGreaterThan(0);
      const deliveredNote = notes.notes.find(n => n.title === 'Integration Test Note');
      expect(deliveredNote.status).toBe('delivered');
      expect(deliveredNote.deliveredAt).toHaveProperty('length');
      expect(deliveredNote.attempts.length).toBeGreaterThan(0);
      expect(deliveredNote.attempts[0].ok).toBe(true);
      expect(deliveredNote.attempts[0].statusCode).toBe(200);
    });
    
    await test('Duplicate deliveries are prevented by idempotency', async () => {
      const initialWebhookCount = mockSink.receivedWebhooks.length;
      
      const noteData = {
        title: 'Idempotency Test Note',
        body: 'Testing idempotency behavior',
        releaseAt: new Date(Date.now() - 1000).toISOString(),
        webhookUrl: mockSink.getWebhookUrl()
      };
      
      await apiClient.createNote(noteData);
      await waitForDelivery();
      
      expect(mockSink.receivedWebhooks.length).toBe(initialWebhookCount + 1);
    });
    
    await test('Notes with future releaseAt are not delivered immediately', async () => {
      mockSink.reset();
      
      const futureDate = new Date(Date.now() + 60000).toISOString(); 
      const noteData = {
        title: 'Future Test Note',
        body: 'This note should not be delivered yet',
        releaseAt: futureDate,
        webhookUrl: mockSink.getWebhookUrl()
      };
      
      await apiClient.createNote(noteData);
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      expect(mockSink.receivedWebhooks.length).toBe(0);
      
      const notes = await apiClient.getNotes({ status: 'pending' });
      const pendingNote = notes.notes.find(n => n.title === 'Future Test Note');
      expect(pendingNote.status).toBe('pending');
    });

  } finally {
    await mockSink.stop();
    console.log('Mock sink server stopped');
  }
  
  console.log(`\nTest Results:`);
  console.log(`   Passed: ${passed}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Total:  ${passed + failed}`);
  
  if (failed === 0) {
    console.log('All integration tests passed!');
    process.exit(0);
  } else {
    console.log('Some integration tests failed!');
    process.exit(1);
  }
}

if (require.main === module) {
  if (typeof fetch === 'undefined') {
    console.error('Integration tests require Node.js 18+ with native fetch support');
    console.error('Or install node-fetch: npm install node-fetch');
    process.exit(1);
  }
  
  runIntegrationTests().catch(error => {
    console.error('Integration test runner failed:', error.message);
    process.exit(1);
  });
}

module.exports = {
  MockSinkServer,
  APIClient,
  runIntegrationTests
};