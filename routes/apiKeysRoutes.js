const express = require('express');
const router = express.Router();
const apiKeysController = require('../controllers/apiKeysController');
const auth = require('../middleware/auth');

router.use(auth);

router.get('/', apiKeysController.getApiKeys);
router.post('/', apiKeysController.insertApiKeys);
router.put('/', apiKeysController.updateApiKeys);
router.delete('/', apiKeysController.deleteApiKeys);


module.exports = router;
