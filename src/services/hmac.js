var crypto = require('crypto');
var config = require('../config');

function generateSignature(tableNumber) {
  return crypto
    .createHmac('sha256', config.secretKey)
    .update(tableNumber)
    .digest('hex');
}

function verifySignature(tableNumber, signature) {
  if (!signature || !tableNumber) return false;
  var expected = generateSignature(tableNumber);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(signature, 'hex')
    );
  } catch (e) {
    return false;
  }
}

function getQRUrl(domain, tableNumber) {
  var sig = generateSignature(tableNumber);
  return 'https://' + domain + '/scan/' + tableNumber + '?sig=' + sig;
}

module.exports = { generateSignature: generateSignature, verifySignature: verifySignature, getQRUrl: getQRUrl };
