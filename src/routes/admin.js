var express = require('express');
var router = express.Router();
var config = require('../config');
var store = require('../services/store');
var wa = require('../services/wa');

router.get('/sessions', function(req, res) {
  var sessions = store.getAllActive();
  return res.json({ success: true, count: sessions.length, sessions: sessions });
});

router.get('/table-status', function(req, res) {
  var tables = [];
  for (var i = 1; i <= config.totalTables; i++) {
    var t = 'T' + i;
    var session = store.getSessionByTable(t);
    tables.push({
      table: t,
      status: session ? session.status : 'FREE',
      phone: session ? (session.phone.slice(0, 4) + 'xxxxx' + session.phone.slice(-3)) : null,
      since: session ? new Date(session.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : null,
    });
  }
  return res.json({ success: true, tables: tables });
});

router.post('/approve/:phone', async function(req, res) {
  var phone = req.params.phone;
  var session = store.getSession(phone);

  if (!session) {
    return res.json({ success: false, error: 'Session not found or expired' });
  }

  if (session.status !== 'PENDING_APPROVAL') {
    return res.json({ success: false, error: 'Session is not pending. Status: ' + session.status });
  }

  store.updateStatus(phone, 'ORDERING');

  await wa.sendMessage(phone,
    '✅ Your table has been verified!\n\n' +
    '🍽️ Welcome to ' + config.restaurantName + '!\n' +
    '📍 You are at ' + session.table + '\n\n' +
    'Send MENU to see our menu\n' +
    'Or start ordering: "2 Paneer Tikka"\n\n' +
    'Type HELP for all commands'
  );

  for (var i = 0; i < config.staffPhones.length; i++) {
    await wa.sendMessage(config.staffPhones[i],
      '✅ Approved: ' + phone.slice(0, 4) + '****' + ' at ' + session.table
    );
  }

  return res.json({ success: true, message: 'Session approved for ' + session.table });
});

router.post('/reject/:phone', async function(req, res) {
  var phone = req.params.phone;
  store.updateStatus(phone, 'CANCELLED');

  await wa.sendMessage(phone,
    '❌ Your session was not approved.\n\nPlease visit ' + config.restaurantName + ' and scan the QR code at your table.'
  );

  return res.json({ success: true, message: 'Session rejected' });
});

router.post('/block/:phone', function(req, res) {
  store.blockNumber(req.params.phone);
  return res.json({ success: true, message: 'Number blocked: ' + req.params.phone });
});

router.delete('/block/:phone', function(req, res) {
  store.unblockNumber(req.params.phone);
  return res.json({ success: true, message: 'Number unblocked: ' + req.params.phone });
});

router.get('/blocked', function(req, res) {
  return res.json({ success: true, blocked: store.getBlockedList() });
});

router.post('/end-session/:phone', function(req, res) {
  store.endSession(req.params.phone);
  return res.json({ success: true, message: 'Session ended' });
});

module.exports = router;
