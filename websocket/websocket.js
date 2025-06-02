const WebSocket = require('ws');
const redis = require('../db/redisClient');
const deviceService = require('../services/deviceService');
const { v4: uuidv4 } = require('uuid');
const { handleWebSocketMessage } = require('./../controllers/deviceController'); 

const websocket = (server) => {
  const wss = new WebSocket.Server({ server });

  // 1) Subscribe to the single “ws:commands” channel
  const sub = redis.duplicate();
  sub.subscribe('ws:commands');
  sub.on('message', (channel, message) => {
    const { clientId, payload } = JSON.parse(message);
    // iterate through the built‑in wss.clients set
    wss.clients.forEach((ws) => {
      if (ws.clientId === clientId && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
      }
    });
  });

  // 2) On every new connection, assign and attach a clientId
  wss.on('connection', (ws) => {
    ws.clientId = uuidv4();
    let deviceId = null;

    ws.on('message', async (raw) => {
      let data;
      try { 
        data = JSON.parse(raw); 
      } catch (e) { 
        console.error('Error parsing message:', e);
        return; 
      }

      if (data.type === 'register') {
        deviceId = data.deviceId;
        
        await deviceService.registerDevice(deviceId, ws.clientId, data.connectionCode);
        return ws.send(JSON.stringify({ type: 'registered', success: true }));
      }
      // Handle other message types
      handleWebSocketMessage(ws, raw); // Pass the raw message to the handler
    });

    ws.on('close', async () => {
      if (deviceId) {
        await deviceService.removeDevice(deviceId);
      }
    });

    ws.send(JSON.stringify({ type: 'connected', clientId: ws.clientId }));
  });

  return wss;
};

module.exports = websocket;
