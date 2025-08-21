# DropLater

A service for scheduling webhook deliveries with guaranteed exactly-once delivery, retries, and replay functionality.

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js (if running locally)

### Run with Docker Compose

```bash
# Clone and navigate to project
git clone <your-repo-url>
cd DropLater

# Copy environment file
cp .env.example .env

# Start all services
docker compose up

# Services will be available at:
# - API: http://localhost:3000
# - Admin UI: http://localhost:3000 (or separate port if you made it standalone)
# - Webhook Sink: http://localhost:4000
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

```env
ADMIN_TOKEN=your_secure_token_here
MONGODB_URI=mongodb://mongo:27017/droplater
REDIS_URL=redis://redis:6379
API_PORT=3000
WORKER_PORT=3001
SINK_PORT=4000
SINK_FAIL_RATE=0  # Set to 1 to simulate failures
```

## API Usage

### Create a Note
```bash
curl -X POST http://localhost:3000/api/notes \
 -H "Authorization: Bearer your_secure_token_here" \
 -H "Content-Type: application/json" \
 -d '{
  "title":"Hello",
  "body":"Ship me later",
  "releaseAt":"2020-01-01T00:00:10.000Z",
  "webhookUrl":"http://localhost:4000/sink"
 }'
```

### List Notes
```bash
curl -H "Authorization: Bearer your_secure_token_here" \
"http://localhost:3000/api/notes?status=pending&page=1"
```

### Replay Failed Note
```bash
curl -X POST \
 -H "Authorization: Bearer your_secure_token_here" \
"http://localhost:3000/api/notes/<note_id>/replay"
```

### Health Check
```bash
curl http://localhost:3000/health
```

## Architecture

### Services
- **API**: Express.js REST API for creating/managing notes
- **Worker**: Background process for webhook delivery with retries
- **Sink**: Webhook receiver with idempotency handling
- **Admin**: React UI for note management
- **MongoDB**: Note storage
- **Redis**: Job queue and idempotency keys

### Key Features
- **Exactly-once delivery**: Idempotency keys prevent duplicate processing
- **Retry logic**: Exponential backoff (1s → 5s → 25s)
- **Replay capability**: Requeue failed/dead notes
- **Rate limiting**: 60 requests/minute per IP

## Development

### Run Tests
```bash
npm test
```

### Scripts
```bash
npm run dev      # Development mode
npm run test     # Run tests
npm run lint     # Code linting
npm run format   # Code formatting
npm run seed     # Seed database with test data
```

## Debug Diary

### Issue 1: [Replace with your actual issue]
**Problem**: 
```
[Paste actual error message/stack trace here]
```
**Solution**: [Explain how you fixed it]

### Issue 2: [Replace with your actual issue]
**Problem**: 
```
[Paste actual error message/stack trace here]
```
**Solution**: [Explain how you fixed it]

## Architecture Diagram

![Architecture Diagram](diagram.jpg)
*Hand-drawn flow diagram showing notes → queue/worker → webhook delivery*

## Design Decisions

### Database Indexes
- `releaseAt (asc)`: Quick lookup of due notes during polling
- `status`: Efficient filtering by delivery status

### Retry Strategy
- Exponential backoff: 1s → 5s → 25s
- Max 3 attempts before marking as "dead"
- Each attempt logged for debugging

### Trade-offs Considered
- **Polling vs Delayed Jobs**: Chose polling for simplicity and reliability
- **In-memory vs Redis for idempotency**: Chose Redis for persistence across restarts
- **Separate worker vs API process**: Chose separation for better resource management