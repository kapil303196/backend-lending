// Selects the address provider implementation based on ADDRESS_PROVIDER.
//   ADDRESS_PROVIDER=aws     -> Amazon Location Service (default)
//   ADDRESS_PROVIDER=google  -> Google Maps Platform (legacy)
//
// Both modules expose the same interface (searchAddress, getAddressDetails,
// geocodeAddress) with identical response shapes, so switching is a no-code
// rollback — just change the env var and restart.
const provider = (process.env.ADDRESS_PROVIDER || 'aws').toLowerCase();

const impl = provider === 'google'
  ? require('./googleMaps')
  : require('./amazonLocation');

console.log(`[address] using provider: ${provider === 'google' ? 'google' : 'aws'}`);

module.exports = impl;
