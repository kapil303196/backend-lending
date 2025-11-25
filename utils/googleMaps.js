const { Client } = require("@googlemaps/google-maps-services-js");

// Initialize Google Maps client
const client = new Client({});

const apiKey = process.env.MAPS_API_KEY;

/**
 * Search for address autocomplete suggestions
 * @param {String} input - Address search query
 * @returns {Promise<Array>} - Array of address suggestions
 */
const searchAddress = async (input) => {
  try {
    if (!apiKey) {
      throw new Error('MAPS_API_KEY is not configured');
    }

    const response = await client.placeAutocomplete({
      params: {
        input: input,
        key: apiKey,
        types: 'address'
      }
    });

    return response.data.predictions.map(prediction => ({
      description: prediction.description,
      placeId: prediction.place_id,
      mainText: prediction.structured_formatting.main_text,
      secondaryText: prediction.structured_formatting.secondary_text
    }));
  } catch (error) {
    console.error('Address search error:', error);
    throw new Error(`Failed to search address: ${error.message}`);
  }
};

/**
 * Get detailed address information by place ID
 * @param {String} placeId - Google Place ID
 * @returns {Promise<Object>} - Detailed address components
 */
const getAddressDetails = async (placeId) => {
  try {
    if (!apiKey) {
      throw new Error('MAPS_API_KEY is not configured');
    }

    const response = await client.placeDetails({
      params: {
        place_id: placeId,
        key: apiKey,
        fields: ['address_components', 'formatted_address', 'geometry']
      }
    });

    const result = response.data.result;
    const components = result.address_components;

    // Extract address components
    const addressData = {
      formattedAddress: result.formatted_address,
      streetNumber: '',
      route: '',
      streetAddress: '',
      city: '',
      state: '',
      stateShort: '',
      zipCode: '',
      country: '',
      lat: result.geometry?.location?.lat || null,
      lng: result.geometry?.location?.lng || null
    };

    components.forEach(component => {
      const types = component.types;
      
      if (types.includes('street_number')) {
        addressData.streetNumber = component.long_name;
      }
      if (types.includes('route')) {
        addressData.route = component.long_name;
      }
      if (types.includes('locality')) {
        addressData.city = component.long_name;
      }
      if (types.includes('administrative_area_level_1')) {
        addressData.state = component.long_name;
        addressData.stateShort = component.short_name;
      }
      if (types.includes('postal_code')) {
        addressData.zipCode = component.long_name;
      }
      if (types.includes('country')) {
        addressData.country = component.long_name;
      }
    });

    // Construct full street address
    addressData.streetAddress = `${addressData.streetNumber} ${addressData.route}`.trim();

    return addressData;
  } catch (error) {
    console.error('Get address details error:', error);
    throw new Error(`Failed to get address details: ${error.message}`);
  }
};

/**
 * Geocode an address string to coordinates
 * @param {String} address - Address string
 * @returns {Promise<Object>} - Coordinates and formatted address
 */
const geocodeAddress = async (address) => {
  try {
    if (!apiKey) {
      throw new Error('MAPS_API_KEY is not configured');
    }

    const response = await client.geocode({
      params: {
        address: address,
        key: apiKey
      }
    });

    if (response.data.results.length === 0) {
      throw new Error('No results found for this address');
    }

    const result = response.data.results[0];
    
    return {
      formattedAddress: result.formatted_address,
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng,
      placeId: result.place_id
    };
  } catch (error) {
    console.error('Geocode address error:', error);
    throw new Error(`Failed to geocode address: ${error.message}`);
  }
};

module.exports = {
  searchAddress,
  getAddressDetails,
  geocodeAddress
};

