const KEY = "custody_v2";
let D = { custodies: [], entries: [], cats: [] };
let sel = "", editC = null, editI = null, pendingCat = null, lastShown = [];
const DEF = ["محروقات (بنزين)", "مصروفات بوفيه", "صيانة", "نقل ومواصلات", "مستلزمات مكتبية", "نظافة", "اتصالات وإنترنت", "مصروفات أخرى"];

const $ = (id) => document.getElementById(id);
const today = () => new Date().toISOString().slice(0, 10);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fmt = (v) => (Math.round((+v || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (t) => { const d = document.createElement("div"); d.textContent = t == null ? "" : t; return d.innerHTML; };
const msg = (t, err) => { $("msg").textContent = t; $("msg").className = "msg" + (err ? " err" : ""); };
function save() { try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) { alert("تعذر الحفظ: مساحة المتصفح ممتلئة. خذ نسخة احتياطية."); } }

/* ---------- تحميل البيانات (مع ترحيل النسخة الأولى) ---------- */
try {
  const s = localStorage.getItem(KEY);
  if (s) D = JSON.parse(s);
  else {
    const o = JSON.parse(localStorage.getItem("custody_invoices_v1") || "null");
    if (o && (o.custody.length || o.invoices.length)) {
      D.custodies.push({ id: "c0", holder: "عهدتي", branch: "" });
      o.custody.forEach((x) => D.entries.push({ id: x.id, custodyId: "c0", kind: "c", amount: x.amount, date: x.date, desc: x.note || "", ts: x.ts }));
      o.invoices.forEach((x) => D.entries.push({ id: x.id, custodyId: "c0", kind: "i", amount: x.amount, date: x.date, no: x.no || "", vendor: x.vendor || "", desc: x.desc || "", category: "", hasImage: false, ts: x.ts }));
      save();
    }
  }
} catch (e) {}

/* ---------- تخزين الصور (IndexedDB) ---------- */
const idb = () => new Promise((res, rej) => { const r = indexedDB.open("custody_img", 1); r.onupgradeneeded = () => r.result.createObjectStore("i"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const tx = async (mode, fn) => { const d = await idb(); return new Promise((res, rej) => { const t = d.transaction("i", mode), q = fn(t.objectStore("i")); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }); };
const idbPut = (k, v) => tx("readwrite", (s) => s.put(v, k));
const idbGet = (k) => tx("readonly", (s) => s.get(k));
const idbDel = (k) => tx("readwrite", (s) => s.delete(k));
const idbClear = () => tx("readwrite", (s) => s.clear());
async function idbAll() { const d = await idb(); return new Promise((res, rej) => { const o = {}, c = d.transaction("i", "readonly").objectStore("i").openCursor(); c.onsuccess = () => { const u = c.result; if (u) { o[u.key] = u.value; u.continue(); } else res(o); }; c.onerror = () => rej(c.error); }); }
function compress(file) {
  return new Promise((res, rej) => {
    const img = new Image(), r = new FileReader();
    r.onload = () => { img.onload = () => { const k = Math.min(1, 1000 / Math.max(img.width, img.height)), c = document.createElement("canvas");
      c.width = img.width * k; c.height = img.height * k; c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL("image/jpeg", 0.6)); };
      img.onerror = rej; img.src = r.result; };
    r.onerror = rej; r.readAsDataURL(file);
  });
}

/* ---------- حسابات ---------- */
const allCats = () => [...new Set([...DEF, ...D.cats, ...D.entries.map((e) => e.category).filter(Boolean)])];
const label = (c) => (c ? c.holder + (c.branch ? " - " + c.branch : "") : "—");
const cById = (id) => D.custodies.find((c) => c.id === id);
const sum = (l, k) => l.filter((e) => e.kind === k).reduce((s, e) => s + e.amount, 0);
const bal = (cid) => { const l = D.entries.filter((e) => e.custodyId === cid); return sum(l, "c") - sum(l, "i"); };

$("cDate").value = today();
$("iDate").value = today();

function render() {
  const cur = sel;
  $("custSel").innerHTML = '<option value="">كل العهد</option>' + D.custodies.map((c) => `<option value="${c.id}">${esc(label(c))}</option>`).join("");
  sel = cById(cur) ? cur : ""; $("custSel").value = sel;
  const list = allCats(), iv = $("iCat").value, fv = $("fCat").value;
  const opts = list.map((n) => `<option>${esc(n)}</option>`).join("");
  $("iCat").innerHTML = '<option value="">— اختر نوع المصروف —</option>' + opts + '<option value="__new">＋ نوع جديد…</option>';
  $("iCat").value = iv;
  if (pendingCat && list.includes(pendingCat)) { $("iCat").value = pendingCat; pendingCat = null; }
  $("fCat").innerHTML = '<option value="">كل الأنواع</option>' + opts + '<option value="__none">بدون نوع</option>';
  $("fCat").value = fv;

  const scope = sel ? D.entries.filter((e) => e.custodyId === sel) : D.entries;
  const tc = sum(scope, "c"), ti = sum(scope, "i"), rem = tc - ti;
  $("scopeName").textContent = "المتبقي من " + (sel ? "عهدة " + label(cById(sel)) : "كل العهد");
  $("remaining").textContent = fmt(rem);
  $("totalCustody").textContent = fmt(tc);
  $("totalSpent").textContent = fmt(ti);
  $("countInv").textContent = scope.filter((e) => e.kind === "i").length;
  $("balanceBox").className = "balance" + (rem < 0 ? " neg" : tc > 0 && rem < tc * 0.2 ? " low" : "");

  $("summary").innerHTML = D.custodies.length
    ? '<table><tr><th>المستلم</th><th>الفرع</th><th>العهدة</th><th>الفواتير</th><th>المتبقي</th><th></th></tr>' +
      D.custodies.map((c) => { const l = D.entries.filter((e) => e.custodyId === c.id), r = sum(l, "c") - sum(l, "i");
        return `<tr class="click" data-cid="${c.id}"><td>${esc(c.holder)}</td><td>${esc(c.branch)}</td><td>${fmt(sum(l, "c"))}</td><td>${fmt(sum(l, "i"))}</td><td class="${r < 0 ? "out" : "in"}"><b>${fmt(r)}</b></td><td><button class="ic" data-ce="${c.id}">✎</button><button class="ic del" data-cd="${c.id}">✕</button></td></tr>`; }).join("") + "</table>"
    : '<div class="empty">لا توجد عهد. اضغط "+ عهدة جديدة".</div>';

  const rows = scope.slice().sort((a, b) => (a.date === b.date ? a.ts - b.ts : a.date < b.date ? -1 : 1));
  let run = 0; rows.forEach((r) => { run += r.kind === "c" ? r.amount : -r.amount; r.run = run; });
  const q = $("search").value.trim().toLowerCase();
  const from = $("fFrom").value, to = $("fTo").value, fc = $("fCat").value;
  const inR = (r) => (!from || r.date >= from) && (!to || r.date <= to);
  const catOk = (r) => !fc || (r.kind === "i" && (fc === "__none" ? !r.category : r.category === fc));
  const by = {}; let tI = 0;
  rows.filter((r) => r.kind === "i" && inR(r)).forEach((r) => { const k = r.category || "بدون نوع"; by[k] = by[k] || { t: 0, n: 0 }; by[k].t += r.amount; by[k].n++; tI += r.amount; });
  const ks = Object.keys(by).sort((a, b) => by[b].t - by[a].t);
  $("catSummary").innerHTML = ks.length ? '<table><tr><th>النوع</th><th>عدد الفواتير</th><th>الإجمالي</th><th>النسبة</th></tr>' + ks.map((k) => { const p = tI ? (by[k].t / tI) * 100 : 0;
    return `<tr class="click" data-fcat="${k === "بدون نوع" ? "__none" : esc(k)}"><td>${esc(k)}</td><td>${by[k].n}</td><td><b>${fmt(by[k].t)}</b></td><td><span class="bar-in" style="width:${Math.round(p * 0.8)}px"></span> ${p.toFixed(1)}%</td></tr>`; }).join("") + `<tr><td><b>الإجمالي</b></td><td></td><td><b>${fmt(tI)}</b></td><td></td></tr></table>` : '<div class="empty">لا توجد فواتير في هذه الفترة</div>';
  const shown = rows.filter((r) => inR(r) && catOk(r) && (!q || [r.no, r.vendor, r.desc, r.category, label(cById(r.custodyId))].some((v) => (v || "").toLowerCase().includes(q)))).reverse();
  lastShown = shown;
  const sI = shown.filter((r) => r.kind === "i"), sCt = shown.filter((r) => r.kind === "c").reduce((a, r) => a + r.amount, 0);
  $("shownTotal").textContent = "المعروض: " + sI.length + " فاتورة بإجمالي " + fmt(sI.reduce((a, r) => a + r.amount, 0)) + (sCt ? " — عهدة " + fmt(sCt) : "");
  $("table").querySelector("tbody").innerHTML = shown.length ? shown.map((r) => { const c = r.kind === "c";
    return `<tr><td>${esc(r.date)}</td><td>${esc(label(cById(r.custodyId)))}</td><td>${c ? "عهدة" : "فاتورة"}</td><td>${esc(r.no)}</td><td>${esc(r.vendor)}</td><td class="desc">${esc(r.desc)}</td><td>${esc(r.category)}</td>
    <td class="in">${c ? fmt(r.amount) : ""}</td><td class="out">${c ? "" : fmt(r.amount)}</td><td><b class="${r.run < 0 ? "out" : ""}">${fmt(r.run)}</b></td>
    <td class="noprint">${r.hasImage ? `<button class="ic" data-act="img" data-id="${r.id}">📎</button>` : ""}<button class="ic" data-act="edit" data-id="${r.id}">✎</button><button class="ic del" data-act="del" data-id="${r.id}">✕</button></td></tr>`; }).join("")
    : '<tr><td colspan="11" class="empty">لا توجد حركات</td></tr>';
}

/* ---------- العهد ---------- */
$("custSel").onchange = () => { sel = $("custSel").value; render(); };
$("search").oninput = render;
$("newCustBtn").onclick = () => ($("newCustCard").hidden = !$("newCustCard").hidden);
$("saveCust").onclick = () => {
  const holder = $("nHolder").value.trim();
  if (!holder) return msg("أدخل اسم المستلم", true);
  const c = { id: uid(), holder, branch: $("nBranch").value.trim() };
  D.custodies.push(c); save();
  $("nHolder").value = ""; $("nBranch").value = ""; $("newCustCard").hidden = true;
  sel = c.id; render(); msg("تمت إضافة العهدة، وتم اختيارها. سجّل الآن مبلغ العهدة.");
};

/* ---------- مبلغ العهدة ---------- */
const resetC = () => { editC = null; $("cAmount").value = ""; $("cNote").value = ""; $("cTitle").textContent = "إضافة مبلغ عهدة (استلام)"; $("cCancel").hidden = true; };
$("cCancel").onclick = resetC;
$("addCustody").onclick = () => {
  const amount = +$("cAmount").value;
  if (!editC && !sel) return msg("اختر عهدة محددة أولاً من القائمة", true);
  if (!(amount > 0)) return msg("أدخل مبلغ العهدة", true);
  const data = { kind: "c", amount, date: $("cDate").value || today(), desc: $("cNote").value.trim() };
  const old = editC ? D.entries.find((x) => x.id === editC) : null;
  if (old) Object.assign(old, data); else D.entries.push({ ...data, id: uid(), custodyId: sel, ts: Date.now() });
  save(); const cid = old ? old.custodyId : sel; resetC(); render();
  msg("تم الحفظ. المتبقي من العهدة: " + fmt(bal(cid)));
};

/* ---------- الفواتير ---------- */
const resetI = () => { editI = null; ["iNo", "iVendor", "iAmount", "iDesc", "iFile", "iCat"].forEach((i) => ($(i).value = "")); $("iTitle").textContent = "إضافة فاتورة"; $("addInvoice").textContent = "حفظ الفاتورة"; $("iCancel").hidden = true; };
$("iCancel").onclick = resetI;
$("addInvoice").onclick = async () => {
  const amount = +$("iAmount").value;
  if (!editI && !sel) return msg("اختر عهدة محددة أولاً من القائمة", true);
  if (!(amount > 0)) return msg("أدخل مبلغ الفاتورة", true);
  if (!$("iCat").value || $("iCat").value === "__new") return msg("اختر نوع المصروف", true);
  const data = { kind: "i", amount, category: $("iCat").value, no: $("iNo").value.trim(), date: $("iDate").value || today(), vendor: $("iVendor").value.trim(), desc: $("iDesc").value.trim() };
  const old = editI ? D.entries.find((x) => x.id === editI) : null;
  let en = old;
  if (old) Object.assign(old, data); else { en = { ...data, id: uid(), custodyId: sel, ts: Date.now(), hasImage: false }; D.entries.push(en); }
  const f = $("iFile").files[0];
  if (f) { try { await idbPut(en.id, await compress(f)); en.hasImage = true; } catch (e) { msg("تم حفظ الفاتورة لكن تعذر حفظ الصورة", true); } }
  save(); const cid = en.custodyId; resetI(); render();
  const rem = bal(cid);
  msg(rem < 0 ? "تم الحفظ. تنبيه: الفواتير تجاوزت العهدة بمقدار " + fmt(-rem) : "تم الحفظ. باقي من العهدة: " + fmt(rem), rem < 0);
};
$("iCat").onchange = () => {
  if ($("iCat").value !== "__new") return;
  const n = (prompt("اسم نوع المصروف الجديد") || "").trim();
  $("iCat").value = "";
  if (!n) return;
  if (!allCats().includes(n)) { D.cats.push(n); save(); }
  pendingCat = n; render();
};

/* ---------- الفلاتر ---------- */
["fCat", "fFrom", "fTo"].forEach((i) => ($(i).onchange = render));
$("clearF").onclick = () => { $("fCat").value = ""; $("fFrom").value = ""; $("fTo").value = ""; render(); };

/* ---------- النقرات ---------- */
document.addEventListener("click", async (e) => {
  const ce = e.target.closest("[data-ce]"), cd = e.target.closest("[data-cd]");
  if (ce) { const c = cById(ce.dataset.ce), h = prompt("اسم المستلم", c.holder); if (h == null) return; const br = prompt("الفرع", c.branch || ""); if (h.trim()) { c.holder = h.trim(); c.branch = (br || "").trim(); save(); render(); } return; }
  if (cd) { const id = cd.dataset.cd; if (D.entries.some((x) => x.custodyId === id)) return alert("لا يمكن حذف عهدة فيها حركات. احذف حركاتها أولاً."); if (confirm("حذف هذه العهدة؟")) { D.custodies = D.custodies.filter((c) => c.id !== id); save(); render(); } return; }
  const r = e.target.closest("tr[data-cid]"); if (r) { sel = r.dataset.cid; render(); return; }
  const f = e.target.closest("tr[data-fcat]"); if (f) { $("fCat").value = f.dataset.fcat; render(); $("table").scrollIntoView({ behavior: "smooth" }); return; }
  const b = e.target.closest("[data-act]"); if (!b) return;
  const en = D.entries.find((x) => x.id === b.dataset.id); if (!en) return;
  if (b.dataset.act === "img") {
    try { $("modalImg").src = await idbGet(en.id); $("modal").hidden = false; } catch (x) { msg("تعذر تحميل الصورة", true); }
  } else if (b.dataset.act === "edit") {
    if (en.kind === "c") { resetC(); editC = en.id; $("cAmount").value = en.amount; $("cDate").value = en.date; $("cNote").value = en.desc || ""; $("cTitle").textContent = "تعديل حركة عهدة"; $("cCancel").hidden = false; $("cAmount").scrollIntoView({ block: "center" }); }
    else { resetI(); editI = en.id; $("iNo").value = en.no || ""; $("iDate").value = en.date; $("iVendor").value = en.vendor || ""; $("iAmount").value = en.amount; $("iDesc").value = en.desc || ""; $("iCat").value = en.category || ""; $("iTitle").textContent = "تعديل فاتورة (اختر صورة جديدة فقط لو تبغى تغيير الصورة)"; $("addInvoice").textContent = "حفظ التعديل"; $("iCancel").hidden = false; $("iAmount").scrollIntoView({ block: "center" }); }
  } else if (b.dataset.act === "del" && confirm("هل تريد حذف هذه الحركة؟")) {
    D.entries = D.entries.filter((x) => x.id !== en.id); save(); if (en.hasImage) idbDel(en.id).catch(() => {}); render();
  }
});
$("modal").onclick = () => { $("modal").hidden = true; $("modalImg").src = ""; };

/* ---------- طباعة وتصدير ونسخ احتياطي ---------- */
function download(name, content, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$("printBtn").onclick = () => window.print();
$("csvBtn").onclick = () => {
  const q = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  const rows = [["التاريخ", "العهدة", "النوع", "نوع المصروف", "الرقم", "المورد", "الشرح", "مدين", "دائن", "الرصيد"]];
  lastShown.slice().reverse().forEach((r) => { const c = r.kind === "c"; rows.push([r.date, label(cById(r.custodyId)), c ? "عهدة" : "فاتورة", r.category || "", r.no || "", r.vendor || "", r.desc || "", c ? r.amount : "", c ? "" : r.amount, r.run]); });
  download("custody-report-" + today() + ".csv", "\ufeff" + rows.map((r) => r.map(q).join(",")).join("\r\n"), "text/csv;charset=utf-8");
};
$("backupBtn").onclick = async () => {
  let imgs = {}; try { imgs = await idbAll(); } catch (e) {}
  download("custody-backup-" + today() + ".json", JSON.stringify({ v: 2, data: D, imgs }), "application/json");
};
$("restoreFile").onchange = (e) => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = async () => {
    try {
      const d = JSON.parse(r.result);
      if (!d.data || !Array.isArray(d.data.custodies) || !Array.isArray(d.data.entries)) throw 0;
      if (!confirm("سيتم استبدال البيانات الحالية بالنسخة الاحتياطية. متابعة؟")) return;
      D = { custodies: d.data.custodies, entries: d.data.entries, cats: d.data.cats || [] }; save();
      await idbClear(); for (const k in d.imgs || {}) await idbPut(k, d.imgs[k]);
      render(); msg("تم استرجاع النسخة الاحتياطية");
    } catch (err) { alert("ملف غير صالح"); }
  };
  r.readAsText(f); e.target.value = "";
};

render();
if (!D.custodies.length) { $("newCustCard").hidden = false; msg("ابدأ بإضافة عهدة: اسم المستلم والفرع."); }
