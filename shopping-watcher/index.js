require('dotenv').config();
const { checkGmailAndNotify } = require('./src/processor');

exports.gmailWatcher = async (req, res) => {
  try {
    await checkGmailAndNotify();
    res.status(200).send('OK');
  } catch (err) {
    console.error('gmailWatcher failed:', err);
    res.status(500).send('Internal Server Error');
  }
};
