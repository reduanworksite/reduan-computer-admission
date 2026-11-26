/* REDUAN COMPUTER — Admission Landing Page logic
 * গুরুত্বপূর্ণ: Student ID কখনো Frontend-এ বানানো হয় না।
 * Backend (Apps Script) সফলভাবে ডেটা Save করার পরেই ID ফেরত দেয়,
 * তখনই Success Screen দেখানো হয়। Backend না থাকলে সাবমিট হয় না।
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const form = $("admissionForm");
  const formCard = $("formCard");
  const successScreen = $("successScreen");
  const formError = $("formError");
  const backendBanner = $("backendBanner");

  let currentStep = 1;
  let batches = [];
  let batchesLoaded = false;
  let receiptDataUrl = null; /* compressed base64 (data:image/jpeg) */
  let receiptFileName = "";
  let isSubmitting = false;
  let idempotencyKey = null;
  let lastResult = null;

  /* ---------- Header shadow + mobile menu ---------- */
  const header = $("siteHeader");
  window.addEventListener("scroll", () => {
    header.classList.toggle("scrolled", window.scrollY > 8);
  }, { passive: true });

  const menuToggle = $("menuToggle");
  const mainNav = $("mainNav");
  menuToggle.addEventListener("click", () => {
    const open = mainNav.classList.toggle("open");
    menuToggle.setAttribute("aria-expanded", String(open));
  });
  mainNav.addEventListener("click", (e) => {
    if (e.target.tagName === "A") mainNav.classList.remove("open");
  });

  /* ---------- Scroll reveal ---------- */
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll(".reveal").forEach((el) => revealObserver.observe(el));

  /* ---------- Backend status + batches + payment numbers ---------- */
  function showBackendBanner() {
    backendBanner.hidden = false;
    $("backendBannerText").textContent = "Backend সংযুক্ত হয়নি — শীঘ্রই চালু হবে।";
  }

  async function initBackend() {
    if (!Api.isConfigured()) {
      showBackendBanner();
      setBatchEmpty();
      return;
    }
    try {
      const settings = await Api.getSettingsPublic();
      applyPaymentNumbers(settings);
    } catch (e) {
      /* পেমেন্ট নম্বর না পেলে ডিফল্ট "কল করুন" বার্তাই থাকবে। */
    }
    await loadBatches();
  }

  /* Backend Settings থেকে পেমেন্ট নম্বর পেলে দেখাও, না পেলে "কল করুন" থাকবে। */
  function applyPaymentNumbers(settings) {
    if (!settings) return;
    const numbers = settings.payment_numbers || settings;
    const bkash = numbers.bkash || numbers.bkash_number;
    const nagad = numbers.nagad || numbers.nagad_number;
    if (bkash) {
      $("bkashNumberLine").innerHTML = "";
      $("bkashNumberLine").appendChild(document.createTextNode("পেমেন্ট নম্বরে টাকা পাঠান: "));
      const strong = document.createElement("strong");
      strong.textContent = bkash;
      $("bkashNumberLine").appendChild(strong);
      $("bkashNumberLine").appendChild(document.createTextNode("।"));
    }
    if (nagad) {
      $("nagadNumberLine").innerHTML = "";
      $("nagadNumberLine").appendChild(document.createTextNode("পেমেন্ট নম্বরে টাকা পাঠান: "));
      const strong = document.createElement("strong");
      strong.textContent = nagad;
      $("nagadNumberLine").appendChild(strong);
      $("nagadNumberLine").appendChild(document.createTextNode("।"));
    }
    if (bkash || nagad) {
      $("paymentNumberNote").querySelector("p").innerHTML =
        "<strong>উপরের নম্বরে সঠিকভাবে টাকা পাঠান।</strong> ভুল নম্বরে টাকা পাঠাবেন না — পেমেন্টের আগে নম্বরটি নিশ্চিত করে নিন। প্রয়োজনে কল করুন: <a href=\"tel:01410645030\">01410645030</a>";
    }
  }

  async function loadBatches() {
    try {
      batches = await Api.getBatches();
      batchesLoaded = true;
      renderBatches();
    } catch (e) {
      batchesLoaded = true;
      setBatchEmpty();
    }
  }

  function setBatchEmpty() {
    $("batchLoading").hidden = true;
    $("batchList").hidden = true;
    $("batchEmpty").hidden = false;
  }

  function renderBatches() {
    $("batchLoading").hidden = true;
    if (!batches || batches.length === 0) {
      setBatchEmpty();
      return;
    }
    const list = $("batchList");
    list.innerHTML = "";
    batches.forEach((b) => {
      const label = document.createElement("label");
      label.className = "batch-option";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "batch";
      input.value = b.id || b.name;
      input.required = true;
      const card = document.createElement("span");
      card.className = "batch-card";
      const radio = document.createElement("span");
      radio.className = "batch-radio";
      const text = document.createElement("span");
      const name = document.createElement("span");
      name.className = "batch-name";
      name.textContent = b.name || b.id;
      text.appendChild(name);
      if (b.schedule || b.days) {
        const meta = document.createElement("span");
        meta.className = "batch-meta";
        meta.textContent = [b.schedule, b.days].filter(Boolean).join(" · ");
        text.appendChild(document.createElement("br"));
        text.appendChild(meta);
      }
      card.appendChild(radio);
      card.appendChild(text);
      label.appendChild(input);
      label.appendChild(card);
      list.appendChild(label);
    });
    $("batchEmpty").hidden = true;
    list.hidden = false;
  }

  /* ---------- Multi-step navigation ---------- */
  const btnBack = $("btnBack");
  const btnNext = $("btnNext");
  const btnSubmit = $("btnSubmit");
  const progressFill = $("progressFill");

  function showStep(step) {
    currentStep = step;
    document.querySelectorAll(".form-step").forEach((p) => {
      p.classList.toggle("active", Number(p.dataset.stepPanel) === step);
    });
    document.querySelectorAll(".progress-step").forEach((s) => {
      const n = Number(s.dataset.step);
      s.classList.toggle("active", n === step);
      s.classList.toggle("done", n < step);
    });
    document.querySelectorAll(".progress-line").forEach((line, i) => {
      line.classList.toggle("filled", step > i + 1);
    });
    progressFill.style.width = (step / 3 * 100) + "%";
    btnBack.hidden = step === 1;
    btnNext.hidden = step === 3;
    btnSubmit.hidden = step !== 3;
    hideFormError();
    formCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  btnNext.addEventListener("click", () => {
    if (validateStep(currentStep)) showStep(currentStep + 1);
  });
  btnBack.addEventListener("click", () => showStep(currentStep - 1));

  /* ---------- Validation ---------- */
  function setError(fieldId, message) {
    const err = $("err-" + fieldId);
    const input = $(fieldId);
    if (err) {
      err.textContent = message || "";
      err.classList.toggle("show", !!message);
    }
    if (input) input.classList.toggle("invalid", !!message);
    return !message;
  }

  function isBangladeshiMobile(v) {
    const digits = v.replace(/[\s-]/g, "");
    return /^01[3-9]\d{8}$/.test(digits);
  }

  function validateStep(step) {
    let ok = true;
    if (step === 1) {
      const name = $("fullName").value.trim();
      ok = setError("fullName", name.length < 3 ? "সঠিক পূর্ণ নাম লিখুন।" : "") && ok;
      const mobile = $("mobile").value.trim();
      ok = setError("mobile", !isBangladeshiMobile(mobile) ? "সঠিক ১১ সংখ্যার মোবাইল নম্বর দিন (01XXXXXXXXX)।" : "") && ok;
      const wa = $("whatsapp").value.trim();
      ok = setError("whatsapp", wa && !isBangladeshiMobile(wa) ? "সঠিক ১১ সংখ্যার WhatsApp নম্বর দিন।" : "") && ok;
      const email = $("email").value.trim();
      ok = setError("email", email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? "সঠিক ইমেইল ঠিকানা দিন।" : "") && ok;
      const address = $("address").value.trim();
      ok = setError("address", address.length < 5 ? "পূর্ণ ঠিকানা লিখুন।" : "") && ok;
    }
    if (step === 2) {
      if (!batchesLoaded || !batches || batches.length === 0) {
        const err = $("err-batch");
        err.textContent = "ব্যাচের তালিকা শীঘ্রই আসছে — যোগাযোগ করুন: 01410645030";
        err.classList.add("show");
        return false;
      }
      const chosen = document.querySelector('input[name="batch"]:checked');
      const err = $("err-batch");
      if (!chosen) {
        err.textContent = "একটি ব্যাচ নির্বাচন করুন।";
        err.classList.add("show");
        ok = false;
      } else {
        err.textContent = "";
        err.classList.remove("show");
      }
    }
    if (step === 3) {
      const method = document.querySelector('input[name="paymentMethod"]:checked');
      const errM = $("err-paymentMethod");
      if (!method) { errM.textContent = "পেমেন্ট মাধ্যম নির্বাচন করুন।"; errM.classList.add("show"); ok = false; }
      else { errM.textContent = ""; errM.classList.remove("show"); }
      const sender = $("senderNumber").value.trim();
      ok = setError("senderNumber", !isBangladeshiMobile(sender) ? "যে নম্বর থেকে টাকা পাঠিয়েছেন, সেই ১১ সংখ্যার নম্বরটি দিন।" : "") && ok;
      const trx = $("trxId").value.trim();
      ok = setError("trxId", trx.length < 6 ? "সঠিক Transaction ID (TrxID) দিন।" : "") && ok;
      const amount = Number($("amount").value);
      ok = setError("amount", !amount || amount <= 0 ? "সঠিক পেমেন্টের পরিমাণ দিন।" : "") && ok;
      const date = $("paymentDate").value;
      ok = setError("paymentDate", !date ? "পেমেন্টের তারিখ নির্বাচন করুন।" : "") && ok;
      if (!receiptDataUrl) {
        const errR = $("err-receipt");
        errR.textContent = "পেমেন্ট রসিদের স্ক্রিনশট আপলোড করুন।";
        errR.classList.add("show");
        ok = false;
      } else {
        const errR = $("err-receipt");
        errR.textContent = "";
        errR.classList.remove("show");
      }
    }
    return ok;
  }

  /* Live re-validation on input */
  ["fullName", "mobile", "whatsapp", "email", "address", "senderNumber", "trxId", "amount", "paymentDate"].forEach((id) => {
    $(id).addEventListener("input", () => setError(id, ""));
  });

  function showFormError(msg) {
    formError.textContent = msg;
    formError.hidden = false;
  }
  function hideFormError() {
    formError.hidden = true;
    formError.textContent = "";
  }

  /* ---------- Receipt upload + client-side compression ---------- */
  const receiptInput = $("receipt");
  const uploadBox = $("uploadBox");

  uploadBox.addEventListener("click", (e) => {
    if (e.target.closest("#receiptRemove")) return;
    receiptInput.click();
  });
  uploadBox.addEventListener("dragover", (e) => { e.preventDefault(); uploadBox.classList.add("drag"); });
  uploadBox.addEventListener("dragleave", () => uploadBox.classList.remove("drag"));
  uploadBox.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadBox.classList.remove("drag");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleReceiptFile(e.dataTransfer.files[0]);
  });
  receiptInput.addEventListener("change", () => {
    if (receiptInput.files[0]) handleReceiptFile(receiptInput.files[0]);
  });
  $("receiptRemove").addEventListener("click", (e) => {
    e.stopPropagation();
    receiptDataUrl = null;
    receiptFileName = "";
    receiptInput.value = "";
    $("uploadPreview").hidden = true;
    $("uploadEmpty").hidden = false;
  });

  function handleReceiptFile(file) {
    const errR = $("err-receipt");
    if (!file.type.startsWith("image/")) {
      errR.textContent = "শুধু ছবি (JPG / PNG) আপলোড করা যাবে।";
      errR.classList.add("show");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      errR.textContent = "ছবির আকার ৫ MB-এর বেশি হতে পারবে না।";
      errR.classList.add("show");
      return;
    }
    errR.textContent = "";
    errR.classList.remove("show");
    compressImage(file).then((dataUrl) => {
      receiptDataUrl = dataUrl;
      receiptFileName = file.name;
      $("receiptPreview").src = dataUrl;
      $("uploadEmpty").hidden = true;
      $("uploadPreview").hidden = false;
    }).catch(() => {
      errR.textContent = "ছবিটি প্রক্রিয়া করা যায়নি — অন্য ছবি চেষ্টা করুন।";
      errR.classList.add("show");
    });
  }

  /* সর্বোচ্চ ১২৮০px, JPEG 0.8 — রসিদ পাঠানোর আগে ছোট করা হয়। */
  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const max = 1280;
          let w = img.width, h = img.height;
          if (w > max || h > max) {
            const scale = Math.min(max / w, max / h);
            w = Math.round(w * scale);
            h = Math.round(h * scale);
          }
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.8));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /* ---------- Submit ---------- */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (isSubmitting) return; /* duplicate request প্রতিরোধ */
    if (!validateStep(3)) return;

    if (!Api.isConfigured()) {
      showFormError("Backend সংযুক্ত হয়নি — শীঘ্রই চালু হবে। আপনার আবেদন এখনো জমা হয়নি।");
      return;
    }

    const batchInput = document.querySelector('input[name="batch"]:checked');
    const methodInput = document.querySelector('input[name="paymentMethod"]:checked');
    const batchName = batchInput
      ? (batches.find((b) => (b.id || b.name) === batchInput.value) || {}).name || batchInput.value
      : "";

    if (!idempotencyKey) {
      idempotencyKey = "adm-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    }

    isSubmitting = true;
    btnSubmit.disabled = true;
    btnBack.disabled = true;
    $("submitSpinner").hidden = false;
    document.querySelector("#btnSubmit .submit-label").textContent = "জমা হচ্ছে…";
    hideFormError();

    try {
      const result = await Api.submitAdmission({
        fullName: $("fullName").value.trim(),
        mobile: $("mobile").value.trim(),
        whatsapp: $("whatsapp").value.trim(),
        email: $("email").value.trim(),
        address: $("address").value.trim(),
        batchId: batchInput.value,
        batchName: batchName,
        paymentMethod: methodInput.value,
        senderNumber: $("senderNumber").value.trim(),
        transactionId: $("trxId").value.trim(),
        amount: Number($("amount").value),
        paymentDate: $("paymentDate").value,
        receiptBase64: receiptDataUrl,
        receiptFileName: receiptFileName,
        idempotencyKey: idempotencyKey,
      });

      if (result && result.success && result.studentId) {
        lastResult = {
          studentId: result.studentId,
          name: $("fullName").value.trim(),
          batch: batchName,
          date: result.submissionDate || new Date().toLocaleString("bn-BD"),
        };
        showSuccess(lastResult);
      } else if (result && result.error === "DUPLICATE_TRANSACTION") {
        showFormError("এই Transaction ID দিয়ে ইতিমধ্যে একটি আবেদন জমা আছে। অনুগ্রহ করে Transaction ID যাচাই করুন।");
      } else {
        showFormError((result && result.message) || "আবেদন জমা করা যায়নি — আবার চেষ্টা করুন।");
      }
    } catch (err) {
      if (err && err.message === "BACKEND_NOT_CONFIGURED") {
        showFormError("Backend সংযুক্ত হয়নি — শীঘ্রই চালু হবে। আপনার আবেদন এখনো জমা হয়নি।");
      } else {
        showFormError("নেটওয়ার্ক সমস্যা হয়েছে — ইন্টারনেট সংযোগ যাচাই করে আবার চেষ্টা করুন। আপনার আবেদন এখনো জমা হয়নি।");
      }
    } finally {
      isSubmitting = false;
      btnSubmit.disabled = false;
      btnBack.disabled = false;
      $("submitSpinner").hidden = true;
      document.querySelector("#btnSubmit .submit-label").textContent = "আবেদন জমা দিন";
    }
  });

  /* ---------- Success screen ---------- */
  function showSuccess(data) {
    form.hidden = true;
    document.querySelector(".progress").hidden = true;
    document.querySelector(".progress-bar").hidden = true;
    $("successStudentId").textContent = data.studentId;
    $("successName").textContent = data.name;
    $("successBatch").textContent = data.batch;
    $("successDate").textContent = data.date;
    successScreen.hidden = false;
    buildPrintArea(data);
    successScreen.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function buildPrintArea(data) {
    const area = $("printArea");
    area.innerHTML = "";
    const div = document.createElement("div");
    div.className = "print-confirm";
    div.innerHTML =
      "<h2>REDUAN COMPUTER</h2>" +
      "<p>শিখুন দক্ষতা, গড়ুন সফল ক্যারিয়ার।</p>" +
      "<p><strong>Admission Confirmation</strong></p>" +
      "<p class=\"pc-id\"></p>" +
      "<table>" +
      "<tr><td>শিক্ষার্থীর নাম</td><td></td></tr>" +
      "<tr><td>ব্যাচ</td><td></td></tr>" +
      "<tr><td>পেমেন্ট যাচাই</td><td>Pending</td></tr>" +
      "<tr><td>জমার তারিখ</td><td></td></tr>" +
      "</table>" +
      "<p style=\"margin-top:16px\">হোসেনপুর থানা মসজিদ সংলগ্ন, হোসেনপুর, কিশোরগঞ্জ, বাংলাদেশ। · ফোন: 01410645030</p>";
    div.querySelector(".pc-id").textContent = "Student ID: " + data.studentId;
    const cells = div.querySelectorAll("table td:nth-child(2)");
    cells[0].textContent = data.name;
    cells[1].textContent = data.batch;
    cells[2].textContent = data.date;
    area.appendChild(div);
  }

  /* Copy Student ID */
  $("btnCopyId").addEventListener("click", async () => {
    if (!lastResult) return;
    const confirm = $("copyConfirm");
    try {
      await navigator.clipboard.writeText(lastResult.studentId);
    } catch (e) {
      /* ক্লিপবোর্ড অনুমতি না থাকলে fallback */
      const ta = document.createElement("textarea");
      ta.value = lastResult.studentId;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch (err) { /* ignore */ }
      document.body.removeChild(ta);
    }
    confirm.hidden = false;
    setTimeout(() => { confirm.hidden = true; }, 3500);
  });

  /* Download confirmation = print stylesheet দিয়ে প্রিন্ট (PDF-এ সংরক্ষণ করা যায়) */
  $("btnDownload").addEventListener("click", () => { window.print(); });
  $("btnPrint").addEventListener("click", () => { window.print(); });

  /* ---------- Init ---------- */
  showStep(1);
  initBackend();
})();
