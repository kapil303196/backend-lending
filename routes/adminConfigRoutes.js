const express = require('express');
const router = express.Router();
const { getConfig, updateConfig } = require('../controllers/adminConfigController');
const { authenticate, requireAdmin } = require('../middleware/auth');

/**
 * @swagger
 * /api/config:
 *   get:
 *     tags: [Admin Config]
 *     summary: Get admin panel configuration
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current configuration
 */
router.get('/', authenticate, getConfig);

/**
 * @swagger
 * /api/config:
 *   put:
 *     tags: [Admin Config]
 *     summary: Update admin panel configuration
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Configuration updated
 */
router.put('/', authenticate, requireAdmin, updateConfig);

module.exports = router;

