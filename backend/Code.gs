/**
 * ============================================================================
 * REDUAN COMPUTER — Student Admission Landing Page: Backend (Google Apps Script)
 * ============================================================================
 *
 * WHAT THIS IS
 *   Single-file Apps Script backend for the Premium Admission Landing Page.
 *   Frontend (GitHub Pages) -> this Web App -> Google Sheets + Google Drive.
 *   - Admission rows go to the "Admissions" sheet.
 *   - Payment receipts go to the "Payment Receipts" Drive folder (private).
 *   - Every successful submission gets a unique Student ID (RC-YYYY-NNNN).
 *
 * DEPLOYMENT ACCOUNT — READ THIS FIRST
 *   This script MUST be deployed while signed in as reduan.digital@gmail.com,
 *   because that account OWNS the "Admission Database" spreadsheet below.
 *   The "Payment Receipts" folder is already shared as Writer with
 *   reduan.digital@gmail.com, so the script (running as that account) can
 *   upload receipts into it. Deploying as any other account will fail with
 *   permission errors on the spreadsheet.
 *   Deploy: Execute as "Me" (reduan.digital@gmail.com) / Access: "Anyone".
 *
 * IDS (verified 2026-11-26 — do not change)
 *   Spreadsheet "Admission Database": 1AI2AftSqvPyCWLJReNlU-P_xkQcqY-Y164-NmVnLncE
 *   Folder "Payment Receipts":       1wj1stcMU9Yg8voVU2iZVyde5yjG2swP-
 *   Folder "Student Admission Database" (parent): 1cugbpRkmgq3eio-r9syp36VeoTOmnrM1
 *
 * SHEETS USED
 *   "Admissions" (16 columns): Serial Number, Student ID, Submission Date &
 *     Time, Student Name, Mobile Number, WhatsApp Number, Email, Address,
 *     Selected Batch, Payment Method, Payment Sender Number, Transaction ID,
 *     Payment Amount, Payment Date, Receipt File Link, Admission Status.
 *   "Batches" (6 columns): Batch ID, Batch Name, Start Date, Class Schedule,
 *     Max Students, Status. Only rows with Status "Active" (or an empty
 *     Status with a Batch Name) are shown to students.
 *   "Settings" (optional, Key / Value): payment_bkash,
 *     business_name, phone, slogan, address. If the sheet or a key is
 *     missing, that value is simply not returned — nothing is invented.
 *
 * SECURITY / HONESTY RULES BUILT IN
 *   - No secrets, passwords or payment numbers are hardcoded in this file.
 *     The only phone number in this file is the public contact number
 *     01410645030 (shown on the landing page as "call for payment number"
 *     fallback). The bKash number comes ONLY from the Settings sheet.
 *   - Receipt files are created PRIVATE (never shared publicly). The owner
 *     opens them from their own Drive.
 *   - All submission writes happen inside LockService.getScriptLock(), so
 *     two students submitting at the same second can never get the same
 *     Student ID, and a duplicate Transaction ID can never slip through.
 *   - A Student ID is generated ONLY after validation and the duplicate
 *     Transaction ID check have passed, inside the lock.
 *   - NOTHING is written on failure: validation happens before any write,
 *     and if the receipt upload succeeds but the sheet append fails, the
 *     uploaded file is deleted again before the error is returned.
 *   - A success response is returned ONLY after the sheet row exists.
 *
 * FRONTEND CONTRACT (api.js / app.js — do not break)
 *   The frontend ALWAYS calls this Web App with HTTP POST (Content-Type:
 *   text/plain, to avoid a CORS preflight) and a JSON body {action: ...}.
 *   So doPost() routes the public read actions too; doGet() exists for
 *   direct browser checks (?action=ping / ?action=publicGetBatches).
 *   Responses always carry BOTH "ok" and "success" (same boolean) because
 *   the frontend checks result.success and result.error, while the spec
 *   uses ok. Duplicate Transaction ID error string is
 *   "DUPLICATE_TRANSACTION" (what app.js matches) and the code
 *   "DUPLICATE_TRXID" is also included.
 *   Submit payload from the frontend:
 *     { action:"submitAdmission", idempotencyKey, fullName, mobile,
 *       whatsapp, email, address, batchId, batchName, paymentMethod,
 *       senderNumber, transactionId, amount, paymentDate,
 *       receiptBase64, receiptFileName }
 *   NOTE: receiptBase64 is actually a data URL ("data:image/jpeg;base64,…")
 *   produced by the frontend's image compressor (max 1280px, JPEG 0.8).
 *   No receiptMimeType is sent — the MIME type is parsed from the data-URL
 *   prefix, falling back to the file extension. A raw base64 string (no
 *   prefix) is also accepted and treated as image/jpeg.
 *   NOTE: idempotencyKey is accepted but cannot be stored — the Admissions
 *   sheet has no column for it. Duplicate submissions are prevented by the
 *   duplicate Transaction ID check plus the frontend's isSubmitting guard.
 *
 * TESTING (see SETUP_GUIDE.md)
 *   Run setupCheck() once from the Apps Script editor to verify access to
 *   the spreadsheet, sheets, headers and receipt folder — it writes nothing.
 * ============================================================================
 */

var SPREADSHEET_ID = '1AI2AftSqvPyCWLJReNlU-P_xkQcqY-Y164-NmVnLncE';
var RECEIPTS_FOLDER_ID = '1wj1stcMU9Yg8voVU2iZVyde5yjG2swP-';

var TIMEZONE = 'Asia/Dhaka';
var CONTACT_PHONE = '01410645030'; /* Public contact number (landing page). */

var ADMISSIONS_SHEET = 'Admissions';
var BATCHES_SHEET = 'Batches';
var SETTINGS_SHEET = 'Settings';

var MOBILE_RE = /^01[3-9]\d{8}$/;
var TRXID_RE = /^[A-Za-z0-9]+$/;
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var STUDENT_ID_RE = /^RC-(\d{4})-(\d+)$/;

var MAX_RECEIPT_BYTES = 10 * 1024 * 1024; /* 10 MB safety limit. */

/* ------------------------------------------------------------------ */
/* HTTP entry points                                                   */
/* ------------------------------------------------------------------ */

/**
 * GET router — for direct browser checks, e.g.
 *   <webapp-url>?action=ping
 *   <webapp-url>?action=publicGetBatches
 *   <webapp-url>?action=getSettingsPublic
 * The frontend itself uses POST for everything (see header comment).
 */
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'ping';
  try {
    if (action === 'ping') return json_({ ok: true, success: true, message: 'pong' });
    if (action === 'publicGetBatches') return json_(getBatches_());
    if (action === 'getSettingsPublic') return json_(getSettingsPublic_());
    return json_({ ok: false, success: false, error: 'UNKNOWN_ACTION', message: 'Unknown action: ' + action });
  } catch (err) {
    return json_({ ok: false, success: false, error: 'SERVER_ERROR', message: String(err && err.message || err) });
  }
}

/**
 * POST router — the only route the frontend uses. The body is a JSON
 * string (sent as text/plain to avoid a CORS preflight).
 */
function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
    var action = body.action || '';
    if (action === 'ping') return json_({ ok: true, success: true, message: 'pong' });
    if (action === 'publicGetBatches') return json_(getBatches_());
    if (action === 'getSettingsPublic') return json_(getSettingsPublic_());
    if (action === 'submitAdmission') return json_(submitAdmission_(body));
    return json_({ ok: false, success: false, error: 'UNKNOWN_ACTION', message: 'Unknown action: ' + action });
  } catch (err) {
    return json_({ ok: false, success: false, error: 'SERVER_ERROR', message: String(err && err.message || err) });
  }
}

/* ------------------------------------------------------------------ */
/* Public read actions                                                 */
/* ------------------------------------------------------------------ */

/**
 * Returns active batches. A row counts as active when Status is "Active"
 * (case-insensitive) OR Status is empty but Batch Name is present.
 * Never invents batches — an empty Batches sheet returns an empty list.
 * Shape matches app.js: { ok, success, batches: [{id, name, startDate,
 * schedule, maxStudents, status}] }.
 */
function getBatches_() {
  var book = openBook_();
  var sheet = book.getSheetByName(BATCHES_SHEET);
  if (!sheet) {
    return { ok: true, success: true, batches: [] };
  }
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return { ok: true, success: true, batches: [] };

  var head = headerMap_(values[0]);
  var batches = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var id = String(cell_(row, head, 'Batch ID')).trim();
    var name = String(cell_(row, head, 'Batch Name')).trim();
    var status = String(cell_(row, head, 'Status')).trim();
    if (!id || !name) continue;
    var isActive = status === '' || status.toLowerCase() === 'active';
    if (!isActive) continue;
    batches.push({
      id: id,
      name: name,
      startDate: fmtCellDate_(cell_(row, head, 'Start Date')),
      schedule: String(cell_(row, head, 'Class Schedule')).trim(),
      maxStudents: cell_(row, head, 'Max Students') === '' ? null : Number(cell_(row, head, 'Max Students')),
      status: status || 'Active'
    });
  }
  return { ok: true, success: true, batches: batches };
}

/**
 * Returns public business info + the bKash payment number. The number comes
 * ONLY from the Settings sheet (keys: payment_bkash / bkash / bkash_number).
 * If the sheet or the key does not exist, payment_numbers is empty — the
 * frontend then shows "call for payment number" and no number is invented.
 * Shape matches app.js: settings.payment_numbers.{bkash}.
 */
function getSettingsPublic_() {
  var settings = readSettings_();
  var paymentNumbers = {};
  var bkash = settings['payment_bkash'] || settings['bkash'] || settings['bkash_number'] || settings['payment_bkash_number'];
  if (bkash) paymentNumbers.bkash = String(bkash).trim();

  return {
    ok: true,
    success: true,
    settings: {
      businessName: settings['business_name'] || 'REDUAN COMPUTER',
      phone: settings['phone'] || CONTACT_PHONE,
      slogan: settings['slogan'] || 'শিখুন দক্ষতা, গড়ুন সফল ক্যারিয়ার।',
      address: settings['address'] || 'হোসেনপুর থানা মসজিদ সংলগ্ন, হোসেনপুর, কিশোরগঞ্জ, বাংলাদেশ।',
      payment_numbers: paymentNumbers
    }
  };
}

/* ------------------------------------------------------------------ */
/* Submit admission — the core flow                                    */
/* ------------------------------------------------------------------ */

/**
 * Full flow, all inside a script lock (max 30 s wait):
 *   1. Validate every field (before ANY write).
 *   2. Reject a duplicate Transaction ID (case-insensitive, trimmed).
 *   3. Generate the next unique Student ID (RC-YYYY-NNNN).
 *   4. Upload the receipt (if any) to the private Receipts folder.
 *   5. Append ONE row to Admissions with Status "Pending".
 *   6. Return { ok:true, success:true, studentId, batchName,
 *      submissionDate, receiptUrl } — only after the row exists.
 * On ANY failure: nothing partial is left behind. If the receipt was
 * uploaded but the sheet append failed, the uploaded file is deleted.
 */
function submitAdmission_(d) {
  var lock = LockService.getScriptLock();
  var uploadedFile = null;
  try {
    if (!lock.tryLock(30000)) {
      return fail_('LOCK_TIMEOUT', 'Server is busy — please try again in a moment.');
    }

    /* ---- 1. Validate (before any write) ---- */
    var v = validateSubmission_(d);
    if (v) return v; /* v is already a {ok:false,...} response object. */

    var book = openBook_();
    var sheet = book.getSheetByName(ADMISSIONS_SHEET);
    if (!sheet) return fail_('DATABASE_NOT_READY', 'Admissions sheet is missing. Please contact the administrator.');
    var batchSheet = book.getSheetByName(BATCHES_SHEET);
    if (!batchSheet) return fail_('DATABASE_NOT_READY', 'Batches sheet is missing. Please contact the administrator.');

    var fullName = String(d.fullName).trim();
    var mobile = String(d.mobile).trim();
    var whatsapp = d.whatsapp ? String(d.whatsapp).trim() : '';
    var email = d.email ? String(d.email).trim() : '';
    var address = String(d.address).trim();
    var batchId = String(d.batchId).trim();
    var paymentMethod = String(d.paymentMethod).trim();
    var senderNumber = String(d.senderNumber).trim();
    var transactionId = String(d.transactionId).trim();
    var amount = Number(d.amount);
    var paymentDate = String(d.paymentDate).trim();

    /* Batch must exist (frontend only offers active batches). */
    var batchName = findBatchName_(batchSheet, batchId);
    if (!batchName) {
      return fail_('INVALID_BATCH', 'The selected batch is no longer available. Please refresh the page and choose again.');
    }

    /* ---- 2. Duplicate Transaction ID check (case-insensitive) ---- */
    var values = sheet.getDataRange().getValues();
    var head = values.length > 0 ? headerMap_(values[0]) : {};
    var trxCol = head['Transaction ID'];
    var idCol = head['Student ID'];
    if (trxCol === undefined || idCol === undefined) {
      return fail_('DATABASE_NOT_READY', 'Admissions sheet headers are incorrect. Please contact the administrator.');
    }
    var wantedTrx = transactionId.toLowerCase();
    var maxIdNum = 0;
    for (var r = 1; r < values.length; r++) {
      var existingTrx = String(values[r][trxCol] || '').trim().toLowerCase();
      if (existingTrx !== '' && existingTrx === wantedTrx) {
        return {
          ok: false, success: false,
          error: 'DUPLICATE_TRANSACTION', code: 'DUPLICATE_TRXID',
          message: 'This Transaction ID has already been used for an admission application.'
        };
      }
      var m = STUDENT_ID_RE.exec(String(values[r][idCol] || '').trim());
      if (m) maxIdNum = Math.max(maxIdNum, parseInt(m[2], 10));
    }

    /* ---- 3. Generate the Student ID (inside the lock, after checks) ---- */
    var year = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy');
    var nextNum = maxIdNum + 1;
    var studentId = 'RC-' + year + '-' + ('0000' + nextNum).slice(-4);

    /* ---- 4. Upload the receipt (if provided) ---- */
    var receiptUrl = '';
    if (d.receiptBase64) {
      var parsed = parseReceiptData_(d.receiptBase64, d.receiptFileName);
      if (parsed.error) return fail_(parsed.error, parsed.message);
      var safeName = studentId + '_' + safeFileName_(d.receiptFileName || ('receipt.' + parsed.extension));
      var folder = DriveApp.getFolderById(RECEIPTS_FOLDER_ID);
      uploadedFile = folder.createFile(
        Utilities.newBlob(parsed.bytes, parsed.mimeType, safeName)
      );
      /* Files created by the script owner are private by default.
         Deliberately NO setSharing call here — receipts must stay private. */
      receiptUrl = uploadedFile.getUrl();
    }

    /* ---- 5. Append the row ---- */
    var nowStr = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
    var serial = sheet.getLastRow(); /* header row = 1, so lastRow == next serial */
    if (serial < 1) serial = 1;
    var row = [];
    row[head['Serial Number']] = serial;
    row[head['Student ID']] = studentId;
    row[head['Submission Date & Time']] = nowStr;
    row[head['Student Name']] = fullName;
    row[head['Mobile Number']] = textCell_(mobile);
    row[head['WhatsApp Number']] = textCell_(whatsapp);
    row[head['Email']] = email;
    row[head['Address']] = address;
    row[head['Selected Batch']] = batchName;
    row[head['Payment Method']] = paymentMethod;
    row[head['Payment Sender Number']] = textCell_(senderNumber);
    row[head['Transaction ID']] = textCell_(transactionId);
    row[head['Payment Amount']] = amount;
    row[head['Payment Date']] = paymentDate;
    row[head['Receipt File Link']] = receiptUrl;
    row[head['Admission Status']] = 'Pending';
    sheet.appendRow(row);

    /* ---- 6. Success — only now, after the row exists ---- */
    return {
      ok: true, success: true,
      studentId: studentId,
      batchName: batchName,
      submissionDate: nowStr,
      receiptUrl: receiptUrl
    };
  } catch (err) {
    /* Roll back a receipt that was uploaded but never recorded. */
    if (uploadedFile) {
      try { DriveApp.getFileById(uploadedFile.getId()).setTrashed(true); } catch (e2) { /* ignore */ }
    }
    return fail_('SERVER_ERROR', String(err && err.message || err));
  } finally {
    try { lock.releaseLock(); } catch (e3) { /* ignore */ }
  }
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

function validateSubmission_(d) {
  if (!d) return fail_('VALIDATION_FAILED', 'No data received.');
  if (!d.fullName || String(d.fullName).trim() === '') {
    return fail_('VALIDATION_FAILED', 'Full name is required.');
  }
  if (!d.mobile || !MOBILE_RE.test(String(d.mobile).trim())) {
    return fail_('VALIDATION_FAILED', 'Please enter a valid Bangladeshi mobile number (01XXXXXXXXX).');
  }
  if (d.whatsapp && String(d.whatsapp).trim() !== '' && !MOBILE_RE.test(String(d.whatsapp).trim())) {
    return fail_('VALIDATION_FAILED', 'Please enter a valid WhatsApp number (01XXXXXXXXX) or leave it empty.');
  }
  if (d.email && String(d.email).trim() !== '' && !EMAIL_RE.test(String(d.email).trim())) {
    return fail_('VALIDATION_FAILED', 'Please enter a valid email address or leave it empty.');
  }
  if (!d.address || String(d.address).trim() === '') {
    return fail_('VALIDATION_FAILED', 'Full address is required.');
  }
  if (!d.batchId || String(d.batchId).trim() === '') {
    return fail_('VALIDATION_FAILED', 'Please select a batch.');
  }
  if (d.paymentMethod !== 'bKash') {
    return fail_('VALIDATION_FAILED', 'Payment method must be bKash.');
  }
  if (!d.senderNumber || !MOBILE_RE.test(String(d.senderNumber).trim())) {
    return fail_('VALIDATION_FAILED', 'Please enter the number you sent the payment from (01XXXXXXXXX).');
  }
  if (!d.transactionId || !TRXID_RE.test(String(d.transactionId).trim())) {
    return fail_('VALIDATION_FAILED', 'Please enter a valid Transaction ID (letters and numbers only).');
  }
  if (d.amount === undefined || d.amount === null || isNaN(Number(d.amount)) || Number(d.amount) <= 0) {
    return fail_('VALIDATION_FAILED', 'Payment amount must be greater than 0.');
  }
  if (!d.paymentDate || isNaN(Date.parse(String(d.paymentDate)))) {
    return fail_('VALIDATION_FAILED', 'Please enter a valid payment date.');
  }
  return null; /* valid */
}

/* ------------------------------------------------------------------ */
/* Receipt parsing                                                     */
/* ------------------------------------------------------------------ */

/**
 * Accepts a data URL ("data:image/jpeg;base64,....") or a raw base64
 * string. Returns { bytes, mimeType, extension } or { error, message }.
 */
function parseReceiptData_(input, fileName) {
  var raw = String(input || '').trim();
  var mimeType = 'image/jpeg';
  var extension = 'jpg';
  var base64 = raw;
  var dm = /^data:([^;]+);base64,(.*)$/s.exec(raw);
  if (dm) {
    mimeType = dm[1];
    base64 = dm[2];
  }
  var extFromName = String(fileName || '').split('.').pop().toLowerCase();
  if (mimeType === 'image/png' || extFromName === 'png') { mimeType = 'image/png'; extension = 'png'; }
  else if (mimeType === 'image/jpeg' || mimeType === 'image/jpg' || extFromName === 'jpg' || extFromName === 'jpeg') { mimeType = 'image/jpeg'; extension = 'jpg'; }
  else if (mimeType === 'application/pdf' || extFromName === 'pdf') { mimeType = 'application/pdf'; extension = 'pdf'; }
  else if (mimeType === 'image/webp' || extFromName === 'webp') { mimeType = 'image/webp'; extension = 'webp'; }
  else if (mimeType.indexOf('image/') !== 0) {
    return { error: 'INVALID_RECEIPT', message: 'Receipt must be an image (JPG/PNG/WebP) or PDF file.' };
  }
  var bytes;
  try {
    bytes = Utilities.base64Decode(base64);
  } catch (e) {
    return { error: 'INVALID_RECEIPT', message: 'The receipt file could not be read. Please upload it again.' };
  }
  if (!bytes || bytes.length === 0) {
    return { error: 'INVALID_RECEIPT', message: 'The receipt file is empty. Please upload it again.' };
  }
  if (bytes.length > MAX_RECEIPT_BYTES) {
    return { error: 'RECEIPT_TOO_LARGE', message: 'Receipt file is too large (max 10 MB).' };
  }
  return { bytes: bytes, mimeType: mimeType, extension: extension };
}

/* ------------------------------------------------------------------ */
/* Sheet helpers                                                       */
/* ------------------------------------------------------------------ */

function openBook_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

/** Maps header names (row 1) to column indexes. */
function headerMap_(headerRow) {
  var map = {};
  for (var i = 0; i < headerRow.length; i++) {
    var h = String(headerRow[i] || '').trim();
    if (h !== '') map[h] = i;
  }
  return map;
}

function cell_(row, head, name) {
  var idx = head[name];
  if (idx === undefined) return '';
  var v = row[idx];
  return (v === null || v === undefined) ? '' : v;
}

/** Finds a batch by Batch ID (exact match, trimmed) and returns its name. */
function findBatchName_(batchSheet, batchId) {
  var values = batchSheet.getDataRange().getValues();
  if (values.length < 2) return '';
  var head = headerMap_(values[0]);
  var idCol = head['Batch ID'];
  var nameCol = head['Batch Name'];
  if (idCol === undefined || nameCol === undefined) return '';
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][idCol] || '').trim() === batchId) {
      return String(values[r][nameCol] || '').trim();
    }
  }
  return '';
}

/**
 * Reads the optional Settings sheet (Key / Value columns) into an object.
 * Missing sheet, missing headers or empty sheet => empty object.
 */
function readSettings_() {
  var out = {};
  try {
    var book = openBook_();
    var sheet = book.getSheetByName(SETTINGS_SHEET);
    if (!sheet) return out;
    var values = sheet.getDataRange().getValues();
    if (values.length < 2) return out;
    var head = headerMap_(values[0]);
    var keyCol = head['Key'];
    var valCol = head['Value'];
    if (keyCol === undefined || valCol === undefined) return out;
    for (var r = 1; r < values.length; r++) {
      var k = String(values[r][keyCol] || '').trim();
      var v = values[r][valCol];
      if (k !== '') out[k] = (v === null || v === undefined) ? '' : String(v).trim();
    }
  } catch (e) {
    /* Settings are optional — a failure here must not break the page. */
    return {};
  }
  return out;
}

/** Formats a sheet cell that may hold a Date into yyyy-MM-dd, else string. */
function fmtCellDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TIMEZONE, 'yyyy-MM-dd');
  return String(v === null || v === undefined ? '' : v).trim();
}

/**
 * Forces a value to be stored as TEXT in the sheet. Sheets would otherwise
 * parse a digit-only string like "01700000000" as the number 1700000000
 * and drop the leading zero (found by the 2026-11-26 end-to-end test).
 * A leading apostrophe is Sheets' text marker — it is not part of the
 * stored value, so reads return the digits exactly as typed.
 */
function textCell_(v) {
  var s = String(v === null || v === undefined ? '' : v);
  if (s === '') return '';
  return /^\d+$/.test(s) ? "'" + s : s;
}

/** Strips path characters / unsafe symbols from an uploaded file name. */
function safeFileName_(name) {
  var n = String(name || 'receipt').replace(/[\\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').replace(/_+/g, '_');
  if (n.length > 120) n = n.slice(0, 120);
  return n || 'receipt';
}

/* ------------------------------------------------------------------ */
/* Response helper + one-time setup check                              */
/* ------------------------------------------------------------------ */

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function fail_(error, message) {
  return { ok: false, success: false, error: error, message: message || error };
}

/**
 * setupCheck() — run ONCE manually from the Apps Script editor
 * (not a web action). Verifies that the deployment account can open the
 * spreadsheet, that the Admissions + Batches sheets and their headers
 * exist, and that the Payment Receipts folder is writable. Writes NOTHING.
 * Check the execution log for the result lines.
 */
function setupCheck() {
  var lines = [];
  try {
    var book = openBook_();
    lines.push('OK spreadsheet: ' + book.getName());
  } catch (e) {
    lines.push('FAIL spreadsheet: ' + e.message);
    Logger.log(lines.join('\n'));
    return lines.join('\n');
  }
  var adm = book.getSheetByName(ADMISSIONS_SHEET);
  if (!adm) {
    lines.push('FAIL Admissions sheet missing');
  } else {
    var h = adm.getRange(1, 1, 1, adm.getLastColumn()).getValues()[0].map(function (x) { return String(x); });
    lines.push('OK Admissions headers (' + h.length + '): ' + h.join(' | '));
  }
  var bat = book.getSheetByName(BATCHES_SHEET);
  if (!bat) {
    lines.push('FAIL Batches sheet missing');
  } else {
    var n = Math.max(0, bat.getLastRow() - 1);
    lines.push('OK Batches sheet: ' + n + ' batch row(s) (add batches with Status=Active before students apply)');
  }
  try {
    var folder = DriveApp.getFolderById(RECEIPTS_FOLDER_ID);
    lines.push('OK Receipts folder: ' + folder.getName());
  } catch (e2) {
    lines.push('FAIL Receipts folder: ' + e2.message);
  }
  var s = readSettings_();
  lines.push('OK Settings keys found: ' + (Object.keys(s).join(', ') || '(none — payment numbers will be empty)'));
  Logger.log(lines.join('\n'));
  return lines.join('\n');
}
