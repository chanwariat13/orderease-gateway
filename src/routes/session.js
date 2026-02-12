var express = require('express');
var router = express.Router();
var config = require('../config');
var store = require('../services/store');

router.get('/validate/:phone', function(req, res) {
  var result = store.validateSession(req.params.phone);
  return res.json(result);
});

router.put('/status/:phone', function(req, res) {
  var status = req.body.status;
  var ok = store.updateStatus(req.params.phone, status);
  return res.json({ success: ok });
});

router.delete('/end/:phone', function(req, res) {
  var ok = store.endSession(req.params.phone);
  return res.json({ success: ok });
});

router.get('/config', function(req, res) {
  return res.json({
    restaurantName: config.restaurantName,
    ownerWhatsapp: config.ownerWhatsapp,
    staffPhones: config.staffPhones,
    totalTables: config.totalTables,
    openingTime: config.openingTime,
    closingTime: config.closingTime,
    autoApprove: config.autoApprove,
  });
});

module.exports = router;
