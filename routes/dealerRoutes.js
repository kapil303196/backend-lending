const express = require('express');
const router = express.Router();
const dealerController = require('../controllers/dealerController');
const { authenticate, requireDealer } = require('../middleware/auth');

// All dealer routes require authentication as a dealer
router.use(authenticate, requireDealer);

/**
 * Get all rejected offers that a dealer can see.
 * This is read-only on the main offers/responses.
 */
router.get('/offers/rejected', dealerController.getRejectedOffers);

/**
 * Save dealer-only metadata (internal status / notes) for a rejected offer.
 * Does NOT modify the main offer/response itself.
 */
router.post('/offers/:responseId/notes', dealerController.upsertDealerOffer);

module.exports = router;


