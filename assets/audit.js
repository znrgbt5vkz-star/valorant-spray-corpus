(function () {
  "use strict";

  const STORAGE_KEY = "spray-audit-v1";
  const t = (key) => window.SprayI18n ? window.SprayI18n.t(key) : key;
  const escapeHtml = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
  let items = [];

  function readChecked() {
    try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}"); }
    catch { return {}; }
  }

  function writeChecked(value) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  }

  function seedCheckedFromCorpus() {
    const checked = readChecked();
    items.forEach((item) => { if (item.human_checked === "yes") checked[item.id] = true; });
    writeChecked(checked);
    return checked;
  }

  function updateProgress() {
    const checked = readChecked();
    const count = items.filter((item) => checked[item.id]).length;
    document.getElementById("auditProgress").textContent = t("auditProgress").replace("{n}", String(count)).replace("{total}", String(items.length));
    document.getElementById("auditStatus").textContent = count === items.length ? t("auditConfirmed") : t("auditPending");
    items.forEach((item) => {
      const status = document.querySelector('[data-audit-status="' + item.id + '"]');
      if (status) status.textContent = checked[item.id] ? t("auditConfirmed") : t("auditPending");
    });
  }

  function render() {
    const checked = readChecked();
    document.getElementById("reviewGrid").innerHTML = items.map((item) => {
      return '<article class="panel review-card" data-audit-card="' + escapeHtml(item.id) + '">' +
        '<img src="' + escapeHtml(item.image_url) + '" alt="' + escapeHtml(t("auditImageAlt")) + '" loading="lazy">' +
        '<div><h3>' + escapeHtml(item.source_core) + "</h3>" +
        '<p><strong>' + escapeHtml(item.target_core) + "</strong></p>" +
        '<p><span class="strategy-tag" data-code="' + escapeHtml(item.strategy_code) + '">' + escapeHtml(t(({ L: "strategyLiteral", P: "strategyParaphrase", T: "strategyTranscreation", E: "strategyExplicitation", C: "strategyCultural", R: "strategyRetention" })[item.strategy_code])) + "</span> " +
        '<span class="form-tag">' + escapeHtml(item.source_form) + "</span></p>" +
        '<div class="review-actions"><a href="' + escapeHtml(item.source_url_en) + '" target="_blank" rel="noopener">' + escapeHtml(t("sourceLink")) + '</a><a href="' + escapeHtml(item.source_url_zh) + '" target="_blank" rel="noopener">' + escapeHtml(t("targetLink")) + "</a></div>" +
        '<label class="checkbox-row"><input type="checkbox" data-audit-check="' + escapeHtml(item.id) + '"' + (checked[item.id] ? " checked" : "") + "> " + escapeHtml(t("auditCheckLabel")) + "</label>" +
        '<p class="codebook-meta"><span data-audit-status="' + escapeHtml(item.id) + '">' + escapeHtml(checked[item.id] ? t("auditConfirmed") : t("auditPending")) + "</span></p>" +
        "</div></article>";
    }).join("");
    document.querySelectorAll("[data-audit-check]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const value = readChecked();
        if (checkbox.checked) value[checkbox.dataset.auditCheck] = true;
        else delete value[checkbox.dataset.auditCheck];
        writeChecked(value);
        updateProgress();
      });
    });
    updateProgress();
  }

  function exportChecked() {
    const checked = readChecked();
    const selected = items.filter((item) => checked[item.id]);
    const status = document.getElementById("auditMessage");
    if (!selected.length) { status.textContent = t("auditExportEmpty"); return; }
    const headers = ["id", "source_text", "target_text", "human_checked", "source_url_en", "source_url_zh"];
    const rows = selected.map((item) => [item.id, item.source_text, item.target_text, "yes", item.source_url_en, item.source_url_zh]);
    const csv = [headers.join(",")].concat(rows.map((row) => row.map((cell) => '"' + String(cell).replace(/"/g, '""') + '"').join(","))).join("\n");
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "manual-check-results.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    status.textContent = "Exported " + selected.length + " checked entries.";
  }

  function reset() {
    window.localStorage.removeItem(STORAGE_KEY);
    render();
  }

  async function init() {
    try {
      const response = await fetch("data/corpus.json");
      if (!response.ok) throw new Error("HTTP " + response.status);
      const corpus = await response.json();
      items = corpus.entries.filter((entry) => entry.manual_check_sample);
      seedCheckedFromCorpus();
      render();
      document.getElementById("auditExport").addEventListener("click", exportChecked);
      document.getElementById("auditReset").addEventListener("click", reset);
    } catch (error) {
      console.error(error);
      document.getElementById("reviewGrid").innerHTML = '<p class="empty-state">' + escapeHtml(t("auditError")) + "</p>";
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
