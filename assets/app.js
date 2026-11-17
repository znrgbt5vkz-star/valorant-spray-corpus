(function () {
  "use strict";

  const STRATEGY_ORDER = ["L", "P", "T", "E", "C", "R"];
  const FORM_ORDER = ["word", "phrase", "clause", "symbolic"];
  const STRATEGY_COLORS = { L: "#70a9ff", P: "#b99cff", T: "#ff4655", E: "#ffc857", C: "#69e6c4", R: "#d5e2eb" };
  const FORM_COLORS = { word: "#ff8b94", phrase: "#70a9ff", clause: "#69e6c4", symbolic: "#ffc857" };
  const STRATEGY_META = {
    "Literal translation": { code: "L", key: "strategyLiteral" },
    "Semantic paraphrase": { code: "P", key: "strategyParaphrase" },
    "Transcreation": { code: "T", key: "strategyTranscreation" },
    "Explicitation": { code: "E", key: "strategyExplicitation" },
    "Cultural substitution": { code: "C", key: "strategyCultural" },
    "Retention / phonetic transfer": { code: "R", key: "strategyRetention" }
  };
  const FORM_KEYS = { word: "formWord", phrase: "formPhrase", clause: "formClause", symbolic: "formSymbolic" };
  const GROUP_KEYS = { Other: "groupOther", Esports: "groupEsports", "Event Pass": "groupEventPass", "Battle Pass": "groupBattlePass", Store: "groupStore", Premier: "groupPremier" };

  let corpus = null;
  let entries = [];
  let filtered = [];
  let state = { q: "", strategy: "", form: "", checked: "", group: "" };
  let sort = { key: "id", direction: "asc" };
  let tooltip = null;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const t = (key) => window.SprayI18n ? window.SprayI18n.t(key) : key;
  const strategyCode = (entry) => entry.strategy_code || (STRATEGY_META[entry.strategy] || {}).code || "L";
  const strategyLabel = (entry) => t((STRATEGY_META[entry.strategy] || { key: "strategyLiteral" }).key);
  const formLabel = (value) => t(FORM_KEYS[value] || FORM_KEYS.word);
  const groupLabel = (value) => t(GROUP_KEYS[value] || GROUP_KEYS.Other);
  const escapeHtml = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));

  function getParams() { return new URLSearchParams(window.location.search); }

  function readState() {
    const params = getParams();
    state = {
      q: params.get("q") || "",
      strategy: params.get("strategy") || "",
      form: params.get("form") || "",
      checked: params.get("checked") || "",
      group: params.get("group") || ""
    };
    sort = { key: params.get("sort") || "id", direction: params.get("dir") === "desc" ? "desc" : "asc" };
    $("#searchInput").value = state.q;
    $("#strategyFilter").value = state.strategy;
    $("#formFilter").value = state.form;
    $("#checkedFilter").value = state.checked;
    $("#groupFilter").value = state.group;
  }

  function syncUrl() {
    const params = getParams();
    const values = { q: state.q, strategy: state.strategy, form: state.form, checked: state.checked, group: state.group, sort: sort.key === "id" ? "" : sort.key, dir: sort.direction === "asc" ? "" : sort.direction };
    Object.keys(values).forEach((key) => {
      if (values[key]) params.set(key, values[key]);
      else params.delete(key);
    });
    const url = new URL(window.location.href);
    url.search = params.toString();
    window.history.replaceState({}, "", url.toString());
  }

  function matchingEntries() {
    const q = state.q.trim().toLocaleLowerCase();
    return entries.filter((entry) => {
      if (q) {
        const haystack = [entry.source_text, entry.target_text, entry.source_core, entry.target_core, entry.strategy, entry.strategy_zh].join(" ").toLocaleLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (state.strategy && strategyCode(entry) !== state.strategy) return false;
      if (state.form && entry.source_form !== state.form) return false;
      if (state.checked && entry.human_checked !== state.checked) return false;
      if (state.group && entry.asset_group !== state.group) return false;
      return true;
    });
  }

  function metaForCode(code) {
    return Object.values(STRATEGY_META).find((item) => item.code === code) || STRATEGY_META["Literal translation"];
  }

  function populateFilters() {
    const strategySelect = $("#strategyFilter");
    STRATEGY_ORDER.forEach((code) => {
      const option = document.createElement("option");
      option.value = code;
      option.textContent = t(metaForCode(code).key);
      strategySelect.appendChild(option);
    });
    const formSelect = $("#formFilter");
    FORM_ORDER.forEach((form) => {
      const option = document.createElement("option");
      option.value = form;
      option.textContent = formLabel(form);
      formSelect.appendChild(option);
    });
    const groupSelect = $("#groupFilter");
    Array.from(new Set(entries.map((entry) => entry.asset_group))).sort().forEach((group) => {
      const option = document.createElement("option");
      option.value = group;
      option.textContent = groupLabel(group);
      groupSelect.appendChild(option);
    });
  }

  function renderStatus() {
    const count = filtered.length;
    $("#resultsCount").textContent = t("resultsCount").replace("{n}", String(count));
    $("#showingCount").textContent = t("showingCount").replace("{n}", String(count)).replace("{total}", String(entries.length));
    const chips = [];
    if (state.q) chips.push(t("searchLabel") + ": “" + state.q + "”");
    if (state.strategy) chips.push(t("selectedStrategy") + ": " + t(metaForCode(state.strategy).key));
    if (state.form) chips.push(t("selectedForm") + ": " + formLabel(state.form));
    if (state.checked) chips.push(t("filterChecked") + ": " + t(state.checked === "yes" ? "checkedYes" : "checkedNo"));
    if (state.group) chips.push(t("filterGroup") + ": " + groupLabel(state.group));
    $("#activeFilters").innerHTML = chips.length ? chips.map((chip) => '<span class="filter-chip">' + escapeHtml(chip) + "</span>").join(" ") : escapeHtml(t("noActiveFilters"));
  }

  function renderTable() {
    const direction = sort.direction === "asc" ? 1 : -1;
    const rows = filtered.slice().sort((a, b) => {
      let av = sort.key === "strategy" ? strategyCode(a) : a[sort.key];
      let bv = sort.key === "strategy" ? strategyCode(b) : b[sort.key];
      if (sort.key === "human_checked") { av = av === "yes" ? 1 : 0; bv = bv === "yes" ? 1 : 0; }
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * direction;
    });
    $("#tableBody").innerHTML = rows.map((entry) => {
      const code = strategyCode(entry);
      return "<tr>" +
        '<td class="id-cell">' + escapeHtml(entry.id) + "</td>" +
        '<td><button class="name-button" type="button" data-search="' + escapeHtml(entry.source_core) + '">' + escapeHtml(entry.source_core) + "</button></td>" +
        '<td><button class="name-button" type="button" data-search="' + escapeHtml(entry.target_core) + '">' + escapeHtml(entry.target_core) + "</button></td>" +
        '<td><span class="strategy-tag" data-code="' + code + '">' + escapeHtml(strategyLabel(entry)) + "</span></td>" +
        '<td><span class="form-tag">' + escapeHtml(formLabel(entry.source_form)) + "</span></td>" +
        '<td><span class="' + (entry.human_checked === "yes" ? "badge-yes" : "badge-no") + '">' + escapeHtml(t(entry.human_checked === "yes" ? "checkedYes" : "checkedNo")) + "</span></td>" +
        '<td><div class="link-list"><a href="' + escapeHtml(entry.source_url_en) + '" target="_blank" rel="noopener">' + escapeHtml(t("sourceLink")) + '</a><a href="' + escapeHtml(entry.source_url_zh) + '" target="_blank" rel="noopener">' + escapeHtml(t("targetLink")) + "</a></div></td>" +
        "</tr>";
    }).join("");
    $("#emptyState").hidden = rows.length !== 0;
    $("#corpusTable").hidden = rows.length === 0;
    $$("#corpusTable thead [data-sort]").forEach((button) => {
      const active = button.dataset.sort === sort.key;
      button.closest("th").setAttribute("aria-sort", active ? (sort.direction === "asc" ? "ascending" : "descending") : "none");
      button.textContent = t(button.dataset.i18n);
      if (active) button.textContent += sort.direction === "asc" ? " ↑" : " ↓";
    });
  }

  function clearContainer(selector) {
    const node = $(selector);
    node.innerHTML = "";
    return node;
  }

  function emptyChart(container, message) {
    container.innerHTML = '<p class="empty-state">' + escapeHtml(message) + "</p>";
  }

  function showTooltip(event, html) {
    if (!tooltip) tooltip = $("#chartTooltip");
    tooltip.innerHTML = html;
    tooltip.classList.add("visible");
    const width = Math.min(290, window.innerWidth - 28);
    tooltip.style.maxWidth = width + "px";
    const x = Math.min(event.clientX + 12, window.innerWidth - width - 12);
    const y = Math.min(event.clientY + 12, window.innerHeight - 110);
    tooltip.style.left = Math.max(8, x) + "px";
    tooltip.style.top = Math.max(8, y) + "px";
  }

  function hideTooltip() { if (tooltip) tooltip.classList.remove("visible"); }

  function addLegend(container, items) {
    const legend = document.createElement("div");
    legend.className = "legend";
    legend.innerHTML = items.map((item) => '<span class="legend-item"><span class="legend-swatch" style="background:' + item.color + '"></span>' + escapeHtml(item.label) + "</span>").join("");
    container.appendChild(legend);
  }

  function strategyLegend(container) {
    addLegend(container, STRATEGY_ORDER.map((code) => ({ color: STRATEGY_COLORS[code], label: t(metaForCode(code).key) })));
  }

  function formLegend(container) {
    addLegend(container, FORM_ORDER.map((form) => ({ color: FORM_COLORS[form], label: formLabel(form) })));
  }

  function setFilter(patch, options = {}) {
    Object.assign(state, patch);
    if (options.clearSearch) state.q = "";
    syncUrl();
    applyFilters({ preserveControls: false });
    if (options.scroll) $("#explorer-title").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function applyFilters(options = {}) {
    if (options.preserveControls !== true) {
      $("#searchInput").value = state.q;
      $("#strategyFilter").value = state.strategy;
      $("#formFilter").value = state.form;
      $("#checkedFilter").value = state.checked;
      $("#groupFilter").value = state.group;
    }
    filtered = matchingEntries();
    renderStatus();
    renderTable();
    renderCharts();
  }

  function renderCharts() {
    renderSankey(filtered);
    renderHeatmap(filtered);
    renderTreemap(filtered);
    renderScatter(filtered);
  }

  function renderSankey(data) {
    const container = clearContainer("#sankeyChart");
    if (!data.length) return emptyChart(container, t("noResults"));
    const minFlow = Math.max(1, Number($("#minFlow").value) || 1);
    $("#minFlowValue").textContent = String(minFlow);
    const countMap = new Map();
    data.forEach((entry) => {
      const key = entry.source_form + "|" + strategyCode(entry);
      countMap.set(key, (countMap.get(key) || 0) + 1);
    });
    const links = [];
    countMap.forEach((value, key) => {
      if (value >= minFlow) {
        const parts = key.split("|");
        links.push({ source: "form-" + parts[0], target: "strategy-" + parts[1], value: value, form: parts[0], strategy: parts[1] });
      }
    });
    if (!links.length) return emptyChart(container, t("noResults"));
    const activeForms = new Set(links.map((link) => link.form));
    const activeStrategies = new Set(links.map((link) => link.strategy));
    const nodes = FORM_ORDER.filter((form) => activeForms.has(form)).map((form) => ({ id: "form-" + form, kind: "form", key: form, label: formLabel(form) }))
      .concat(STRATEGY_ORDER.filter((code) => activeStrategies.has(code)).map((code) => ({ id: "strategy-" + code, kind: "strategy", key: code, label: t(metaForCode(code).key) })));
    const width = Math.max(360, container.clientWidth || 560);
    const height = 390;
    const svg = d3.select(container).append("svg").attr("viewBox", "0 0 " + width + " " + height).attr("role", "img");
    const sankey = d3.sankey().nodeId((node) => node.id).nodeWidth(18).nodePadding(16).extent([[8, 18], [width - 130, height - 28]]);
    const graph = sankey({ nodes: nodes.map((node) => Object.assign({}, node)), links: links.map((link) => Object.assign({}, link)) });
    graph.links.forEach((link) => {
      const isActive = (!state.strategy || link.strategy === state.strategy) && (!state.form || link.form === state.form);
      const label = formLabel(link.form) + " → " + t(metaForCode(link.strategy).key);
      d3.select(svg.node()).append("path").datum(link).attr("d", d3.sankeyLinkHorizontal()).attr("fill", "none")
        .attr("stroke", STRATEGY_COLORS[link.strategy]).attr("stroke-opacity", isActive ? 0.42 : 0.12)
        .attr("stroke-width", Math.max(2, link.width)).style("cursor", "pointer")
        .on("mouseenter", (event) => showTooltip(event, "<strong>" + escapeHtml(label) + "</strong><br>" + link.value + " " + escapeHtml(t("statEntries"))))
        .on("mousemove", (event) => showTooltip(event, "<strong>" + escapeHtml(label) + "</strong><br>" + link.value + " " + escapeHtml(t("statEntries"))))
        .on("mouseleave", hideTooltip)
        .on("click", () => setFilter({ form: link.form, strategy: link.strategy }, { clearSearch: true }));
    });
    graph.nodes.forEach((node) => {
      const group = d3.select(svg.node()).append("g").style("cursor", "pointer");
      const color = node.kind === "form" ? FORM_COLORS[node.key] : STRATEGY_COLORS[node.key];
      group.append("rect").attr("x", node.x0).attr("y", node.y0).attr("width", Math.max(1, node.x1 - node.x0)).attr("height", Math.max(1, node.y1 - node.y0)).attr("fill", color).attr("rx", 3)
        .on("mouseenter", (event) => showTooltip(event, "<strong>" + escapeHtml(node.label) + "</strong><br>" + node.value + " " + escapeHtml(t("statEntries"))))
        .on("mousemove", (event) => showTooltip(event, "<strong>" + escapeHtml(node.label) + "</strong><br>" + node.value + " " + escapeHtml(t("statEntries"))))
        .on("mouseleave", hideTooltip)
        .on("click", () => node.kind === "form" ? setFilter({ form: node.key }, { clearSearch: true }) : setFilter({ strategy: node.key }, { clearSearch: true }));
      const isRight = node.kind === "strategy";
      group.append("text").attr("x", isRight ? node.x1 + 8 : node.x0 - 8).attr("y", (node.y0 + node.y1) / 2).attr("dy", "0.35em")
        .attr("text-anchor", isRight ? "start" : "end").attr("fill", "#b8c5cf").attr("font-size", 11)
        .text(node.label + " · " + node.value);
    });
    strategyLegend(container);
  }

  function renderHeatmap(data) {
    const container = clearContainer("#heatmapChart");
    if (!data.length) return emptyChart(container, t("noResults"));
    const mode = $("#heatmapMode").value;
    const forms = FORM_ORDER.filter((form) => data.some((entry) => entry.source_form === form));
    const matrix = new Map();
    data.forEach((entry) => {
      const key = entry.source_form + "|" + strategyCode(entry);
      matrix.set(key, (matrix.get(key) || 0) + 1);
    });
    const rowTotals = new Map(forms.map((form) => [form, data.filter((entry) => entry.source_form === form).length]));
    const values = [];
    forms.forEach((form) => STRATEGY_ORDER.forEach((code) => {
      const count = matrix.get(form + "|" + code) || 0;
      values.push({ form: form, code: code, count: count, percent: rowTotals.get(form) ? count / rowTotals.get(form) : 0 });
    }));
    const max = d3.max(values, (item) => mode === "percent" ? item.percent : item.count) || 1;
    const width = Math.max(360, container.clientWidth || 560);
    const height = 390;
    const margin = { top: 22, right: 12, bottom: 108, left: 108 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const svg = d3.select(container).append("svg").attr("viewBox", "0 0 " + width + " " + height);
    const root = svg.append("g").attr("transform", "translate(" + margin.left + "," + margin.top + ")");
    const x = d3.scaleBand().domain(STRATEGY_ORDER).range([0, innerWidth]).padding(0.08);
    const y = d3.scaleBand().domain(forms).range([0, innerHeight]).padding(0.1);
    const color = d3.scaleSequential().domain([0, max]).interpolator(d3.interpolateReds);
    root.append("g").attr("class", "axis").selectAll("text").data(STRATEGY_ORDER).join("text")
      .attr("x", (code) => x(code) + x.bandwidth() / 2).attr("y", innerHeight + 22).attr("text-anchor", "end")
      .attr("transform", (code) => "rotate(-42 " + (x(code) + x.bandwidth() / 2) + " " + (innerHeight + 22) + ")").text((code) => code);
    root.append("g").attr("class", "axis").selectAll("text").data(forms).join("text")
      .attr("x", -12).attr("y", (form) => y(form) + y.bandwidth() / 2).attr("dy", "0.35em").attr("text-anchor", "end").text((form) => formLabel(form));
    root.selectAll("rect.cell").data(values).join("rect").attr("class", "cell")
      .attr("x", (item) => x(item.code)).attr("y", (item) => y(item.form)).attr("width", x.bandwidth()).attr("height", y.bandwidth()).attr("rx", 6)
      .attr("fill", (item) => color(mode === "percent" ? item.percent : item.count)).attr("stroke", "rgba(255,255,255,.06)").style("cursor", "pointer")
      .on("mouseenter", (event, item) => showTooltip(event, "<strong>" + escapeHtml(formLabel(item.form) + " × " + t(metaForCode(item.code).key)) + "</strong><br>" + item.count + " " + escapeHtml(t("statEntries")) + " · " + Math.round(item.percent * 100) + "%"))
      .on("mousemove", (event, item) => showTooltip(event, "<strong>" + escapeHtml(formLabel(item.form) + " × " + t(metaForCode(item.code).key)) + "</strong><br>" + item.count + " " + escapeHtml(t("statEntries")) + " · " + Math.round(item.percent * 100) + "%"))
      .on("mouseleave", hideTooltip).on("click", (event, item) => setFilter({ form: item.form, strategy: item.code }, { clearSearch: true }));
    root.selectAll("text.value").data(values).join("text").attr("class", "value")
      .attr("x", (item) => x(item.code) + x.bandwidth() / 2).attr("y", (item) => y(item.form) + y.bandwidth() / 2).attr("dy", "0.35em").attr("text-anchor", "middle")
      .attr("fill", (item) => (mode === "percent" ? item.percent : item.count / max) > 0.52 ? "#16080a" : "#f1f4f6").attr("font-size", 11).attr("pointer-events", "none")
      .text((item) => item.count ? (mode === "percent" ? Math.round(item.percent * 100) + "%" : item.count) : "");
    strategyLegend(container);
  }

  function renderTreemap(data) {
    const container = clearContainer("#treemapChart");
    if (!data.length) return emptyChart(container, t("noResults"));
    const mode = $("#hierarchyMode").value;
    const minTile = Math.max(1, Number($("#minTile").value) || 1);
    $("#minTileValue").textContent = String(minTile);
    const groups = [];
    const add = (key, label, leaf) => {
      let group = groups.find((item) => item.key === key);
      if (!group) { group = { key: key, label: label, children: [] }; groups.push(group); }
      group.children.push(leaf);
    };
    const counts = new Map();
    data.forEach((entry) => {
      const key = entry.source_form + "|" + strategyCode(entry);
      if (!counts.has(key)) counts.set(key, { form: entry.source_form, strategy: strategyCode(entry), value: 0 });
      counts.get(key).value += 1;
    });
    counts.forEach((item) => {
      if (item.value < minTile) return;
      const leaf = { key: "leaf:" + item.form + ":" + item.strategy, label: mode === "form-strategy" ? t(metaForCode(item.strategy).key) : formLabel(item.form), strategy: item.strategy, form: item.form, value: item.value };
      if (mode === "form-strategy") add("form:" + item.form, formLabel(item.form), leaf);
      else add("strategy:" + item.strategy, t(metaForCode(item.strategy).key), leaf);
    });
    const hierarchy = d3.hierarchy({ children: groups }).sum((node) => node.value || 0).sort((a, b) => b.value - a.value);
    const width = Math.max(360, container.clientWidth || 560);
    const height = 390;
    d3.treemap().size([width, height]).paddingInner(3).paddingOuter(2).round(true)(hierarchy);
    const svg = d3.select(container).append("svg").attr("viewBox", "0 0 " + width + " " + height);
    const tileGroups = svg.selectAll("g.tile").data(hierarchy.leaves()).join("g").attr("class", "tile");
    tileGroups.append("rect")
      .attr("x", (node) => node.x0).attr("y", (node) => node.y0).attr("width", (node) => Math.max(1, node.x1 - node.x0)).attr("height", (node) => Math.max(1, node.y1 - node.y0)).attr("rx", 4)
      .attr("fill", (node) => mode === "form-strategy" ? STRATEGY_COLORS[node.data.strategy] : FORM_COLORS[node.data.form]).attr("fill-opacity", 0.82).attr("stroke", "rgba(6,9,12,.75)").style("cursor", "pointer")
      .on("mouseenter", (event, node) => showTooltip(event, "<strong>" + escapeHtml(node.data.label) + "</strong><br>" + node.data.value + " " + escapeHtml(t("statEntries"))))
      .on("mousemove", (event, node) => showTooltip(event, "<strong>" + escapeHtml(node.data.label) + "</strong><br>" + node.data.value + " " + escapeHtml(t("statEntries"))))
      .on("mouseleave", hideTooltip).on("click", (event, node) => setFilter({ form: node.data.form, strategy: node.data.strategy }, { clearSearch: true }));
    tileGroups.append("text").attr("x", (node) => node.x0 + 6).attr("y", (node) => node.y0 + 17).attr("fill", "#0c1015").attr("font-size", 11).attr("font-weight", 800).attr("pointer-events", "none")
      .text((node) => node.x1 - node.x0 > 82 ? node.data.label : "");
    tileGroups.append("text").attr("x", (node) => node.x0 + 6).attr("y", (node) => node.y0 + 33).attr("fill", "rgba(8,12,16,.72)").attr("font-size", 10).attr("pointer-events", "none")
      .text((node) => node.x1 - node.x0 > 50 ? node.data.value : "");
    if (mode === "form-strategy") strategyLegend(container); else formLegend(container);
  }

  function renderScatter(data) {
    const container = clearContainer("#scatterChart");
    if (!data.length) return emptyChart(container, t("noResults"));
    const colorMode = $("#scatterColor").value;
    const width = Math.max(360, container.clientWidth || 560);
    const height = 390;
    const margin = { top: 18, right: 20, bottom: 54, left: 58 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const svg = d3.select(container).append("svg").attr("viewBox", "0 0 " + width + " " + height);
    const root = svg.append("g").attr("transform", "translate(" + margin.left + "," + margin.top + ")");
    const x = d3.scaleLinear().domain([0, d3.max(data, (entry) => entry.source_core.length) || 10]).nice().range([0, innerWidth]);
    const y = d3.scaleLinear().domain([0, d3.max(data, (entry) => entry.target_core.length) || 10]).nice().range([innerHeight, 0]);
    root.append("g").attr("class", "axis").attr("transform", "translate(0," + innerHeight + ")").call(d3.axisBottom(x).ticks(6));
    root.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(6));
    root.append("text").attr("x", innerWidth / 2).attr("y", innerHeight + 40).attr("text-anchor", "middle").attr("fill", "#657482").attr("font-size", 11).text(t("axisSourceLength"));
    root.append("text").attr("transform", "rotate(-90)").attr("x", -innerHeight / 2).attr("y", -42).attr("text-anchor", "middle").attr("fill", "#657482").attr("font-size", 11).text(t("axisTargetLength"));
    root.selectAll("circle").data(data).join("circle")
      .attr("cx", (entry) => x(entry.source_core.length) + ((hashCode(entry.id) % 7) - 3) * 1.5)
      .attr("cy", (entry) => y(entry.target_core.length) + ((hashCode(entry.target_core) % 7) - 3) * 1.5).attr("r", 4.1)
      .attr("fill", (entry) => colorMode === "strategy" ? STRATEGY_COLORS[strategyCode(entry)] : FORM_COLORS[entry.source_form]).attr("fill-opacity", 0.72).attr("stroke", "rgba(9,13,18,.55)").attr("stroke-width", 0.6).style("cursor", "pointer")
      .on("mouseenter", (event, entry) => showTooltip(event, "<strong>" + escapeHtml(entry.source_core) + "</strong><br>" + escapeHtml(entry.target_core) + "<br>" + escapeHtml(strategyLabel(entry))))
      .on("mousemove", (event, entry) => showTooltip(event, "<strong>" + escapeHtml(entry.source_core) + "</strong><br>" + escapeHtml(entry.target_core) + "<br>" + escapeHtml(strategyLabel(entry))))
      .on("mouseleave", hideTooltip).on("click", (event, entry) => setFilter({ strategy: strategyCode(entry) }, { clearSearch: true }));
    if (colorMode === "strategy") strategyLegend(container); else formLegend(container);
  }

  function hashCode(value) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
    return Math.abs(hash);
  }

  function exportCsv() {
    const rows = filtered.slice().sort((a, b) => a.id.localeCompare(b.id));
    const headers = ["id", "source_text", "target_text", "source", "category", "unit", "strategy", "source_form", "asset_group", "human_checked", "uuid", "source_url_en", "source_url_zh"];
    const csv = [headers.join(",")].concat(rows.map((row) => headers.map((header) => '"' + String(row[header] == null ? "" : row[header]).replace(/"/g, '""') + '"').join(","))).join("\n");
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "valorant-sprays-filtered.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function copyView() {
    syncUrl();
    const status = $("#copyStatus");
    try { await navigator.clipboard.writeText(window.location.href); status.textContent = t("linkCopied"); }
    catch { status.textContent = window.location.href; }
    $("#copyView").textContent = t("linkCopied");
    window.setTimeout(() => { $("#copyView").textContent = t("copyView"); }, 1600);
  }

  function bindEvents() {
    $("#filterForm").addEventListener("submit", (event) => {
      event.preventDefault();
      state = { q: $("#searchInput").value.trim(), strategy: $("#strategyFilter").value, form: $("#formFilter").value, checked: $("#checkedFilter").value, group: $("#groupFilter").value };
      syncUrl();
      applyFilters();
    });
    let searchTimer = null;
    $("#searchInput").addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => {
        state.q = $("#searchInput").value.trim();
        syncUrl();
        applyFilters({ preserveControls: true });
      }, 220);
    });
    ["#strategyFilter", "#formFilter", "#checkedFilter", "#groupFilter"].forEach((selector) => {
      $(selector).addEventListener("change", () => {
        state = { q: $("#searchInput").value.trim(), strategy: $("#strategyFilter").value, form: $("#formFilter").value, checked: $("#checkedFilter").value, group: $("#groupFilter").value };
        syncUrl();
        applyFilters({ preserveControls: true });
      });
    });
    $("#resetFilters").addEventListener("click", () => {
      state = { q: "", strategy: "", form: "", checked: "", group: "" };
      syncUrl();
      applyFilters();
    });
    $("#exportCsv").addEventListener("click", exportCsv);
    $("#copyView").addEventListener("click", copyView);
    $("#minFlow").addEventListener("input", () => renderSankey(filtered));
    $("#minTile").addEventListener("input", () => renderTreemap(filtered));
    $("#heatmapMode").addEventListener("change", () => renderHeatmap(filtered));
    $("#hierarchyMode").addEventListener("change", () => renderTreemap(filtered));
    $("#scatterColor").addEventListener("change", () => renderScatter(filtered));
    $("#tableBody").addEventListener("click", (event) => {
      const button = event.target.closest("[data-search]");
      if (button) setFilter({ q: button.dataset.search }, { scroll: true });
    });
    $$("#corpusTable thead [data-sort]").forEach((button) => {
      button.addEventListener("click", () => {
        if (sort.key === button.dataset.sort) sort.direction = sort.direction === "asc" ? "desc" : "asc";
        else { sort.key = button.dataset.sort; sort.direction = "asc"; }
        syncUrl();
        renderTable();
      });
    });
    window.addEventListener("resize", debounce(() => renderCharts(), 180));
    window.addEventListener("popstate", () => { readState(); applyFilters(); });
    window.addEventListener("languagechange", () => { if (entries.length) applyFilters(); });
  }

  function debounce(fn, wait) {
    let timer = null;
    return function () {
      clearTimeout(timer);
      timer = window.setTimeout(fn, wait);
    };
  }

  async function init() {
    try {
      const response = await fetch("data/corpus.json");
      if (!response.ok) throw new Error("HTTP " + response.status);
      corpus = await response.json();
      entries = corpus.entries;
      $("#populationCount").textContent = String(corpus.population_unique_pairs);
      $("#gameVersion").textContent = corpus.api_version.branch.replace("release-", "");
      populateFilters();
      readState();
      bindEvents();
      applyFilters();
    } catch (error) {
      console.error(error);
      $("#resultsCount").textContent = t("dataLoadError");
      $("#activeFilters").textContent = String(error.message || error);
      $("#tableBody").innerHTML = "<tr><td colspan=\"7\">" + escapeHtml(t("dataLoadError")) + "</td></tr>";
      ["#sankeyChart", "#heatmapChart", "#treemapChart", "#scatterChart"].forEach((selector) => emptyChart($(selector), t("dataLoadError")));
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
