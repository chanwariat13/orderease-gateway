var express = require('express');
var cors = require('cors');
var config = require('./config');
var hmac = require('./services/hmac');

var app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('trust proxy', true);

app.use('/', require('./routes/qr'));
app.use('/api/session', require('./routes/session'));
app.use('/api/admin', require('./routes/admin'));

app.get('/api/health', function(req, res) {
  var store = require('./services/store');
  res.json({
    status: 'ok',
    restaurant: config.restaurantName,
    tables: config.totalTables,
    hours: config.openingTime + ' - ' + config.closingTime,
    isOpen: store.isRestaurantOpen(),
    activeSessions: store.getAllActive().length,
    time: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
  });
});

app.get('/api/qr-urls', function(req, res) {
  var domain = req.hostname || 'localhost';
  var protocol = req.protocol || 'https';

  var urls = [];
  for (var i = 1; i <= config.totalTables; i++) {
    var table = 'T' + i;
    var sig = hmac.generateSignature(table);
    urls.push({
      table: table,
      url: protocol + '://' + domain + '/scan/' + table + '?sig=' + sig,
    });
  }

  res.json({
    success: true,
    restaurant: config.restaurantName,
    totalTables: config.totalTables,
    urls: urls,
  });
});

app.listen(config.port, '0.0.0.0', function() {
  console.log('');
  console.log('========================================');
  console.log('  OrderEase Security Gateway');
  console.log('  Restaurant: ' + config.restaurantName);
  console.log('  Tables: ' + config.totalTables);
  console.log('  Hours: ' + config.openingTime + ' - ' + config.closingTime);
  console.log('  Auto-approve: ' + config.autoApprove);
  console.log('  Port: ' + config.port);
  console.log('  Status: RUNNING');
  console.log('========================================');
  console.log('');
});
