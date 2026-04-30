const { google } = require('googleapis');

/**
 * @returns {import('googleapis').Auth.OAuth2Client}
 */
function createAuthClient() {
  throw new Error('not implemented');
}

/**
 * @param {import('googleapis').Auth.OAuth2Client} auth
 * @param {Date} since
 * @returns {Promise<import('../../docs/interfaces').Email[]>}
 */
async function fetchShoppingEmails(auth, since) {
  throw new Error('not implemented');
}

module.exports = { createAuthClient, fetchShoppingEmails };
