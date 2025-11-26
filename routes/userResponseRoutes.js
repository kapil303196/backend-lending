const express = require('express');
const router = express.Router();
const userResponseController = require('../controllers/userResponseController');

/**
 * @swagger
 * /api/responses:
 *   get:
 *     tags: [User Responses]
 *     summary: Get all user responses
 *     description: Retrieve all user responses with pagination, filtering, and sorting
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, submitted, approved, rejected]
 *       - in: query
 *         name: mcaId
 *         schema:
 *           type: string
 *       - in: query
 *         name: uniqueId
 *         schema:
 *           type: string
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [createdAt, uniqueId, status, amount, revenue]
 *           default: createdAt
 *         description: Field to sort by (amount = formData.amountRequested, revenue = formData.monthlyRevenue)
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order (ascending or descending)
 *     responses:
 *       200:
 *         description: List of user responses
 */
router.get('/', userResponseController.getAllResponses);

/**
 * @swagger
 * /api/responses/dashboard-stats:
 *   get:
 *     tags: [User Responses]
 *     summary: Get comprehensive dashboard statistics
 *     description: Get detailed stats for charts (funding per day, amounts, revenue vs lending)
 *     responses:
 *       200:
 *         description: Dashboard statistics
 */
router.get('/dashboard-stats', userResponseController.getDashboardStats);

/**
 * @swagger
 * /api/responses/stats:
 *   get:
 *     tags: [User Responses]
 *     summary: Get response statistics
 *     description: Get statistics about user responses (total, by status)
 *     responses:
 *       200:
 *         description: Response statistics
 */
router.get('/stats', userResponseController.getResponseStats);

/**
 * @swagger
 * /api/responses/mca/{id}:
 *   get:
 *     tags: [User Responses]
 *     summary: Get responses for specific MCA
 *     description: Get all user responses for a specific MCA record
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId or uniqueId of MCA record
 *     responses:
 *       200:
 *         description: List of responses for the MCA
 *       404:
 *         description: MCA record not found
 */
router.get('/mca/:id', userResponseController.getResponsesByMCA);

/**
 * @swagger
 * /api/responses/{id}:
 *   get:
 *     tags: [User Responses]
 *     summary: Get response by ID
 *     description: Retrieve a single user response by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User response
 *       404:
 *         description: Response not found
 */
router.get('/:id', userResponseController.getResponseById);

/**
 * @swagger
 * /api/responses:
 *   post:
 *     tags: [User Responses]
 *     summary: Submit user response
 *     description: Submit a user form response. This will automatically link to the MCA record.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - uniqueId
 *             properties:
 *               uniqueId:
 *                 type: string
 *                 description: UniqueId of the MCA record
 *                 example: A1B2C3D4
 *               isVerified:
 *                 type: boolean
 *                 default: false
 *               comments:
 *                 type: string
 *                 example: All information is correct
 *               formData:
 *                 type: object
 *                 description: Flexible form data
 *               verifiedFields:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     fieldName:
 *                       type: string
 *                     isCorrect:
 *                       type: boolean
 *                     correctedValue:
 *                       type: string
 *                     note:
 *                       type: string
 *               userContact:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                   email:
 *                     type: string
 *                   phone:
 *                     type: string
 *               status:
 *                 type: string
 *                 enum: [pending, submitted, approved, rejected]
 *                 default: pending
 *     responses:
 *       201:
 *         description: Response submitted successfully
 *       400:
 *         description: Invalid input or uniqueId not found
 *       404:
 *         description: MCA record not found
 */
router.post('/', userResponseController.createResponse);

/**
 * @swagger
 * /api/responses/{id}:
 *   put:
 *     tags: [User Responses]
 *     summary: Update user response
 *     description: Update an existing user response
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
 *         description: Response updated successfully
 *       404:
 *         description: Response not found
 */
router.put('/:id', userResponseController.updateResponse);

/**
 * @swagger
 * /api/responses/{id}:
 *   patch:
 *     tags: [User Responses]
 *     summary: Partial update user response
 *     description: Partially update an existing user response
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
 *         description: Response updated successfully
 *       404:
 *         description: Response not found
 */
router.patch('/:id', userResponseController.updateResponse);

/**
 * @swagger
 * /api/responses/{id}/status:
 *   patch:
 *     tags: [User Responses]
 *     summary: Update response status
 *     description: Update the status of a user response
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
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, submitted, approved, rejected]
 *                 example: approved
 *     responses:
 *       200:
 *         description: Status updated successfully
 *       400:
 *         description: Invalid status value
 *       404:
 *         description: Response not found
 */
router.patch('/:id/status', userResponseController.updateResponseStatus);

/**
 * @swagger
 * /api/responses/{id}:
 *   delete:
 *     tags: [User Responses]
 *     summary: Delete user response
 *     description: Delete a user response and remove it from the MCA's userResponses array
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Response deleted successfully
 *       404:
 *         description: Response not found
 */
router.delete('/:id', userResponseController.deleteResponse);

module.exports = router;

