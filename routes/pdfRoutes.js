/**
 * PDF Routes
 * 
 * Routes for PDF generation and management.
 * All routes require admin authentication.
 */

const express = require('express');
const router = express.Router();
const pdfController = require('../controllers/pdfController');
const { authenticate, requireAdmin } = require('../middleware/auth');

/**
 * @swagger
 * /api/pdf/response/{responseId}:
 *   get:
 *     tags: [PDF]
 *     summary: Generate and download filled PDF for a user response
 *     description: Generates a filled FundDirect application PDF from user response data
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: responseId
 *         required: true
 *         schema:
 *           type: string
 *         description: The user response ID
 *       - in: query
 *         name: maskSSN
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Whether to mask the SSN (show only last 4 digits)
 *     responses:
 *       200:
 *         description: PDF file
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: User response not found
 *       500:
 *         description: Failed to generate PDF
 */
router.get('/response/:responseId', authenticate, requireAdmin, pdfController.generateResponsePDF);

/**
 * @swagger
 * /api/pdf/response/{responseId}/preview:
 *   get:
 *     tags: [PDF]
 *     summary: Preview PDF inline (for browser viewing)
 *     description: Generates and displays PDF inline instead of downloading
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: responseId
 *         required: true
 *         schema:
 *           type: string
 *         description: The user response ID
 *       - in: query
 *         name: maskSSN
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Whether to mask the SSN (default true for preview)
 *     responses:
 *       200:
 *         description: PDF file for inline display
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: User response not found
 *       500:
 *         description: Failed to preview PDF
 */
router.get('/response/:responseId/preview', authenticate, requireAdmin, pdfController.previewResponsePDF);

/**
 * @swagger
 * /api/pdf/response/{responseId}/info:
 *   get:
 *     tags: [PDF]
 *     summary: Get PDF metadata and data completeness info
 *     description: Returns information about the PDF without generating it
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: responseId
 *         required: true
 *         schema:
 *           type: string
 *         description: The user response ID
 *     responses:
 *       200:
 *         description: PDF information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     filename:
 *                       type: string
 *                     responseId:
 *                       type: string
 *                     uniqueId:
 *                       type: string
 *                     businessName:
 *                       type: string
 *                     ownerName:
 *                       type: string
 *                     status:
 *                       type: string
 *                     dataCompleteness:
 *                       type: number
 *       404:
 *         description: User response not found
 *       500:
 *         description: Failed to get PDF info
 */
router.get('/response/:responseId/info', authenticate, requireAdmin, pdfController.getPDFInfo);

/**
 * @swagger
 * /api/pdf/mca/{mcaId}:
 *   get:
 *     tags: [PDF]
 *     summary: Generate and download filled PDF for an MCA record
 *     description: Generates a filled FundDirect application PDF from MCA data and latest response
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: mcaId
 *         required: true
 *         schema:
 *           type: string
 *         description: The MCA record ID or uniqueId
 *       - in: query
 *         name: maskSSN
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Whether to mask the SSN (show only last 4 digits)
 *     responses:
 *       200:
 *         description: PDF file
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: MCA record not found
 *       500:
 *         description: Failed to generate PDF
 */
router.get('/mca/:mcaId', authenticate, requireAdmin, pdfController.generateMCAPDF);

module.exports = router;

