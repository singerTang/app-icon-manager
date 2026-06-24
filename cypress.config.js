const { defineConfig } = require('cypress');

module.exports = defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3002',
    specPattern: 'cypress/e2e/**/*.cy.js',
    supportFile: false,
    video: false,
    screenshotsFolder: 'cypress/screenshots',
    viewportWidth: 1400,
    viewportHeight: 900,
  },
});
