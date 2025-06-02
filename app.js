// Main application entry point
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const bodyParser = require('body-parser');

// Import routes
const deviceRoutes = require('./routes/deviceRoutes');
const authRoutes = require('./routes/authRoutes');
const apiKeysRoutes = require('./routes/apiKeysRoutes');

// Import WebSocket setup
const setupWebSocket = require('./websocket/websocket');

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Setup WebSocket server
const wss = setupWebSocket(server);

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Routes
app.get('/', (req, res) => {
  res.send('Command Execution Server');
});

// Apply API routes
app.use('/api/device/', deviceRoutes);
app.use('/api/', authRoutes);
app.use('/api/api-keys', apiKeysRoutes);

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = server; // Export for testing purposes