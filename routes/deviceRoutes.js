const express = require('express');
const router = express.Router();
const deviceController = require('../controllers/deviceController');
const auth = require('../middleware/auth');

router.post('/send-commands', auth, deviceController.sendCommands);

router.get('/connection-code', auth, deviceController.getConnectionCode);

router.get('/system-information', auth, deviceController.getSystemInformation);

module.exports = router;