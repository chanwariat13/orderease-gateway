require('dotenv').config({ path: './config.env' });

module.exports = {
  restaurantName: process.env.RESTAURANT_NAME || 'My Restaurant',
  totalTables: parseInt(process.env.TOTAL_TABLES || '10'),
  port: parseInt(process.env.PORT || '3000'),

  openingTime: process.env.OPENING_TIME || '09:00',
  closingTime: process.env.CLOSING_TIME || '23:00',
  closedDays: (process.env.CLOSED_DAYS || '')
    .split(',')
    .filter(function(d) { return d.trim(); })
    .map(Number),

  sessionTimeoutMinutes: parseInt(process.env.SESSION_TIMEOUT_MINUTES || '180'),
  autoApprove: process.env.AUTO_APPROVE === 'true',

  ownerWhatsapp: process.env.OWNER_WHATSAPP || '',
  staffPhones: (process.env.STAFF_PHONES || '')
    .split(',')
    .map(function(p) { return p.trim(); })
    .filter(function(p) { return p; }),

  evolutionUrl: process.env.EVOLUTION_API_URL || '',
  evolutionApiKey: process.env.EVOLUTION_API_KEY || '',
  evolutionInstance: process.env.EVOLUTION_INSTANCE_NAME || '',

  secretKey: process.env.SECRET_KEY || 'change-this-key',

  maxScansPerIpPerMinute: parseInt(process.env.MAX_SCANS_PER_IP_PER_MINUTE || '10'),
  maxSessionsPerPhonePerHour: parseInt(process.env.MAX_SESSIONS_PER_PHONE_PER_HOUR || '3'),
};
