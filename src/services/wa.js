var axios = require('axios');
var config = require('../config');

async function sendMessage(phoneNumber, message) {
  try {
    var phone = String(phoneNumber).replace(/[^0-9]/g, '');
    if (phone.length === 10) phone = '91' + phone;

    var url = config.evolutionUrl + '/message/sendText/' + config.evolutionInstance;

    await axios.post(url, {
      number: phone + '@s.whatsapp.net',
      text: message,
    }, {
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.evolutionApiKey,
      },
      timeout: 15000,
    });

    console.log('WhatsApp sent to ' + phone.slice(0, 5) + '****');
    return true;

  } catch (error) {
    console.error('WhatsApp send failed:', error.message);
    return false;
  }
}

module.exports = { sendMessage: sendMessage };
