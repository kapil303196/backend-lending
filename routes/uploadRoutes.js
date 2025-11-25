const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/uploadController');
const { uploadSingle, uploadMultiple, handleMulterError } = require('../middleware/uploadMiddleware');

/**
 * @swagger
 * /api/upload/single:
 *   post:
 *     tags: [Upload]
 *     summary: Upload a single file to S3
 *     description: Upload a single bank statement or document to S3
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: File to upload (PDF, JPG, PNG - max 10MB)
 *     responses:
 *       200:
 *         description: File uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     url:
 *                       type: string
 *                     key:
 *                       type: string
 *                     originalName:
 *                       type: string
 *                     size:
 *                       type: number
 *       400:
 *         description: Bad request
 *       500:
 *         description: Server error
 */
router.post('/single', uploadSingle, handleMulterError, uploadController.uploadFile);

/**
 * @swagger
 * /api/upload/multiple:
 *   post:
 *     tags: [Upload]
 *     summary: Upload multiple files to S3
 *     description: Upload up to 3 bank statements to S3
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               bankStatements:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 maxItems: 3
 *                 description: Bank statement files (PDF, JPG, PNG - max 10MB each)
 *     responses:
 *       200:
 *         description: Files uploaded successfully
 *       400:
 *         description: Bad request
 *       500:
 *         description: Server error
 */
router.post('/multiple', uploadMultiple, handleMulterError, uploadController.uploadMultipleFiles);

/**
 * @swagger
 * /api/upload/delete:
 *   delete:
 *     tags: [Upload]
 *     summary: Delete a file from S3
 *     description: Delete a previously uploaded file from S3
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - key
 *             properties:
 *               key:
 *                 type: string
 *                 description: S3 file key
 *                 example: bank-statements/1234567890-abc123.pdf
 *     responses:
 *       200:
 *         description: File deleted successfully
 *       400:
 *         description: Bad request
 *       500:
 *         description: Server error
 */
router.delete('/delete', uploadController.deleteFile);

module.exports = router;

