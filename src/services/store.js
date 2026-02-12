var fs = require('fs');
var path = require('path');
var config = require('../config');

var DATA_DIR = path.join(__dirname, '../data');
var SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
var BLOCKED_FILE = path.join(DATA_DIR, 'blocked.json');
var RATES_FILE = path.join(DATA_DIR, 'ratelimits.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load(filePath, defaultVal) {
  try {
    if (fs.existsSync(filePath)) {
      var raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Load error:', filePath, e.message);
  }
  return defaultVal;
}

function save(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Save error:', filePath, e.message);
  }
}

var sessions = load(SESSIONS_FILE, {});
var blocked = load(BLOCKED_FILE, []);
var rates = load(RATES_FILE, {});

function isRestaurantOpen() {
  var now = new Date();
  var ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));

  if (config.closedDays.indexOf(ist.getDay()) !== -1) {
    return false;
  }

  var currentMins = ist.getHours() * 60 + ist.getMinutes();
  var openParts = config.openingTime.split(':');
  var closeParts = config.closingTime.split(':');
  var openMins = parseInt(openParts[0]) * 60 + parseInt(openParts[1]);
  var closeMins = parseInt(closeParts[0]) * 60 + parseInt(closeParts[1]);

  return currentMins >= openMins && currentMins <= closeMins;
}

function cleanExpired() {
  var now = Date.now();
  var cleaned = 0;

  for (var phone in sessions) {
    var s = sessions[phone];
    if (s.expiresAt < now && s.status !== 'PAID') {
      s.status = 'EXPIRED';
      cleaned++;
    }
  }

  if (cleaned > 0) {
    save(SESSIONS_FILE, sessions);
    console.log('Cleaned ' + cleaned + ' expired sessions');
  }
}

function createSession(phone, tableNumber) {
  var now = Date.now();

  sessions[phone] = {
    phone: phone,
    table: tableNumber,
    status: config.autoApprove ? 'ORDERING' : 'PENDING_APPROVAL',
    createdAt: now,
    expiresAt: now + (config.sessionTimeoutMinutes * 60 * 1000),
    lastActivity: now,
  };

  save(SESSIONS_FILE, sessions);
  return sessions[phone];
}

function getSession(phone) {
  cleanExpired();

  var s = sessions[phone];
  if (!s) return null;

  if (s.expiresAt < Date.now() && s.status !== 'PAID') {
    return null;
  }

  if (s.status === 'CHECKED_OUT' || s.status === 'CANCELLED' || s.status === 'EXPIRED') {
    return null;
  }

  return s;
}

function validateSession(phone) {
  if (isBlocked(phone)) {
    return {
      valid: false,
      reason: 'BLOCKED',
      message: '🚫 Your number has been blocked. Please contact restaurant staff.'
    };
  }

  if (!isRestaurantOpen()) {
    return {
      valid: false,
      reason: 'CLOSED',
      message: '🌙 ' + config.restaurantName + ' is currently closed.\n\n⏰ Hours: ' + config.openingTime + ' - ' + config.closingTime + '\n\nVisit us during business hours!'
    };
  }

  var session = getSession(phone);

  if (!session) {
    return {
      valid: false,
      reason: 'NO_SESSION',
      message: '👋 Welcome! Please scan the QR code on your table to start ordering.\n\n📱 Point your camera at the QR code on your table.'
    };
  }

  if (session.status === 'PENDING_APPROVAL') {
    return {
      valid: false,
      reason: 'PENDING_APPROVAL',
      message: '⏳ Please wait! Staff is verifying your table.\n\nYou will receive a message once approved.'
    };
  }

  session.lastActivity = Date.now();
  save(SESSIONS_FILE, sessions);

  return {
    valid: true,
    phone: session.phone,
    table: session.table,
    status: session.status,
    expiresAt: session.expiresAt,
  };
}

function updateStatus(phone, newStatus) {
  if (sessions[phone]) {
    sessions[phone].status = newStatus;
    sessions[phone].lastActivity = Date.now();
    save(SESSIONS_FILE, sessions);
    return true;
  }
  return false;
}

function endSession(phone) {
  if (sessions[phone]) {
    sessions[phone].status = 'CHECKED_OUT';
    save(SESSIONS_FILE, sessions);
    return true;
  }
  return false;
}

function getSessionByTable(tableNumber) {
  cleanExpired();

  for (var phone in sessions) {
    var s = sessions[phone];
    if (
      s.table === tableNumber &&
      s.status !== 'CHECKED_OUT' &&
      s.status !== 'CANCELLED' &&
      s.status !== 'EXPIRED' &&
      s.expiresAt > Date.now()
    ) {
      return s;
    }
  }
  return null;
}

function getAllActive() {
  cleanExpired();
  var list = [];

  for (var phone in sessions) {
    var s = sessions[phone];
    if (
      s.status !== 'CHECKED_OUT' &&
      s.status !== 'CANCELLED' &&
      s.status !== 'EXPIRED' &&
      s.expiresAt > Date.now()
    ) {
      list.push(s);
    }
  }

  return list;
}

function isBlocked(phone) {
  return blocked.indexOf(phone) !== -1;
}

function blockNumber(phone) {
  if (blocked.indexOf(phone) === -1) {
    blocked.push(phone);
    save(BLOCKED_FILE, blocked);
  }
  if (sessions[phone]) {
    sessions[phone].status = 'CANCELLED';
    save(SESSIONS_FILE, sessions);
  }
}

function unblockNumber(phone) {
  blocked = blocked.filter(function(p) { return p !== phone; });
  save(BLOCKED_FILE, blocked);
}

function getBlockedList() {
  return blocked;
}

function checkRate(identifier, maxCount, windowMs) {
  var now = Date.now();

  if (!rates[identifier]) {
    rates[identifier] = { count: 1, start: now };
    save(RATES_FILE, rates);
    return { allowed: true, remaining: maxCount - 1 };
  }

  var entry = rates[identifier];

  if (now - entry.start > windowMs) {
    entry.count = 1;
    entry.start = now;
    save(RATES_FILE, rates);
    return { allowed: true, remaining: maxCount - 1 };
  }

  if (entry.count >= maxCount) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  save(RATES_FILE, rates);
  return { allowed: true, remaining: maxCount - entry.count };
}

setInterval(function() {
  cleanExpired();
  var now = Date.now();
  var cleaned = false;
  for (var key in rates) {
    if (now - rates[key].start > 3600000) {
      delete rates[key];
      cleaned = true;
    }
  }
  if (cleaned) save(RATES_FILE, rates);
}, 5 * 60 * 1000);

module.exports = {
  isRestaurantOpen: isRestaurantOpen,
  createSession: createSession,
  getSession: getSession,
  validateSession: validateSession,
  updateStatus: updateStatus,
  endSession: endSession,
  getSessionByTable: getSessionByTable,
  getAllActive: getAllActive,
  isBlocked: isBlocked,
  blockNumber: blockNumber,
  unblockNumber: unblockNumber,
  getBlockedList: getBlockedList,
  checkRate: checkRate,
  cleanExpired: cleanExpired,
};
