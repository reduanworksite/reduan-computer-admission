/* REDUAN COMPUTER — Admission API client
 * Google Apps Script Web App-এর সঙ্গে কথা বলে।
 * Apps Script-এ preflight (OPTIONS) এড়াতে Content-Type: text/plain ব্যবহার করা হয়।
 * কোনো ডেটা এখানে বানানো হয় না — সব তথ্য ব্যাকএন্ড থেকে আসে।
 */

const Api = (() => {
  function isConfigured() {
    return typeof APPS_SCRIPT_URL === "string" && APPS_SCRIPT_URL.trim() !== "";
  }

  async function call(payload) {
    if (!isConfigured()) {
      throw new Error("BACKEND_NOT_CONFIGURED");
    }
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error("NETWORK_ERROR");
    }
    const data = await response.json();
    return data;
  }

  /* পাবলিক ব্যাচের তালিকা — getBatches অ্যাকশন (শুধু Published ব্যাচ)। */
  async function getBatches() {
    const data = await call({ action: "publicGetBatches" });
    if (data && data.success && Array.isArray(data.batches)) return data.batches;
    return [];
  }

  /* পাবলিক সেটিংস — পেমেন্ট নম্বর ইত্যাদি (ব্যাকএন্ড যা দেয় তাই)। */
  async function getSettingsPublic() {
    const data = await call({ action: "getSettingsPublic" });
    if (data && data.success && data.settings) return data.settings;
    return {};
  }

  /* ভর্তি আবেদন জমা — সফল হলেই Student ID ফেরত আসে। */
  async function submitAdmission(payload) {
    const data = await call(Object.assign({ action: "submitAdmission" }, payload));
    return data;
  }

  return { isConfigured, getBatches, getSettingsPublic, submitAdmission };
})();
