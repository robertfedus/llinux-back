const { pool } = require('../db/db');
const { v4: uuidv4 } = require('uuid');
const redis = require('../db/redisClient');
const deviceService = require('../services/deviceService');

/**
 * Send commands to a specific device and wait for results via Redis pub/sub
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const sendCommands = async (req, res) => {
  const { deviceId, commands } = req.body;
  const userId = req.user.id;

  // Validate input
  if (!deviceId || !commands || !Array.isArray(commands)) {
    return res.status(400).json({ error: 'Valid deviceId and commands array are required' });
  }

  try {
    // Verify device connection status
    const isConnected = await deviceService.isUserConnected(userId);
    if (!isConnected) {
      return res.status(404).json({ error: 'Device not connected' });
    }

    // Get client ID for WebSocket routing
    const clientId = await deviceService.getUserClientId(userId);
    if (!clientId) {
      return res.status(404).json({ error: 'Device connection information not found' });
    }

    const commandId = uuidv4();
    const results = new Array(commands.length);
    let receivedResults = 0;

    const resultPromise = new Promise((resolve, reject) => {
      const commandChannel = `cmd:results:${commandId}`;
      const subscriber = redis.duplicate();
      let timeoutId;

      // Set up subscription first
      subscriber.subscribe(commandChannel, async (subscribeErr) => {
        if (subscribeErr) {
          subscriber.quit();
          return reject(new Error(`Failed to subscribe to results channel: ${subscribeErr.message}`));
        }

        try {
          // Send commands only after subscription is confirmed
          await deviceService.publishCommand(clientId, {
            type: 'execute',
            commandId,
            commands
          });

          // Start timeout AFTER commands are sent
          timeoutId = setTimeout(() => {
            subscriber.unsubscribe(commandChannel);
            subscriber.quit();
            reject(new Error('Command execution timed out (30 seconds)'));
          }, 30000);
        } catch (publishError) {
          subscriber.quit();
          reject(new Error(`Failed to send commands: ${publishError.message}`));
        }
      });

      // Handle incoming results
      subscriber.on('message', (channel, message) => {
        if (channel === commandChannel) {
          try {
            const resultData = JSON.parse(message);
            
            // Validate result structure
            if (typeof resultData.index !== 'number' || 
                resultData.index < 0 || 
                resultData.index >= commands.length) {
              console.warn('Received invalid command index:', resultData.index);
              return;
            }

            // Store result in correct position
            results[resultData.index] = {
              command: resultData.command,
              output: resultData.output,
              success: resultData.success
            };

            receivedResults++;

            // Check completion
            if (receivedResults === commands.length) {
              clearTimeout(timeoutId);
              subscriber.unsubscribe(commandChannel);
              subscriber.quit();
              resolve(results);
            }
          } catch (parseError) {
            console.error('Error parsing command result:', parseError);
          }
        }
      });

      // Handle subscription errors
      subscriber.on('error', (err) => {
        clearTimeout(timeoutId);
        subscriber.quit();
        reject(new Error(`Redis subscriber error: ${err.message}`));
      });
    });

    // Wait for results or timeout
    try {
      const commandResults = await resultPromise;
      res.json({
        success: true,
        deviceId,
        results: commandResults
      });
    } catch (error) {
      const partialResults = results.filter(r => r !== undefined);
      
      if (error.message.includes('timed out')) {
        res.status(408).json({
          success: false,
          error: error.message,
          deviceId,
          receivedCommands: partialResults.length,
          totalCommands: commands.length,
          partialResults
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Command processing failed',
          message: error.message,
          deviceId
        });
      }
    }
  } catch (error) {
    console.error('Command controller error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
};

const getSystemInformation = async (req, res) => {
  try {
    const userId = req?.user?.id;
    if (!userId) {
      return res.status(400).json({ error: 'Missing user ID' });
    }

    // Find the key matching ws:userId:*
    const keys = await redis.keys(`ws:${userId}:*`);
    if (!keys || keys.length === 0) {
      return res.status(404).json({ error: 'No device found for user' });
    }

    // Extract deviceId from the key (assuming one match)
    const keyParts = keys[0].split(':');
    const deviceId = keyParts[2];

    if (!deviceId) {
      return res.status(500).json({ error: 'Device ID could not be parsed' });
    }

    // Get system info for the device
    const systemData = await redis.get(`system:${deviceId}`);
    if (!systemData) {
      return res.status(404).json({ error: 'System information not found' });
    }

    return res.status(200).json(JSON.parse(systemData));
  } catch (err) {
    console.error('Error in sendCommands:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};



const getConnectionCode = async (req, res) => {
  try {
    const userId = req.user.id;
    const redisKey = `user:${userId}:connection_code`;
    const now = new Date();

    // Attempt to retrieve existing code and its TTL
    const existingCode = await redis.get(redisKey);
    const ttl = await redis.ttl(redisKey);

    if (existingCode && ttl > 0) {
      // Calculate expiresAt from TTL
      const expiresAt = new Date(now.getTime() + ttl * 1000).toISOString();
      return res.status(200).json({
        msg: 'Connection code exists',
        code: existingCode,
        expiresAt,
      });
    }

    // Generate a new code
    const newCode = uuidv4();
    const expireSeconds = 3 * 60; // 3 minutes

    // Store new code with expiration
    await redis.setex(redisKey, expireSeconds, newCode);

    const expiresAt = new Date(now.getTime() + expireSeconds * 1000).toISOString();

    // Determine response status and message
    const status = existingCode ? 200 : 201;
    const msg = existingCode ? 'Code refreshed' : 'New connection code';

    return res.status(status).json({
      msg,
      code: newCode,
      expiresAt,
    });
  } catch (err) {
    console.error('Redis error:', err);
    return res.status(500).send('Server error');
  }
};

const saveSystemInformation = async (info) => {
  if (!info || !info.deviceId) {
    throw new Error("Invalid info object or missing deviceId.");
  }

  const key = `system:${info.deviceId}`;

  try {
    await redis.set(key, JSON.stringify(info));
    console.log(`System information saved/updated for key: ${key}`);
  } catch (err) {
    console.error('Error saving system information to Redis:', err);
  }
};

const handleWebSocketMessage = (ws, message) => {
  try {
    const data = JSON.parse(message);
    
    if (data.type === 'command_result') {
      const { commandId } = data;
      // Publish directly to Redis without additional handlers
      redis.publish(`cmd:results:${commandId}`, JSON.stringify(data));
    }

    if (data.type === 'system_information') {
      saveSystemInformation(data);
    }

    
  } catch (error) {
    console.error('Error handling WebSocket message:', error);
  }
};

module.exports = { sendCommands, getConnectionCode, handleWebSocketMessage, getSystemInformation };
