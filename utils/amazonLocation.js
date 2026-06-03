const {
  GeoPlacesClient,
  AutocompleteCommand,
  GetPlaceCommand,
  GeocodeCommand
} = require("@aws-sdk/client-geo-places");

// Amazon Location Service "Places" (GeoPlaces) is a serverless API — no Place
// Index resource needs to be provisioned, only IAM permissions (see below).
//
// Required IAM permissions on the AWS user/role whose keys are in .env:
//   geo-places:Autocomplete
//   geo-places:GetPlace
//   geo-places:Geocode
//
// GeoPlaces is only available in a subset of regions. If AWS_REGION is not a
// supported geo region, set AWS_GEO_REGION (e.g. us-east-1) to override.
const geoRegion = process.env.AWS_GEO_REGION || process.env.AWS_REGION || 'us-east-1';

// Restrict results to a single country for better US-address quality.
// Set ADDRESS_COUNTRY='' to disable the filter (worldwide results).
const includeCountries =
  process.env.ADDRESS_COUNTRY === '' ? null : [process.env.ADDRESS_COUNTRY || 'USA'];

// The v3 SDK reads credentials from the standard provider chain (env vars,
// shared config, or an attached instance/role). We pass the same keys the rest
// of the app uses when they are present so behaviour matches config/aws.js.
const clientConfig = { region: geoRegion };
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  clientConfig.credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  };
}

const client = new GeoPlacesClient(clientConfig);

/**
 * Normalise a postal code. Amazon returns US codes as ZIP+4 ("94043-1351");
 * Google returned the 5-digit ZIP, so strip the +4 to keep behaviour identical.
 */
const normalizeZip = (postalCode) => {
  if (!postalCode) return '';
  const trimmed = postalCode.split(/[\s,]/)[0];
  return /^\d{5}-\d{4}$/.test(trimmed) ? trimmed.slice(0, 5) : trimmed;
};

/**
 * Split a formatted address label into bold "main text" (the street line) and
 * grey "secondary text" (the rest), mirroring Google's structured_formatting.
 * Amazon's Autocomplete only returns the formatted Label (not granular fields),
 * and its Title is a reversed comma list, so we parse the Label on first comma.
 * e.g. "1600 Amphitheatre Pkwy, Mountain View, CA 94043, United States"
 *   -> mainText: "1600 Amphitheatre Pkwy"
 *   -> secondaryText: "Mountain View, CA 94043, United States"
 */
const splitLabel = (label) => {
  if (!label) return { mainText: '', secondaryText: '' };
  const idx = label.indexOf(', ');
  if (idx === -1) return { mainText: label, secondaryText: '' };
  return { mainText: label.slice(0, idx), secondaryText: label.slice(idx + 2) };
};

/**
 * Search for address autocomplete suggestions.
 * @param {String} input - Address search query
 * @returns {Promise<Array>} - Array of address suggestions (same shape as the
 *   previous Google Maps implementation: description, placeId, mainText, secondaryText)
 */
const searchAddress = async (input) => {
  try {
    const command = new AutocompleteCommand({
      QueryText: input,
      MaxResults: 5,
      Language: 'en',
      ...(includeCountries ? { Filter: { IncludeCountries: includeCountries } } : {})
    });

    const response = await client.send(command);
    const items = response.ResultItems || [];

    return items.map((item) => {
      const label = item.Address?.Label || item.Title || '';
      const { mainText, secondaryText } = splitLabel(label);
      return { description: label, placeId: item.PlaceId, mainText, secondaryText };
    });
  } catch (error) {
    console.error('Address search error:', error);
    throw new Error(`Failed to search address: ${error.message}`);
  }
};

/**
 * Get detailed address information by place ID.
 * @param {String} placeId - Amazon Location PlaceId (returned by searchAddress)
 * @returns {Promise<Object>} - Detailed address components (same shape as before)
 */
const getAddressDetails = async (placeId) => {
  try {
    const command = new GetPlaceCommand({ PlaceId: placeId, Language: 'en' });
    const result = await client.send(command);

    const a = result.Address || {};
    const position = result.Position || []; // [lng, lat]

    // Region.Code can come back as "NY" or "US-NY" — normalise to the short code.
    const regionCode = a.Region?.Code || '';
    const stateShort = regionCode.includes('-') ? regionCode.split('-').pop() : regionCode;

    const zipCode = normalizeZip(a.PostalCode);

    const streetAddress = `${a.AddressNumber || ''} ${a.Street || ''}`.trim();

    return {
      formattedAddress: a.Label || result.Title || '',
      streetNumber: a.AddressNumber || '',
      route: a.Street || '',
      streetAddress,
      city: a.Locality || '',
      state: a.Region?.Name || '',
      stateShort,
      zipCode,
      country: a.Country?.Name || '',
      lat: position.length === 2 ? position[1] : null,
      lng: position.length === 2 ? position[0] : null
    };
  } catch (error) {
    console.error('Get address details error:', error);
    throw new Error(`Failed to get address details: ${error.message}`);
  }
};

/**
 * Geocode an address string to coordinates.
 * @param {String} address - Address string
 * @returns {Promise<Object>} - Coordinates and formatted address (same shape as before)
 */
const geocodeAddress = async (address) => {
  try {
    const command = new GeocodeCommand({
      QueryText: address,
      MaxResults: 1,
      Language: 'en',
      ...(includeCountries ? { Filter: { IncludeCountries: includeCountries } } : {})
    });

    const response = await client.send(command);
    const items = response.ResultItems || [];

    if (items.length === 0) {
      throw new Error('No results found for this address');
    }

    const item = items[0];
    const position = item.Position || []; // [lng, lat]

    return {
      formattedAddress: item.Address?.Label || item.Title || '',
      lat: position.length === 2 ? position[1] : null,
      lng: position.length === 2 ? position[0] : null,
      placeId: item.PlaceId
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
