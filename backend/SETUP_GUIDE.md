# REDUAN COMPUTER — Admission Landing Page: Backend Setup Guide

> **বাংলা + English.** এই গাইডটি `backend/Code.gs`-এর Apps Script backend deploy করার জন্য।
> Frontend ইতিমধ্যে তৈরি (`index.html`, `styles.css`, `app.js`, `api.js`, `config.js`)।

---

## 1. গুরুত্বপূর্ণ: কোন অ্যাকাউন্ট দিয়ে Deploy করবেন (Deployment Account)

**অবশ্যই `reduan.digital@gmail.com` অ্যাকাউন্ট দিয়ে deploy করতে হবে।**

কারণ:
- "Admission Database" spreadsheet-এর মালিক (owner) হলো `reduan.digital@gmail.com`।
- "Payment Receipts" ফোল্ডারটি ওই অ্যাকাউন্টের সঙ্গে Writer হিসেবে share করা আছে।
- অন্য কোনো অ্যাকাউন্ট (যেমন `reduancomputer1@gmail.com`) দিয়ে deploy করলে script spreadsheet খুলতে পারবে না — permission error হবে।

আপনার Google Account password কখনো কাউকে দিতে হবে না — Google-এর নিজস্ব authorization স্ক্রিনেই অনুমোদন দেবেন।

---

## 2. Apps Script Deploy করার ধাপ (Deploy Steps)

1. `reduan.digital@gmail.com` দিয়ে Google-এ sign in করুন।
2. [script.google.com](https://script.google.com) খুলুন → **New project**।
3. Project-এর নাম দিন: `Reduan Computer Admission Backend` (ঐচ্ছিক, যেকোনো নাম চলবে)।
4. Editor-এর `Code.gs` ফাইলের সব লেখা মুছে `backend/Code.gs`-এর সম্পূর্ণ কোড paste করুন।
5. **Save** করুন (Ctrl+S / Cmd+S)।
6. **একবার যাচাই করুন (setupCheck):**
   - Editor-এ `setupCheck` ফাংশনটি select করুন → **Run** চাপুন।
   - প্রথমবার Google অনুমোদন চাইবে — **Review permissions** → আপনার অ্যাকাউন্ট বেছে নিন → **Advanced** → **Go to Reduan Computer Admission Backend (unsafe)** → **Allow**।
     > "unsafe" লেখাটি দেখে ভয় পাবেন না — এটি আপনার নিজের লেখা script, Google যেকোনো নতুন script-এর জন্য এই সতর্কতা দেখায়।
   - Run শেষে **Execution log** দেখুন। সব লাইনে `OK` থাকা চাই:
     - `OK spreadsheet: Admission Database`
     - `OK Admissions headers (16): ...`
     - `OK Batches sheet: 0 batch row(s) ...`
     - `OK Receipts folder: Payment Receipts`
     - `OK Settings keys found: (none — ...)` — Settings এখনো না থাকলে এটা স্বাভাবিক।
   - কোনো লাইনে `FAIL` থাকলে deploy করবেন না — আগে সেটি ঠিক করুন (নিচের সমস্যা সমাধান দেখুন)।
7. **Deploy → New deployment** চাপুন।
8. ⚙️ আইকনে ক্লিক করে ধরন বাছুন: **Web app**।
9. সেটিংস ঠিক করুন:
   - **Description:** `Admission backend v1` (ঐচ্ছিক)
   - **Execute as:** **Me (reduan.digital@gmail.com)**
   - **Who has access:** **Anyone**
10. **Deploy** চাপুন → অনুমোদন দিলে একটি **Web App URL** পাবেন, যেমন:
    `https://script.google.com/macros/s/AKfyc.../exec`
11. এই URL কপি করে frontend-এর `config.js`-এ বসান:

```js
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfyc.../exec";
```

12. `config.js` update করে GitHub-এ upload করলে ওয়েবসাইট live হয়ে যাবে।

> **মনে রাখবেন:** পরে `Code.gs`-এ কোনো পরিবর্তন করলে আবার **Deploy → Manage deployments → Edit (✏️) → Version: New version → Deploy** করতে হবে — নাহলে live URL পুরনো কোডই চালাবে।

---

## 3. Batch যোগ করা (Add Batches)

শিক্ষার্থীরা শুধুমাত্র **Active** batch দেখতে পাবে। Batch না থাকলে ফরমে "কোনো batch পাওয়া যায়নি" দেখাবে — কোনো batch নাম বানানো হয় না।

1. [Admission Database spreadsheet](https://docs.google.com/spreadsheets/d/1AI2AftSqvPyCWLJReNlU-P_xkQcqY-Y164-NmVnLncE/edit) খুলুন।
2. **Batches** sheet-এ যান। প্রতি সারিতে একটি batch:

| Batch ID | Batch Name | Start Date | Class Schedule | Max Students | Status |
|----------|------------|------------|----------------|--------------|--------|
| B-01 | Morning Batch | 2026-12-01 | Sat, Mon, Wed — 10:00 AM | 30 | Active |
| B-02 | Evening Batch | 2026-12-05 | Sun, Tue, Thu — 7:00 PM | 30 | Active |

- **Batch ID** (যেমন `B-01`) unique হতে হবে — এটাই ফরম থেকে backend-এ যাবে।
- **Status = Active** লিখলে batch শিক্ষার্থীদের দেখাবে। `Closed` / `Full` লিখলে লুকিয়ে যাবে।
- **Start Date** `YYYY-MM-DD` আকারে লিখুন (যেমন `2026-12-01`)।

কোর্সের নাম, ফি বা বিবরণ এই পেজে দেখানো হয় না — শুধু batch-এর তথ্যই প্রয়োজন।

---

## 4. পেমেন্ট নম্বর বসানো (Payment Numbers)

**কোনো bKash/Nagad নম্বর কোডে লেখা নেই এবং লেখা যাবে না।** নম্বর শুধু Settings sheet থেকে পড়া হয়।

1. Spreadsheet-এ নতুন একটি sheet তৈরি করুন, নাম: **`Settings`**
2. প্রথম সারিতে header: `Key` | `Value`
3. নম্বরগুলো এভাবে বসান:

| Key | Value |
|-----|-------|
| payment_bkash | 01XXXXXXXXX |
| payment_nagad | 01XXXXXXXXX |

4. (ঐচ্ছিক) ব্যবসার তথ্যও এখান থেকে বদলানো যায়:

| Key | Value |
|-----|-------|
| business_name | REDUAN COMPUTER |
| phone | 01410645030 |
| slogan | শিখুন দক্ষতা, গড়ুন সফল ক্যারিয়ার। |
| address | হোসেনপুর থানা মসজিদ সংলগ্ন, হোসেনপুর, কিশোরগঞ্জ, বাংলাদেশ। |

Settings sheet বা নম্বর না থাকলে পেজে নম্বর দেখাবে না — শুধু "পেমেন্ট নম্বরের জন্য কল করুন: 01410645030" দেখাবে। নম্বর বসানোর পর পেজ refresh করলেই নম্বর দেখাবে (কোড বদলাতে হয় না, deploy-ও করতে হয় না)।

---

## 5. ভর্তি ব্যবস্থাপনা — Google Sheets থেকেই (Manage Admissions)

আলাদা Admin Panel নেই — সব কাজ Spreadsheet থেকেই করবেন।

**Admissions sheet-এর কলাম:**
Serial Number · Student ID · Submission Date & Time · Student Name · Mobile Number · WhatsApp Number · Email · Address · Selected Batch · Payment Method · Payment Sender Number · Transaction ID · Payment Amount · Payment Date · Receipt File Link · Admission Status

**যা করবেন:**
- **সব আবেদন দেখা:** Admissions sheet খুললেই নতুন আবেদন সবার নিচে নতুন row হিসেবে আসে।
- **Student ID:** প্রতিটি আবেদনে স্বয়ংক্রিয়ভাবে তৈরি হয় — `RC-2026-0001`, `RC-2026-0002`, … (একই সময়ে একাধিক আবেদন এলেও ID কখনো duplicate হয় না)।
- **পেমেন্ট যাচাই:** Payment Method, Sender Number, Transaction ID, Amount, Payment Date দেখে bKash/Nagad অ্যাপে মিলিয়ে নিন।
- **Receipt খোলা:** Receipt File Link কলামের লিংকে ক্লিক করলেই Drive-এর রসিদের ছবি খুলবে (ফাইল private থাকে — শুধু আপনি খুলতে পারবেন)।
- **Status পরিবর্তন:** Admission Status কলামে লিখুন `Pending` / `Approved` / `Rejected`।
- **Pending / Approved / Rejected দেখা:** Google Sheets-এ **Data → Filter views → Create new filter view** দিয়ে Status কলামে filter করুন, অথবা **Data → Filter** চালু করে Status অনুযায়ী ছাঁকুন।
- **Search:** `Ctrl+F` দিয়ে নাম, মোবাইল, Transaction ID বা Student ID খুঁজুন।

**সতর্কতা:** কোনো row মুছে ফেললে Student ID আর ফিরে আসে না — পরের ID সেই নম্বর skip করে এগিয়ে যাবে (ID কখনো reuse হয় না)। ভুল করে row মুছলে শুধু সেই শিক্ষার্থীর তথ্য হারাবে, সিস্টেমের কিছু হবে না।

---

## 6. পরীক্ষা করা (Testing)

Live করার আগে একটি **বাস্তব test submission** দিয়ে যাচাই করুন:

1. Batch যোগ করুন (উপরের ধাপ ৩) — অন্তত একটি Active batch।
2. Live ওয়েবসাইট খুলে ফরম পূরণ করে একটি test আবেদন জমা দিন (নিজের নামের সঙ্গে "TEST" লিখুন, যেমন নাম: `TEST Reduan`)।
3. যাচাই করুন:
   - [ ] Success screen-এ Student ID দেখাচ্ছে (যেমন `RC-2026-0001`)
   - [ ] Admissions sheet-এ নতুন row এসেছে, সব তথ্য ঠিক আছে, Status = `Pending`
   - [ ] Payment Receipts ফোল্ডারে রসিদের ফাইল উঠেছে (`RC-2026-0001_...` নামে)
   - [ ] Receipt File Link ক্লিক করলে ছবি খুলছে
   - [ ] একই Transaction ID দিয়ে আবার জমা দিলে "এই Transaction ID দিয়ে ইতিমধ্যে একটি আবেদন জমা আছে" দেখাচ্ছে এবং নতুন row তৈরি হচ্ছে না
   - [ ] Student ID Copy বোতাম কাজ করছে
   - [ ] Download / Print Confirmation কাজ করছে
4. **Test ডেটা মুছে ফেলুন:**
   - Admissions sheet থেকে TEST row-টি delete করুন।
   - Payment Receipts ফোল্ডার থেকে TEST রসিদের ফাইলটি delete করুন।
   - মনে রাখবেন: পরের আসল আবেদনের ID এক নম্বর এগিয়ে যাবে (যেমন test-এ `RC-2026-0001` ব্যবহার হয়ে থাকলে পরেরটি `RC-2026-0002` হবে) — ID কখনো reuse হয় না, এটাই নিরাপদ নিয়ম।

---

## 7. গুরুত্বপূর্ণ নোট — Spreadsheet-এর অবস্থান (Spreadsheet Location)

**Spreadsheet "Admission Database" এখন Google Drive-এর root-এ আছে, "Student Admission Database" ফোল্ডারের ভেতরে নয়।**

এর কারণ: Drive ফোল্ডারটি তৈরি হয়েছে `reduancomputer1@gmail.com` অ্যাকাউন্টে, আর spreadsheet-টি তৈরি হয়েছে `reduan.digital@gmail.com` অ্যাকাউন্টে — দুটি আলাদা Google অ্যাকাউন্ট একে অপরের ফাইল সরাতে পারে না। কোনো অনুমোদন কার্ড দিয়ে এটা ঠিক করা যাবে না।

**আপনাকে নিজে Drive UI-তে drag করে নিতে হবে:**
1. `reduan.digital@gmail.com` দিয়ে [Google Drive](https://drive.google.com) খুলুন।
2. **My Drive**-এ "Admission Database" spreadsheet-টি খুঁজুন।
3. সেটিকে drag করে **"Student Admission Database"** ফোল্ডারের ভেতরে ছেড়ে দিন।
   (অথবা: spreadsheet-এ right-click → **Organize → Move** → ফোল্ডারটি বেছে নিন।)

এই সরানোর কাজটি না করলেও backend ঠিকঠাক চলবে — spreadsheet-এর ID একই থাকে, তাই Code.gs বা config.js-এ কিছু বদলাতে হবে না। এটা শুধু ফাইল গোছানোর বিষয়।

---

## 8. সমস্যা সমাধান (Troubleshooting)

| সমস্যা | কারণ ও সমাধান |
|--------|---------------|
| পেজে "Backend সংযুক্ত হয়নি" দেখাচ্ছে | `config.js`-এ `APPS_SCRIPT_URL` খালি। Deploy-এর URL বসিয়ে GitHub-এ upload করুন। |
| ফরমে কোনো batch দেখাচ্ছে না | Batches sheet-এ কোনো Active batch নেই। ধাপ ৩ অনুযায়ী batch যোগ করুন (Status = Active)। |
| Submit করলে "Server is busy" | একই মুহূর্তে অনেক আবেদন এসেছে। একটু পরে আবার চেষ্টা করুন — কোনো ডেটা হারায়নি। |
| "Admissions sheet is missing" | Spreadsheet-এ Admissions sheet-এর নাম বদলে গেছে বা মুছে গেছে। নাম ঠিক `Admissions` রাখুন। |
| Receipt upload হচ্ছে না | Receipts ফোল্ডারের share সেটিংস যাচাই করুন — `reduan.digital@gmail.com`-এর Writer access থাকতে হবে। |
| Permission / 403 error | Script-টি `reduan.digital@gmail.com` দিয়ে deploy করা হয়নি। ধাপ ১–২ অনুযায়ী আবার deploy করুন। |
| সফল জমার পরও Student ID দেখাচ্ছে না | Success screen শুধু তখনই আসে যখন Sheets-এ row সফলভাবে save হয়। Execution log-এ (Apps Script → Executions) error দেখুন। |
| Deploy-এর পর নতুন কোড কাজ করছে না | নতুন version deploy করা হয়নি। **Manage deployments → Edit → Version: New version → Deploy** করুন। |

---

## 9. Link-সমূহ (Links)

- **Spreadsheet "Admission Database":** https://docs.google.com/spreadsheets/d/1AI2AftSqvPyCWLJReNlU-P_xkQcqY-Y164-NmVnLncE/edit
- **Drive ফোল্ডার "Student Admission Database":** (Drive-এ `reduancomputer1@gmail.com` অ্যাকাউন্টে)
- **Payment Receipts ফোল্ডার ID:** `1wj1stcMU9Yg8voVU2iZVyde5yjG2swP-`
- **Backend Code:** এই প্রজেক্টের `backend/Code.gs`
- **Live Website / GitHub Repo:** deploy-এর পর এখানে বসানো হবে (এখনো তৈরি হয়নি)

---

## 10. যা যা করা হয়নি / সীমাবদ্ধতা (Honest Notes)

- **Live পরীক্ষা হয়নি:** doGet/doPost, receipt upload, duplicate Transaction ID যাচাই, Student ID তৈরি — এগুলো শুধু deploy-এর পরেই বাস্তবে পরীক্ষা করা যাবে। উপরের ধাপ ৬ অনুযায়ী test submission দিয়ে যাচাই করতেই হবে।
- **কোনো batch এখনো যোগ করা হয়নি** — Batches sheet খালি। Batch যোগ না করা পর্যন্ত শিক্ষার্থীরা আবেদন করতে পারবে না (ফরমে batch দেখাবে না)।
- **কোনো পেমেন্ট নম্বর বসানো হয়নি** — Settings sheet নেই। নম্বর না বসালে পেজে "কল করুন" বার্তা দেখাবে।
- **Frontend-এর `idempotencyKey`** backend গ্রহণ করে কিন্তু সংরক্ষণ করে না — Admissions sheet-এ এর কোনো কলাম নেই। Duplicate প্রতিরোধ Transaction ID যাচাই + frontend-এর submit guard দিয়ে হয়।
