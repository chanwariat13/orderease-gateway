var express = require('express');
var router = express.Router();
var config = require('../config');
var hmac = require('../services/hmac');
var store = require('../services/store');
var wa = require('../services/wa');

router.get('/scan/:tableNumber', function(req, res) {
  var tableNumber = req.params.tableNumber;
  var sig = req.query.sig;

  if (!sig || !hmac.verifySignature(tableNumber, sig)) {
    return res.send(errorPage('Invalid QR Code', 'This QR code is not valid.<br>Please scan the QR code placed on your table.'));
  }

  var num = parseInt(tableNumber.replace('T', ''));
  if (isNaN(num) || num < 1 || num > config.totalTables) {
    return res.send(errorPage('Invalid Table', 'This table does not exist.'));
  }

  if (!store.isRestaurantOpen()) {
    return res.send(closedPage());
  }

  var ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  var ipCheck = store.checkRate('ip:' + ip, config.maxScansPerIpPerMinute, 60000);
  if (!ipCheck.allowed) {
    return res.send(errorPage('Too Many Requests', 'Please wait a moment and try again.'));
  }

  return res.send(phonePage(tableNumber, sig));
});

router.post('/register', async function(req, res) {
  try {
    var tableNumber = req.body.tableNumber;
    var phoneNumber = req.body.phoneNumber;
    var signature = req.body.signature;

    if (!tableNumber || !phoneNumber || !signature) {
      return res.json({ success: false, error: 'Missing information. Please try again.' });
    }

    if (!hmac.verifySignature(tableNumber, signature)) {
      return res.json({ success: false, error: 'Invalid QR code. Please scan the QR on your table.' });
    }

    var phone = String(phoneNumber).replace(/[^0-9]/g, '');
    if (phone.charAt(0) === '0') phone = phone.substring(1);
    if (phone.length === 10) phone = '91' + phone;

    if (phone.length !== 12 || phone.substring(0, 2) !== '91') {
      return res.json({ success: false, error: 'Please enter a valid 10-digit mobile number.' });
    }

    if (store.isBlocked(phone)) {
      return res.json({ success: false, error: 'This number has been blocked. Please contact staff.' });
    }

    var phoneCheck = store.checkRate('phone:' + phone, config.maxSessionsPerPhonePerHour, 3600000);
    if (!phoneCheck.allowed) {
      return res.json({ success: false, error: 'Too many requests from this number. Try again later.' });
    }

    if (!store.isRestaurantOpen()) {
      return res.json({ success: false, error: 'Restaurant is currently closed.' });
    }

    var existing = store.getSession(phone);
    if (existing) {
      return res.json({
        success: true,
        action: 'EXISTING',
        message: 'You already have an active session at ' + existing.table + '.\n\nCheck your WhatsApp!'
      });
    }

    var tableOccupied = store.getSessionByTable(tableNumber);
    if (tableOccupied) {
      return res.json({
        success: false,
        error: 'Table ' + tableNumber + ' already has an active session.\n\nAsk your friend to order for you, or contact staff.'
      });
    }

    var session = store.createSession(phone, tableNumber);

    if (!config.autoApprove) {
      var maskedPhone = phone.slice(0, 4) + 'xxxxx' + phone.slice(-3);

      var staffMsg =
        '🔔 NEW CUSTOMER REQUEST\n\n' +
        '📍 Table: ' + tableNumber + '\n' +
        '📱 Phone: ' + maskedPhone + '\n' +
        '⏰ Time: ' + new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + '\n\n' +
        '👉 Please check if someone is sitting at ' + tableNumber + '\n\n' +
        'To APPROVE, reply:\nAPPROVE ' + phone + '\n\n' +
        'To REJECT, reply:\nREJECT ' + phone;

      for (var i = 0; i < config.staffPhones.length; i++) {
        await wa.sendMessage(config.staffPhones[i], staffMsg);
      }

      await wa.sendMessage(phone,
        '⏳ Welcome to ' + config.restaurantName + '!\n\n' +
        '📍 Table: ' + tableNumber + '\n\n' +
        'Staff is verifying your table.\nYou will receive a message once approved.\n\nPlease wait... 🙏'
      );

      return res.json({
        success: true,
        action: 'PENDING',
        message: 'Staff is verifying your table.\nYou will get a WhatsApp message once approved! 📱'
      });
    }

    await wa.sendMessage(phone,
      '🍽️ Welcome to ' + config.restaurantName + '!\n\n' +
      '📍 You are at ' + tableNumber + '\n' +
      '✅ Your session is active!\n\n' +
      'Send MENU to see our menu\n' +
      'Or start ordering: "2 Paneer Tikka"\n\n' +
      'Type HELP for all commands'
    );

    return res.json({
      success: true,
      action: 'APPROVED',
      message: 'Session started! ✅\n\nCheck your WhatsApp for the menu! 📱'
    });

  } catch (error) {
    console.error('Registration error:', error);
    return res.json({ success: false, error: 'Something went wrong. Please try again.' });
  }
});

function phonePage(tableNumber, signature) {
  return '<!DOCTYPE html>' +
'<html lang="en">' +
'<head>' +
'<meta charset="UTF-8">' +
'<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">' +
'<title>' + config.restaurantName + '</title>' +
'<style>' +
'*{margin:0;padding:0;box-sizing:border-box}' +
'body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}' +
'.card{background:#fff;border-radius:24px;padding:40px 28px;max-width:380px;width:100%;box-shadow:0 25px 60px rgba(0,0,0,0.3);text-align:center}' +
'.emoji{font-size:52px;margin-bottom:8px}' +
'h1{font-size:22px;color:#333;margin-bottom:4px;font-weight:700}' +
'.table-badge{display:inline-block;background:linear-gradient(135deg,#f093fb,#f5576c);color:#fff;padding:8px 24px;border-radius:25px;font-size:16px;font-weight:700;margin:12px 0 20px}' +
'.subtitle{color:#888;font-size:14px;margin-bottom:20px}' +
'.input-wrap{display:flex;border:2px solid #e0e0e0;border-radius:14px;overflow:hidden;margin:12px 0;transition:border-color 0.3s}' +
'.input-wrap:focus-within{border-color:#667eea}' +
'.prefix{background:#f8f8f8;padding:15px 14px;font-size:16px;color:#666;font-weight:600;border-right:2px solid #e0e0e0}' +
'input{flex:1;padding:15px 14px;font-size:18px;border:none;outline:none;letter-spacing:1px}' +
'button{width:100%;padding:16px;background:#25D366;color:#fff;border:none;border-radius:14px;font-size:17px;font-weight:700;cursor:pointer;margin-top:8px;transition:background 0.3s}' +
'button:hover{background:#1da851}' +
'button:disabled{background:#ccc;cursor:not-allowed}' +
'.loading{display:none;color:#667eea;font-size:15px;margin-top:12px;font-weight:600}' +
'.error{display:none;color:#e74c3c;font-size:14px;margin-top:12px;background:#ffeaea;padding:10px;border-radius:10px}' +
'.success{display:none;color:#27ae60;font-size:15px;margin-top:12px;background:#eafff0;padding:14px;border-radius:10px;font-weight:600}' +
'.info{font-size:12px;color:#aaa;margin-top:18px;line-height:1.6}' +
'</style>' +
'</head>' +
'<body>' +
'<div class="card">' +
'<div class="emoji">🍽️</div>' +
'<h1>' + config.restaurantName + '</h1>' +
'<div class="table-badge">📍 Table ' + tableNumber.replace('T', '') + '</div>' +
'<p class="subtitle">Enter your phone number to start ordering via WhatsApp</p>' +
'<form id="f">' +
'<div class="input-wrap">' +
'<span class="prefix">+91</span>' +
'<input type="tel" id="phone" placeholder="98765 43210" maxlength="10" inputmode="numeric" required autofocus>' +
'</div>' +
'<button type="submit" id="btn">📱 Start Ordering via WhatsApp</button>' +
'<div class="loading" id="load">⏳ Setting up your session...</div>' +
'<div class="error" id="err"></div>' +
'<div class="success" id="suc"></div>' +
'</form>' +
'<p class="info">⚡ Orders via WhatsApp &bull; No app needed<br>🔒 Your number is safe with us</p>' +
'</div>' +
'<script>' +
'var f=document.getElementById("f");' +
'var p=document.getElementById("phone");' +
'var btn=document.getElementById("btn");' +
'var load=document.getElementById("load");' +
'var err=document.getElementById("err");' +
'var suc=document.getElementById("suc");' +
'p.addEventListener("input",function(e){e.target.value=e.target.value.replace(/[^0-9]/g,"").slice(0,10)});' +
'f.addEventListener("submit",async function(e){' +
'e.preventDefault();' +
'var phone=p.value.trim();' +
'if(phone.length!==10){err.textContent="Please enter a valid 10-digit number";err.style.display="block";return}' +
'btn.disabled=true;load.style.display="block";err.style.display="none";suc.style.display="none";' +
'try{' +
'var r=await fetch("/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tableNumber:"' + tableNumber + '",phoneNumber:phone,signature:"' + signature + '"})});' +
'var d=await r.json();' +
'if(d.success){suc.textContent=d.message;suc.style.display="block";btn.innerHTML="✅ Check your WhatsApp!";btn.style.background="#27ae60";f.querySelector(".input-wrap").style.display="none"}' +
'else{err.textContent=d.error||"Something went wrong";err.style.display="block";btn.disabled=false}' +
'}catch(ex){err.textContent="Network error. Please try again.";err.style.display="block";btn.disabled=false}' +
'load.style.display="none"' +
'});' +
'</script>' +
'</body></html>';
}

function closedPage() {
  return '<!DOCTYPE html>' +
'<html><head>' +
'<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">' +
'<title>' + config.restaurantName + ' - Closed</title>' +
'<style>' +
'*{margin:0;padding:0;box-sizing:border-box}' +
'body{font-family:-apple-system,sans-serif;background:linear-gradient(135deg,#0f0c29,#302b63,#24243e);color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}' +
'.card{background:rgba(255,255,255,0.1);backdrop-filter:blur(10px);padding:40px 30px;border-radius:24px;max-width:380px;width:100%;text-align:center;border:1px solid rgba(255,255,255,0.15)}' +
'.moon{font-size:64px;margin-bottom:10px}' +
'h2{font-size:22px;margin-bottom:8px}' +
'p{color:rgba(255,255,255,0.7);margin:8px 0;font-size:15px}' +
'.hours{background:rgba(255,255,255,0.1);padding:16px;border-radius:14px;margin-top:20px}' +
'.hours strong{color:#ffd700;font-size:20px}' +
'</style></head><body>' +
'<div class="card">' +
'<div class="moon">🌙</div>' +
'<h2>' + config.restaurantName + '</h2>' +
'<p>We are currently closed</p>' +
'<div class="hours">' +
'<p>⏰ We are open</p>' +
'<p><strong>' + config.openingTime + ' - ' + config.closingTime + '</strong></p>' +
'<p style="margin-top:12px">Visit us during business hours!</p>' +
'</div></div></body></html>';
}

function errorPage(title, message) {
  return '<!DOCTYPE html>' +
'<html><head>' +
'<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">' +
'<title>Error</title>' +
'<style>' +
'*{margin:0;padding:0;box-sizing:border-box}' +
'body{font-family:-apple-system,sans-serif;background:#fff5f5;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}' +
'.card{background:#fff;padding:40px 30px;border-radius:24px;max-width:380px;width:100%;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,0.08)}' +
'.icon{font-size:48px;margin-bottom:10px}' +
'h2{color:#e74c3c;font-size:20px;margin-bottom:10px}' +
'p{color:#666;font-size:15px;line-height:1.6}' +
'</style></head><body>' +
'<div class="card">' +
'<div class="icon">⚠️</div>' +
'<h2>' + title + '</h2>' +
'<p>' + message + '</p>' +
'</div></body></html>';
}

module.exports = router;
