const express = require('express');
const router = express.Router();
const unsubscribeController = require('../controllers/unsubscribeController');

/**
 * @swagger
 * tags:
 *   name: Unsubscribe
 *   description: Email unsubscribe management endpoints
 */

/**
 * @swagger
 * /api/unsubscribe:
 *   get:
 *     tags: [Unsubscribe]
 *     summary: One-click unsubscribe (GET)
 *     description: Unsubscribe an email address via GET request. Returns plain text response.
 *     parameters:
 *       - in: query
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *           format: email
 *         example: user@example.com
 *     responses:
 *       200:
 *         description: Successfully unsubscribed
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: ✅ You have been unsubscribed successfully.
 *       400:
 *         description: Invalid email address
 *   post:
 *     tags: [Unsubscribe]
 *     summary: Unsubscribe an email address (POST)
 *     description: Add an email address to the unsubscribe list via POST request
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *     responses:
 *       200:
 *         description: Successfully unsubscribed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid email address
 */
router.get('/', unsubscribeController.unsubscribeGet);
router.post('/', unsubscribeController.unsubscribe);

/**
 * @swagger
 * /api/unsubscribe/check:
 *   get:
 *     tags: [Unsubscribe]
 *     summary: Check if an email is unsubscribed
 *     description: Check the unsubscribe status of an email address
 *     parameters:
 *       - in: query
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *           format: email
 *         example: user@example.com
 *     responses:
 *       200:
 *         description: Unsubscribe status retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 isUnsubscribed:
 *                   type: boolean
 *                 email:
 *                   type: string
 */
router.get('/check', unsubscribeController.checkUnsubscribed);

/**
 * @swagger
 * /api/unsubscribe/list:
 *   get:
 *     tags: [Unsubscribe]
 *     summary: Download unsubscribed emails list
 *     description: Get a text file containing all unsubscribed email addresses. Requires secret key.
 *     parameters:
 *       - in: query
 *         name: secret
 *         required: true
 *         schema:
 *           type: string
 *         description: Secret key to access the unsubscribe list
 *         example: your-secret-key-here
 *     responses:
 *       200:
 *         description: Text file with unsubscribed emails
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *       401:
 *         description: Unauthorized - Valid secret key required
 */
router.get('/list', unsubscribeController.getUnsubscribedList);

module.exports = router;
