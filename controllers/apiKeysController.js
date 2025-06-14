const pool = require('../db/db').pool; // Your PostgreSQL pool
const { encrypt, decrypt } = require('../utils/AESEncryption');

exports.insertApiKeys = async (req, res) => {
    const userId = req.user.id;
    const { chatgpt_key, deepseek_key } = req.body;

    try {
        const result = await pool.query(
            `INSERT INTO users_api_keys (user_id, chatgpt_key, deepseek_key)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id)
             DO UPDATE SET chatgpt_key = $2, deepseek_key = $3`,
            [userId, encrypt(chatgpt_key), encrypt(deepseek_key)]
        );
        res.status(200).json({ message: 'API keys saved successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
};

exports.updateApiKeys = async (req, res) => {
    const userId = req.user.id;
    const { chatgpt_key, deepseek_key } = req.body;

    try {
        const result = await pool.query(
            `UPDATE users_api_keys SET chatgpt_key = $2, deepseek_key = $3 WHERE user_id = $1`,
            [userId, encrypt(chatgpt_key), encrypt(deepseek_key)]
        );
        res.status(200).json({ message: 'API keys updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
};

exports.deleteApiKeys = async (req, res) => {
  const userId = req.user.id;
  const { chatgpt, deepseek } = req.query;

  try {
    if (chatgpt === 'true' && deepseek === 'true') {
      await pool.query(`UPDATE users_api_keys SET chatgpt_key = NULL, deepseek_key = NULL WHERE user_id = $1`, [userId]);
    } else if (chatgpt === 'true') {
      await pool.query(`UPDATE users_api_keys SET chatgpt_key = NULL WHERE user_id = $1`, [userId]);
    } else if (deepseek === 'true') {
      await pool.query(`UPDATE users_api_keys SET deepseek_key = NULL WHERE user_id = $1`, [userId]);
    } else {
      return res.status(400).json({ error: 'No keys specified for deletion' });
    }

    res.status(200).json({ message: 'Selected API keys removed successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getApiKeys = async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await pool.query(
      `SELECT chatgpt_key, deepseek_key FROM users_api_keys WHERE user_id = $1`,
      [userId]
    );
    if (result.rows.length === 0) {
      return res.status(200).json({});
    }

    const { chatgpt_key, deepseek_key } = result.rows[0];
    res.status(200).json({
      chatgpt_key: chatgpt_key ? decrypt(chatgpt_key) : '',
      deepseek_key: deepseek_key ? decrypt(deepseek_key) : '',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

