/**
 * Gmail → OTA webhook forwarder (Google Apps Script)
 * ---------------------------------------------------
 * Runs on a time trigger, finds new GoMMT (MakeMyTrip / Goibibo) booking &
 * cancellation emails in saubhagyamangalam@gmail.com, and POSTs each to the
 * portal's /api/webhook/ota-email endpoint. Processed mails get a Gmail label
 * so they're never sent twice.
 *
 * SETUP (one time):
 *  1. Go to https://script.google.com  →  New project.
 *  2. Paste this whole file in. Edit the two CONFIG values below.
 *  3. Run `setup` once (authorize when prompted) — creates the label + trigger.
 *  4. Done. It now checks every minute. Run `processOtaEmails` manually to test.
 */

// ─── CONFIG ──────────────────────────────────────────────────────────────────
// Your deployed webhook URL + the secret you set in Vercel (OTA_EMAIL_WEBHOOK_SECRET)
var WEBHOOK_URL = "https://YOUR-DOMAIN.vercel.app/api/webhook/ota-email?secret=PUT_SECRET_HERE";
// Gmail search for OTA mails not yet processed (last 2 days keeps it fast)
var SEARCH = 'from:(no-reply@go-mmt.com) newer_than:2d -label:ota-synced';
var LABEL = "ota-synced";
// ─────────────────────────────────────────────────────────────────────────────

function setup() {
  if (!GmailApp.getUserLabelByName(LABEL)) GmailApp.createLabel(LABEL);
  // remove existing triggers for this function, then create a 1-minute one
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "processOtaEmails") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("processOtaEmails").timeBased().everyMinutes(1).create();
  Logger.log("Setup complete: label + 1-minute trigger created.");
}

function processOtaEmails() {
  var label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  var threads = GmailApp.search(SEARCH, 0, 25);

  threads.forEach(function (thread) {
    var msgs = thread.getMessages();
    var sentAny = false;

    msgs.forEach(function (msg) {
      var from = msg.getFrom() || "";
      if (from.toLowerCase().indexOf("go-mmt.com") === -1) return;

      var payload = {
        subject: msg.getSubject() || "",
        from: from,
        text: msg.getPlainBody() || "",
        html: msg.getBody() || "",
      };

      try {
        var res = UrlFetchApp.fetch(WEBHOOK_URL, {
          method: "post",
          contentType: "application/json",
          payload: JSON.stringify(payload),
          muteHttpExceptions: true,
        });
        var code = res.getResponseCode();
        Logger.log(payload.subject + " → " + code + " " + res.getContentText());
        if (code >= 200 && code < 300) sentAny = true;
      } catch (e) {
        Logger.log("ERROR posting: " + e);
      }
    });

    if (sentAny) thread.addLabel(label);
  });
}
