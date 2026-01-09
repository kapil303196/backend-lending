const express = require('express');
const router = express.Router();
const lenderEmailController = require('../controllers/lenderEmailController');
const { authenticate, requireAdmin } = require('../middleware/auth');

// All routes require admin authentication
router.use(authenticate, requireAdmin);

router.post('/', lenderEmailController.createLenderEmail);
router.get('/', lenderEmailController.getAllLenderEmails);
router.put('/:id', lenderEmailController.updateLenderEmail);
router.delete('/:id', lenderEmailController.deleteLenderEmail);
router.post('/send-application', lenderEmailController.sendApplicationToLender);

module.exports = router;
