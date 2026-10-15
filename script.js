import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, addDoc, setDoc, getDoc, updateDoc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const today = () => new Date().toISOString().slice(0, 10);
const fmt = (v) => (Math.round((+v || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (t) => { const d = document.createElement("div"); d.textContent = t == null ? "" : t; return d.innerHTML; };
const msg = (t, err) => { $("msg").textContent = t; $("msg").className = "msg" + (err ? " err" : ""); };

if (String(firebaseConfig.apiKey).startsWith("PASTE")) {
  $("loginMsg").textContent = "لم يتم ضبط Firebase بعد. عدّل ملف firebase-config.js";
  throw new Error("firebase not configured");
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const DEF = ["محروقات (بنزين)", "مصروفات بوفيه", "صيانة", "نقل ومواصلات", "مستلزمات مكتبية", "نظافة", "اتصالات وإنترنت", "مصروفات أخرى"];
let cats = [], pendingCat = null, lastShown = [];
let custodies = [], entries = [], sel = "", editC = null, editI = null, unsubs = [];

$("cDate").value = today();
$("iDate").value = today();

/* ---------- الدخول ---------- */
$("loginBtn").onclick = async () => {
  try { await signInWithEmailAndPassword(auth, $("lEmail").value.trim(), $("lPass").value); }
  catch (e) { $("loginMsg").textContent = "بيانات الدخول غير صحيحة"; }
};
$("logoutBtn").onclick = () => signOut(auth);

const onErr = () => msg("لا توجد صلاحية للقراءة/الكتابة. تأكد من قواعد Firestore والإيميل المسموح.", true);
onAuthStateChanged(auth, (u) => {
  unsubs.forEach((f) => f()); unsubs = [];
  $("login").hidden = !!u; $("app").hidden = !u;
  if (!u) return;
  $("who").textContent = u.email;
  unsubs.push(onSnapshot(collection(db, "cust_custodies"), (s) => { custodies = s.docs.map((d) => ({ id: d.id, ...d.data() })); render(); }, onErr));
  unsubs.push(onSnapshot(collection(db, "cust_entries"), (s) => { entries = s.docs.map((d) => ({ id: d.id, ...d.data() })); render(); }, onErr));
  unsubs.push(onSnapshot(collection(db, "cust_categories"), (s) => { cats = s.docs.map((d) => d.data().name); render(); }, onErr));
});

/* ---------- حسابات ---------- */
const label = (c) => (c ? c.holder + (c.branch ? " - " + c.branch : "") : "—");
const allCats = () => [...new Set([...DEF, ...cats, ...entries.map((e) => e.category).filter(Boolean)])];
const cById = (id) => custodies.find((c) => c.id === id);
const sum = (list, k) => list.filter((e) => e.kind === k).reduce((s, e) => s + e.amount, 0);
const bal = (cid) => { const l = entries.filter((e) => e.custodyId === cid); return sum(l, "c") - sum(l, "i"); };

function render() {
  const cur = sel;
  $("custSel").innerHTML = '<option value="">كل العهد</option>' + custodies.map((c) => `<option value="${c.id}">${esc(label(c))}</option>`).join("");
  sel = cById(cur) ? cur : ""; $("custSel").value = sel;
  const list = allCats(), iv = $("iCat").value, fv = $("fCat").value;
  const opts = list.map((n) => `<option>${esc(n)}</option>`).join("");
  $("iCat").innerHTML = '<option value="">— اختر نوع المصروف —</option>' + opts + '<option value="__new">＋ نوع جديد…</option>';
  $("iCat").value = iv;
  if (pendingCat && list.includes(pendingCat)) { $("iCat").value = pendingCat; pendingCat = null; }
  $("fCat").innerHTML = '<option value="">كل الأنواع</option>' + opts + '<option value="__none">بدون نوع</option>';
  $("fCat").value = fv;

  const scope = sel ? entries.filter((e) => e.custodyId === sel) : entries;
  const tc = sum(scope, "c"), ti = sum(scope, "i"), rem = tc - ti;
  $("scopeName").textContent = "المتبقي من " + (sel ? "عهدة " + label(cById(sel)) : "كل العهد");
  $("remaining").textContent = fmt(rem);
  $("totalCustody").textContent = fmt(tc);
  $("totalSpent").textContent = fmt(ti);
  $("countInv").textContent = scope.filter((e) => e.kind === "i").length;
  $("balanceBox").className = "balance" + (rem < 0 ? " neg" : tc > 0 && rem < tc * 0.2 ? " low" : "");

  $("summary").innerHTML = custodies.length
    ? '<table><tr><th>المستلم</th><th>الفرع</th><th>العهدة</th><th>الفواتير</th><th>المتبقي</th></tr>' +
      custodies.map((c) => { const l = entries.filter((e) => e.custodyId === c.id), r = sum(l, "c") - sum(l, "i");
        return `<tr class="click" data-cid="${c.id}"><td>${esc(c.holder)}</td><td>${esc(c.branch)}</td><td>${fmt(sum(l, "c"))}</td><td>${fmt(sum(l, "i"))}</td><td class="${r < 0 ? "out" : "in"}"><b>${fmt(r)}</b></td></tr>`; }).join("") + "</table>"
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

/* ---------- اختيار وإضافة عهدة ---------- */
$("custSel").onchange = () => { sel = $("custSel").value; render(); };
$("search").oninput = render;
$("newCustBtn").onclick = () => ($("newCustCard").hidden = !$("newCustCard").hidden);
$("saveCust").onclick = async () => {
  const holder = $("nHolder").value.trim();
  if (!holder) return msg("أدخل اسم المستلم", true);
  try {
    const r = await addDoc(collection(db, "cust_custodies"), { holder, branch: $("nBranch").value.trim() });
    $("nHolder").value = ""; $("nBranch").value = ""; $("newCustCard").hidden = true;
    sel = r.id; msg("تمت إضافة العهدة، وتم اختيارها."); render();
  } catch (e) { onErr(); }
};
document.addEventListener("click", (e) => { const r = e.target.closest("tr[data-cid]"); if (r) { sel = r.dataset.cid; render(); }
  const f = e.target.closest("tr[data-fcat]"); if (f) { $("fCat").value = f.dataset.fcat; render(); $("table").scrollIntoView({ behavior: "smooth" }); } });

/* ---------- مبلغ العهدة ---------- */
const resetC = () => { editC = null; $("cAmount").value = ""; $("cNote").value = ""; $("cTitle").textContent = "إضافة مبلغ عهدة (استلام)"; $("cCancel").hidden = true; };
$("cCancel").onclick = resetC;
$("addCustody").onclick = async () => {
  const amount = +$("cAmount").value;
  if (!editC && !sel) return msg("اختر عهدة محددة أولاً من القائمة", true);
  if (!(amount > 0)) return msg("أدخل مبلغ العهدة", true);
  const data = { kind: "c", amount, date: $("cDate").value || today(), desc: $("cNote").value.trim(), by: auth.currentUser.email };
  try {
    if (editC) await updateDoc(doc(db, "cust_entries", editC), data);
    else await addDoc(collection(db, "cust_entries"), { ...data, custodyId: sel, ts: Date.now(), hasImage: false });
    msg(editC ? "تم تعديل الحركة" : "تم حفظ العهدة. المتبقي: " + fmt(bal(sel) + amount)); resetC();
  } catch (e) { onErr(); }
};

/* ---------- الفواتير ---------- */
const resetI = () => { editI = null; ["iNo", "iVendor", "iAmount", "iDesc", "iFile", "iCat"].forEach((i) => ($(i).value = "")); $("iTitle").textContent = "إضافة فاتورة"; $("addInvoice").textContent = "حفظ الفاتورة"; $("iCancel").hidden = true; };
$("iCancel").onclick = resetI;
function compress(file) {
  return new Promise((res, rej) => {
    const img = new Image(), r = new FileReader();
    r.onload = () => { img.onload = () => { const k = Math.min(1, 1000 / Math.max(img.width, img.height)), c = document.createElement("canvas");
      c.width = img.width * k; c.height = img.height * k; c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL("image/jpeg", 0.6)); };
      img.onerror = rej; img.src = r.result; };
    r.onerror = rej; r.readAsDataURL(file);
  });
}
$("addInvoice").onclick = async () => {
  const amount = +$("iAmount").value;
  if (!editI && !sel) return msg("اختر عهدة محددة أولاً من القائمة", true);
  if (!(amount > 0)) return msg("أدخل مبلغ الفاتورة", true);
  if (!$("iCat").value || $("iCat").value === "__new") return msg("اختر نوع المصروف", true);
  const data = { kind: "i", amount, category: $("iCat").value, no: $("iNo").value.trim(), date: $("iDate").value || today(), vendor: $("iVendor").value.trim(), desc: $("iDesc").value.trim(), by: auth.currentUser.email };
  const old = editI ? entries.find((x) => x.id === editI) : null;
  try {
    let id = editI;
    if (editI) await updateDoc(doc(db, "cust_entries", editI), data);
    else id = (await addDoc(collection(db, "cust_entries"), { ...data, custodyId: sel, ts: Date.now(), hasImage: false })).id;
    const f = $("iFile").files[0];
    if (f) { await setDoc(doc(db, "cust_images", id), { data: await compress(f) }); await updateDoc(doc(db, "cust_entries", id), { hasImage: true }); }
    const cid = old ? old.custodyId : sel, rem = bal(cid) - (old ? amount - old.amount : amount);
    resetI();
    msg(rem < 0 ? "تم الحفظ. تنبيه: الفواتير تجاوزت العهدة بمقدار " + fmt(-rem) : "تم الحفظ. باقي من العهدة: " + fmt(rem), rem < 0);
  } catch (e) { onErr(); }
};

/* ---------- إجراءات الصفوف ---------- */
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const en = entries.find((x) => x.id === b.dataset.id); if (!en) return;
  if (b.dataset.act === "img") {
    try { const s = await getDoc(doc(db, "cust_images", en.id)); $("modalImg").src = s.data().data; $("modal").hidden = false; } catch (x) { msg("تعذر تحميل الصورة", true); }
  } else if (b.dataset.act === "edit") {
    if (en.kind === "c") { resetC(); editC = en.id; $("cAmount").value = en.amount; $("cDate").value = en.date; $("cNote").value = en.desc || ""; $("cTitle").textContent = "تعديل حركة عهدة"; $("cCancel").hidden = false; $("cAmount").scrollIntoView({ block: "center" }); }
    else { resetI(); editI = en.id; $("iNo").value = en.no || ""; $("iDate").value = en.date; $("iVendor").value = en.vendor || ""; $("iAmount").value = en.amount; $("iDesc").value = en.desc || ""; $("iCat").value = en.category || ""; $("iTitle").textContent = "تعديل فاتورة (اختر صورة جديدة فقط لو تبغى تغيير الصورة)"; $("addInvoice").textContent = "حفظ التعديل"; $("iCancel").hidden = false; $("iAmount").scrollIntoView({ block: "center" }); }
  } else if (b.dataset.act === "del" && confirm("هل تريد حذف هذه الحركة؟")) {
    try { await deleteDoc(doc(db, "cust_entries", en.id)); if (en.hasImage) await deleteDoc(doc(db, "cust_images", en.id)); } catch (x) { onErr(); }
  }
});
$("modal").onclick = () => { $("modal").hidden = true; $("modalImg").src = ""; };

/* ---------- طباعة وتصدير ---------- */
$("printBtn").onclick = () => window.print();
$("csvBtn").onclick = () => {
  const q = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  const rows = [["التاريخ", "العهدة", "النوع", "نوع المصروف", "الرقم", "المورد", "الشرح", "مدين", "دائن", "الرصيد"]];
  lastShown.slice().reverse().forEach((r) => { const c = r.kind === "c"; rows.push([r.date, label(cById(r.custodyId)), c ? "عهدة" : "فاتورة", r.category || "", r.no || "", r.vendor || "", r.desc || "", c ? r.amount : "", c ? "" : r.amount, r.run]); });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\ufeff" + rows.map((r) => r.map(q).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
  a.download = "custody-report-" + today() + ".csv"; a.click();
};

/* ---------- أنواع المصروفات والفلاتر ---------- */
$("iCat").onchange = async () => {
  if ($("iCat").value !== "__new") return;
  const n = (prompt("اسم نوع المصروف الجديد") || "").trim();
  $("iCat").value = "";
  if (!n) return;
  if (allCats().includes(n)) { $("iCat").value = n; return; }
  pendingCat = n;
  try { await addDoc(collection(db, "cust_categories"), { name: n }); } catch (e) { pendingCat = null; onErr(); }
};
["fCat", "fFrom", "fTo"].forEach((i) => ($(i).onchange = render));
$("clearF").onclick = () => { $("fCat").value = ""; $("fFrom").value = ""; $("fTo").value = ""; render(); };
