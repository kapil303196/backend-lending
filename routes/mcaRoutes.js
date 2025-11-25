const express = require('express');
const router = express.Router();
const mcaController = require('../controllers/mcaController');

/**
 * @swagger
 * /api/mca:
 *   get:
 *     tags: [MCA]
 *     summary: Get all MCA records
 *     description: Retrieve all MCA records with pagination, filtering, and sorting
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Records per page
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by uniqueId
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: createdAt
 *         description: Field to sort by
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *     responses:
 *       200:
 *         description: List of MCA records
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginationResponse'
 *       500:
 *         description: Server error
 */
router.get('/', mcaController.getAllMCA);

/**
 * @swagger
 * /api/mca/stats:
 *   get:
 *     tags: [MCA]
 *     summary: Get MCA statistics
 *     description: Get statistics about MCA records (total, active, inactive, response rate)
 *     responses:
 *       200:
 *         description: MCA statistics
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
 *                     total:
 *                       type: number
 *                     active:
 *                       type: number
 *                     inactive:
 *                       type: number
 *                     withResponses:
 *                       type: number
 *                     responseRate:
 *                       type: string
 */
router.get('/stats', mcaController.getMCAStats);

/**
 * @swagger
 * /api/mca/{id}:
 *   get:
 *     tags: [MCA]
 *     summary: Get MCA by ID or uniqueId
 *     description: Retrieve a single MCA record by MongoDB ID or custom uniqueId
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId or uniqueId
 *         example: A1B2C3D4
 *       - in: query
 *         name: includeResponses
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include linked user responses
 *     responses:
 *       200:
 *         description: MCA record
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/MCA'
 *       404:
 *         description: MCA record not found
 */
router.get('/:id', mcaController.getMCAById);

/**
 * @swagger
 * /api/mca:
 *   post:
 *     tags: [MCA]
 *     summary: Create new MCA record
 *     description: Create a new MCA record. UniqueId will be auto-generated if not provided.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               uniqueId:
 *                 type: string
 *                 description: Optional - will be auto-generated if not provided
 *               businessName:
 *                 type: string
 *               contactPerson:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               amount:
 *                 type: string
 *               status:
 *                 type: string
 *             example:
 *               businessName: Example Corp
 *               contactPerson: John Doe
 *               email: john@example.com
 *               phone: 555-1234
 *               amount: "50000"
 *               status: pending
 *     responses:
 *       201:
 *         description: MCA record created successfully
 *       400:
 *         description: Invalid input or duplicate uniqueId
 */
router.post('/', mcaController.createMCA);

/**
 * @swagger
 * /api/mca/{id}:
 *   put:
 *     tags: [MCA]
 *     summary: Update MCA record
 *     description: Update an existing MCA record
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId or uniqueId
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             example:
 *               status: approved
 *               notes: Updated information
 *     responses:
 *       200:
 *         description: MCA record updated successfully
 *       404:
 *         description: MCA record not found
 */
router.put('/:id', mcaController.updateMCA);

/**
 * @swagger
 * /api/mca/{id}:
 *   patch:
 *     tags: [MCA]
 *     summary: Partial update MCA record
 *     description: Partially update an existing MCA record
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: MCA record updated successfully
 *       404:
 *         description: MCA record not found
 */
router.patch('/:id', mcaController.updateMCA);

/**
 * @swagger
 * /api/mca/{id}:
 *   delete:
 *     tags: [MCA]
 *     summary: Soft delete MCA record
 *     description: Soft delete an MCA record (sets isActive to false)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: MCA record soft deleted successfully
 *       404:
 *         description: MCA record not found
 */
router.delete('/:id', mcaController.softDeleteMCA);

/**
 * @swagger
 * /api/mca/{id}/restore:
 *   post:
 *     tags: [MCA]
 *     summary: Restore soft deleted MCA record
 *     description: Restore a soft deleted MCA record (sets isActive to true)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: MCA record restored successfully
 *       404:
 *         description: MCA record not found
 */
router.post('/:id/restore', mcaController.restoreMCA);

/**
 * @swagger
 * /api/mca/{id}/hard:
 *   delete:
 *     tags: [MCA]
 *     summary: Permanently delete MCA record
 *     description: Permanently delete an MCA record and all associated user responses (WARNING - This cannot be undone!)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: MCA record permanently deleted
 *       404:
 *         description: MCA record not found
 */
router.delete('/:id/hard', mcaController.hardDeleteMCA);

module.exports = router;

