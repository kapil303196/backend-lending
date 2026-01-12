const express = require("express");
const router = express.Router();
const dummyController = require("../controllers/dummyController");

/**
 * @swagger
 * /api/dummy/send-marketing-email:
 *   post:
 *     tags: [Dummy]
 *     summary: Send marketing email using SendGrid template
 *     description: Sends the marketing email to a specific address with a uniqueId using SendGrid dynamic template
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               to:
 *                 type: string
 *                 example: "user@example.com"
 *               uniqueId:
 *                 type: string
 *                 example: "test-unique-id"
 *     responses:
 *       200:
 *         description: Email sent successfully
 */
router.post("/send-marketing-email", dummyController.sendMarketingEmail);

module.exports = router;
