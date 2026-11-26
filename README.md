# REDUAN COMPUTER — Student Admission Landing Page

Premium, animated, fully responsive student admission landing page (Bengali primary).
Frontend only — the backend is Google Apps Script + Google Sheets + Google Drive
(created separately). No fake data, no fake Student ID, no invented batches/fees/
payment numbers anywhere on this page.

## Live facts used (only these)
- Business: **REDUAN COMPUTER** — "শিখুন দক্ষতা, গড়ুন সফল ক্যারিয়ার।"
- Address: হোসেনপুর থানা মসজিদ সংলগ্ন, হোসেনপুর, কিশোরগঞ্জ, বাংলাদেশ।
- Phone: 01410645030
- Payment methods: bKash only (Send Money)
- Classes: Google Meet (Student ID required to join)

## Files
| File | Purpose |
| --- | --- |
| `index.html` | Page structure: Header, Hero, Admission Info, Process, Payment, Form, FAQ, Contact, Footer |
| `styles.css` | Premium glassmorphism / gradient / animation styles, responsive + print stylesheet |
| `app.js` | Multi-step form, validation, batch loading, receipt compression, submit, success screen |
| `api.js` | Apps Script API client (`Content-Type: text/plain` to avoid preflight) |
| `config.js` | Single `APPS_SCRIPT_URL` constant — empty = backend not configured |

## Design rules (enforced)
- No human photos, student/teacher photos, characters or avatars — only abstract
  3D shapes, geometric SVG illustrations, gradients and minimalist icons.
- No emoji anywhere — professional inline SVG icons only (no icon CDN dependency).
- Lightweight: no animation libraries; IntersectionObserver scroll-reveal, CSS
  animations only. Google Fonts (Hind Siliguri / Noto Sans Bengali / Inter) allowed.

## How the form works
1. **Step 1 — Personal Information:** full name, Bangladeshi 11-digit mobile
   validation (`01[3-9]XXXXXXXX`), optional WhatsApp/email, full address.
2. **Step 2 — Batch:** loaded from backend action `publicGetBatches`. If the
   backend returns no batches (or is not configured), the page shows the honest
   empty state — "ব্যাচের তালিকা শীঘ্রই আসছে — যোগাযোগ করুন: 01410645030" —
   and blocks progress. Batches are never invented.
3. **Step 3 — Payment:** bKash only, sender number, Transaction ID, amount,
   payment date, receipt screenshot (image only, max 5 MB, preview before upload,
   client-side compressed to max 1280px JPEG quality 0.8, sent as base64).

Submit is blocked while a request is pending and carries an `idempotencyKey`
(duplicate-submit prevention). **No success screen is shown until the backend
confirms** — the Student ID (format `RC-2026-XXXX`) comes only from the backend.
Duplicate Transaction ID is detected by the backend and shown as a Bangla error.

## Configure the backend
1. Deploy the Google Apps Script backend as a Web App (Execute as Me, Anyone).
2. Put the Web App URL in `config.js`:
   ```js
   const APPS_SCRIPT_URL = "https://script.google.com/macros/s/XXXX/exec";
   ```
3. The backend must support actions: `publicGetBatches`, `getSettingsPublic`
   (optional `payment_numbers` — bkash only; if absent the page shows
   "পেমেন্ট নম্বর জানতে কল করুন: 01410645030"), and `submitAdmission`
   (returns `{ success: true, studentId, submissionDate }` or
   `{ success: false, error: "DUPLICATE_TRANSACTION" }`).

## Success screen
Animated check, premium Student ID card, name / batch / Payment Verification
Status: Pending / submission date, the Bangla + English Student ID notice,
Copy Student ID (with confirmation), Download / Print Admission Confirmation
(print stylesheet - save as PDF or print).

## Local preview
```bash
python3 -m http.server 8000
# open http://localhost:8000/
```

## Not yet verified (needs the live backend)
Batch loading, form submit, Student ID generation, receipt upload to Drive,
duplicate Transaction ID detection, payment numbers from Settings.
