import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PORT } from './config.js';
import { setupSocketHandlers } from './socketHandlers.js';
import routes from './routes.js';

// Load environment variables from .env or .env.local
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });
dotenv.config({ path: join(__dirname, '../.env.local') });

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(express.json());

// Root endpoint
app.get('/', (req, res) => {
  res.send('<h1>Translation Backend Server</h1><p>Use WebSocket to connect.</p>');
});

// API routes
app.use('/', routes);

// Setup Socket.IO handlers
setupSocketHandlers(io);

// Start server
server.listen(PORT, () => {
  console.log(`\n======================================`);
  console.log(`Translation Backend Server Started`);
  console.log(`======================================`);
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`Info: http://localhost:${PORT}/info`);
  console.log(`======================================\n`);
});
