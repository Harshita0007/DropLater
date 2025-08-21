# DropLater: A Reliable Webhook Delivery Service

DropLater is a robust, open-source service for scheduling webhook deliveries. It provides a simple API to schedule webhooks with a guaranteed **exactly-once delivery**, automated **retries**, and the ability to **replay failed jobs**.

Whether you're building a notification system, a deferred task runner, or a data synchronization pipeline, DropLater ensures your events are delivered reliably, precisely when they're needed.

-----
### Architecture Overview
The system follows a microservices architecture with clear separation of concerns:


## Features

  * **Guaranteed Delivery:** Uses idempotency keys to prevent duplicate deliveries, ensuring each webhook is processed exactly once.
  * **Automatic Retries:** Implements an exponential backoff strategy for failed deliveries, automatically attempting to send the webhook again.
  * **Replay Functionality:** Easily re-queue and re-process failed or "dead" notes with a single API call.
  * **Scalable Architecture:** Built on a microservices-based architecture using Redis for the job queue and MongoDB for persistent storage, allowing for easy horizontal scaling.
  * **Developer-Friendly:** Simple REST API and a clean, intuitive Admin UI to manage your notes.

-----

## Quick Start

### Prerequisites

  * **Docker & Docker Compose**
  * **Node.js (for local development)**

### Running with Docker Compose


1.  **Set up your environment:**

    ```bash
    cp .env.example .env
    ```

    For security, remember to set a strong `ADMIN_TOKEN`.

2.  **Start all services:**

    ```bash
    docker compose up
    ```

### Accessing the Services

  * **API:** `http://localhost:3000`
  * **Admin UI:** `http://localhost:3000`
  * **Webhook Sink:** `http://localhost:4000`

-----

## API Usage

The API is intuitive and follows standard REST conventions. All API requests require a valid `ADMIN_TOKEN` in the `Authorization` header.

### Create a Scheduled Note

```bash
curl -X POST http://localhost:3000/api/notes \
 -H "Authorization: Bearer your_secure_token_here" \
 -H "Content-Type: application/json" \
 -d '{
  "title":"Project Update",
  "body":"Scheduled notification for project deadline.",
  "releaseAt":"2025-08-25T10:00:00.000Z",
  "webhookUrl":"http://localhost:4000/sink"
 }'
```

### Replay a Failed Note

```bash
curl -X POST \
 -H "Authorization: Bearer your_secure_token_here" \
"http://localhost:3000/api/notes/<note_id>/replay"
```

-----

## Design and Decisions

### **Architecture Overview**

The system is composed of several key services that work together to ensure reliable delivery. The **API** handles incoming requests and stores them in **MongoDB**. It then pushes a job to a **Redis-based queue**, which the dedicated **Worker** process consumes. The worker then attempts to deliver the webhook to the final **Webhook Endpoint**.

### **Key Decisions**

  * **Polling vs. Delayed Jobs:** We chose to use **delayed jobs via BullMQ (Redis)** instead of a simple polling mechanism. This decision was driven by efficiency—it eliminates constant database queries, reducing resource usage and ensuring more precise delivery times.
  * **MongoDB vs. PostgreSQL:** We opted for **MongoDB** for its schemaless document model, which sped up prototyping and development. While PostgreSQL would provide strong ACID guarantees, MongoDB's flexibility was a better fit for this project's initial phase.

-----

## Debug Diary

Here are two real issues we encountered and how we debugged and resolved them.

### **Issue \#1: BullMQ Jobs Not Processing**

**Problem:** The worker was failing to connect to Redis. The logs showed:

```bash
Error: connect ECONNREFUSED 127.0.0.1:6379
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1494:16)
```

**Root Cause:** When running in Docker Compose, services communicate via their container names, not `localhost`. The worker's configuration was hardcoded to connect to `127.0.0.1:6379`.

**Solution:** I updated the worker's Redis configuration to use the Docker service name, `redis`, which is resolved correctly within the Docker network. We also refactored the connection to pull host and port from environment variables for greater flexibility.

### **Issue \#2: "Invalid note ID format" in Admin UI**

**Problem:** Replaying a note from the Admin UI resulted in a `400 Bad Request` error.

```json
{
  "error": "Invalid note ID format",
  "details": ["Note ID must be a valid MongoDB ObjectId"]
}
```

**Root Cause:** The frontend's replay function was passing an `undefined` value to the API. The frontend component was expecting a field named `_id` from the API response, but the API was returning the ID field as `id`.

**Solution:** I modified the React component to be more resilient by checking for both `note._id` and `note.id` when extracting the ID. This ensures the correct value is always passed to the API, regardless of the field name convention. We also added more verbose logging to the frontend to easily track the exact ID being passed.

-----

## Development & Testing

### **Scripts**

  * `npm run dev`: Starts the application in development mode with live reloading.
  * `npm test`: Runs all unit and integration tests.
  * `npm run lint`: Checks for code style and syntax errors.
  * `npm run format`: Automatically formats the code using Prettier.