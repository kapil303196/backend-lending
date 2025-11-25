const express = require('express');
const router = express.Router();
const addressController = require('../controllers/addressController');

/**
 * @swagger
 * /api/address/search:
 *   get:
 *     tags: [Address]
 *     summary: Search for address suggestions
 *     description: Get autocomplete suggestions for address input using Google Places API
 *     parameters:
 *       - in: query
 *         name: input
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 3
 *         description: Address search query (minimum 3 characters)
 *         example: 123 Main St
 *     responses:
 *       200:
 *         description: Address suggestions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       description:
 *                         type: string
 *                       placeId:
 *                         type: string
 *                       mainText:
 *                         type: string
 *                       secondaryText:
 *                         type: string
 *       400:
 *         description: Bad request
 *       500:
 *         description: Server error
 */
router.get('/search', addressController.searchAddress);

/**
 * @swagger
 * /api/address/details/{placeId}:
 *   get:
 *     tags: [Address]
 *     summary: Get detailed address information
 *     description: Get full address details including street, city, state, and zip from Google Place ID
 *     parameters:
 *       - in: path
 *         name: placeId
 *         required: true
 *         schema:
 *           type: string
 *         description: Google Place ID
 *         example: ChIJN1t_tDeuEmsRUsoyG83frY4
 *     responses:
 *       200:
 *         description: Address details retrieved successfully
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
 *                     formattedAddress:
 *                       type: string
 *                     streetAddress:
 *                       type: string
 *                     city:
 *                       type: string
 *                     state:
 *                       type: string
 *                     stateShort:
 *                       type: string
 *                     zipCode:
 *                       type: string
 *                     country:
 *                       type: string
 *                     lat:
 *                       type: number
 *                     lng:
 *                       type: number
 *       400:
 *         description: Bad request
 *       500:
 *         description: Server error
 */
router.get('/details/:placeId', addressController.getAddressDetails);

/**
 * @swagger
 * /api/address/geocode:
 *   get:
 *     tags: [Address]
 *     summary: Geocode an address
 *     description: Convert an address string to coordinates
 *     parameters:
 *       - in: query
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *         description: Full address string
 *         example: 1600 Amphitheatre Parkway, Mountain View, CA
 *     responses:
 *       200:
 *         description: Address geocoded successfully
 *       400:
 *         description: Bad request
 *       500:
 *         description: Server error
 */
router.get('/geocode', addressController.geocodeAddress);

module.exports = router;

