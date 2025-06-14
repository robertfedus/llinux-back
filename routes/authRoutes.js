const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');
const { validateRegister, validateLogin } = require('../middleware/validators/authValidators');

router.post('/register', validateRegister, authController.register);

router.post('/login', validateLogin, authController.login);

router.get('/user', auth, authController.getUserData);

module.exports = router;