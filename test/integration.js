const path = require('node:path');
const { tests } = require('@iobroker/testing');

// Starts the adapter in a real js-controller environment and checks that it comes up
tests.integration(path.join(__dirname, '..'));
