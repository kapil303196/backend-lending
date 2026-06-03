const { searchAddress, getAddressDetails, geocodeAddress } = require('../utils/addressProvider');

// Search for address suggestions
exports.searchAddress = async (req, res) => {
  try {
    const { input } = req.query;

    if (!input || input.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Search input must be at least 3 characters'
      });
    }

    const suggestions = await searchAddress(input);

    res.json({
      success: true,
      data: suggestions
    });
  } catch (error) {
    console.error('Search address error:', error);
    res.status(500).json({
      success: false,
      message: 'Error searching address',
      error: error.message
    });
  }
};

// Get detailed address information
exports.getAddressDetails = async (req, res) => {
  try {
    const { placeId } = req.params;

    if (!placeId) {
      return res.status(400).json({
        success: false,
        message: 'Place ID is required'
      });
    }

    const addressDetails = await getAddressDetails(placeId);

    res.json({
      success: true,
      data: addressDetails
    });
  } catch (error) {
    console.error('Get address details error:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting address details',
      error: error.message
    });
  }
};

// Geocode an address
exports.geocodeAddress = async (req, res) => {
  try {
    const { address } = req.query;

    if (!address) {
      return res.status(400).json({
        success: false,
        message: 'Address is required'
      });
    }

    const geocodeResult = await geocodeAddress(address);

    res.json({
      success: true,
      data: geocodeResult
    });
  } catch (error) {
    console.error('Geocode address error:', error);
    res.status(500).json({
      success: false,
      message: 'Error geocoding address',
      error: error.message
    });
  }
};

