// Main application entry point
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');

const deviceRoutes = require('./routes/deviceRoutes');
const authRoutes = require('./routes/authRoutes');
const apiKeysRoutes = require('./routes/apiKeysRoutes');

const setupWebSocket = require('./websocket/websocket');

const app = express();
const server = http.createServer(app);

const wss = setupWebSocket(server);

const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 500, // limit each IP to 100 requests per windowMs
  standardHeaders: true // Return rate limit info in the `RateLimit-*` headers
});

// Middleware
app.use(limiter);
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(bodyParser.json());

// Routes
app.use('/api/device/', deviceRoutes);
app.use('/api/', authRoutes);
app.use('/api/api-keys', apiKeysRoutes);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = server;