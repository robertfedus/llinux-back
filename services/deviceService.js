const redis = require('../db/redisClient');

module.exports = {
  registerDevice: async (deviceId, clientId, connectionCode) => {
    // 1) locate which userId has this connectionCode
    let cursor = '0';
    let foundUserId = null;

    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'user:*:connection_code', 'COUNT', 100);
      cursor = nextCursor;

      for (const key of keys) {
        const code = await redis.get(key);
        if (code === connectionCode) {
          foundUserId = key.split(':')[1];
          break;
        }
      }
    } while (cursor !== '0' && foundUserId === null);

    if (!foundUserId) {
      throw new Error('Invalid or expired connection code');
    }

    // 2) remove any existing device mapping for this user
    cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `ws:${foundUserId}:*`, 'COUNT', 100);
      cursor = nextCursor;

      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== '0');

    // 3) store new mapping
    await redis.set(`ws:${foundUserId}:${deviceId}`, clientId);

    return { userId: foundUserId };
  },

  removeDevice: async (deviceId) => {
    let cursor = '0';

    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `ws:*:${deviceId}`, 'COUNT', 100);
      cursor = nextCursor;

      if (keys.length > 0) {
        await redis.del(...keys);
        console.log(`Deleted keys: ${keys.join(', ')}`);
      }
    } while (cursor !== '0');
  },

  /**
   * Checks if the given user has any active WebSocket connection.
   * @param {string} userId
   * @returns {Promise<boolean>}
   */
  isUserConnected: async (userId) => {
    let cursor = '0';
    do {
      // Look for any key of the form ws:<userId>:*
      const [ nextCursor, keys ] = await redis.scan(cursor, 'MATCH', `ws:${userId}:*`, 'COUNT', 100);
      if (keys.length > 0) {
        return true;
      }
      cursor = nextCursor;
    } while (cursor !== '0');
    return false;
  },

  /**
   * Returns the first clientId found for this user’s active connection, or null.
   * @param {string} userId
   * @returns {Promise<string|null>}
   */
  getUserClientId: async (userId) => {
    let cursor = '0';
    do {
      const [ nextCursor, keys ] = await redis.scan(cursor, 'MATCH', `ws:${userId}:*`, 'COUNT', 100);
      if (keys.length > 0) {
        // Grab the first matching <userId>:<deviceId> key
        return await redis.get(keys[0]);
      }
      cursor = nextCursor;
    } while (cursor !== '0');
    return null;
  },

  publishCommand: async (clientId, payload) => {
    // everyone is subscribed to “ws:commands”
    await redis.publish(
      'ws:commands',
      JSON.stringify({ clientId, payload })
    );
  }
};
