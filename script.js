const KEY = "custody_invoices_v1";
let data = { custody: [], invoices: [] };

try {
  const saved = localStorage.getItem(KEY);
  if (saved) data = JSON.parse(saved);
} catch (e) {}

const $ = (id) => document.getElementById(id);
const today = () => new Date().toISOString().slice(0, 10);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fmt = (v) =>
  (Math.round((+v || 0) * 100) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const esc = (t) => {
  const d = document.createElement("div");
  d.textContent = t == null ? "" : t;
  return d.innerHTML;
};
const save = () => {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
};
const showMsg = (text, err) => {
  const m = $("msg");
  m.textContent = text;
  m.className = "msg" + (err ? " err" : "");
};

$("cDate").value = today();
$("iDate").value = today();

function totals() {
  const c = data.custody.reduce((s, x) => s + x.amount, 0);
  const i = data.invoices.reduce((s, x) => s + x.amount, 0);
  return { c, i, rem: c - i };
}

function render() {
  const t = totals();
  $("remaining").textContent = fmt(t.rem);
  $("totalCustody").textContent = fmt(t.c);
  $("totalSpent").textContent = fmt(t.i);
  $("countInv").textContent = data.invoices.length;
  const box = $("balanceBox");
  box.className = "balance" + (t.rem < 0 ? " neg" : t.c > 0 && t.rem < t.c * 0.2 ? " low" : "");

  // دمج الحركات وترتيبها بالتاريخ مع حساب الرصيد الجاري
  const rows = [
    ...data.custody.map((x) => ({ ...x, kind: "c" })),
    ...data.invoices.map((x) => ({ ...x, kind: "i" })),
  ].sort((a, b) => (a.date === b.date ? a.ts - b.ts : a.date < b.date ? -1 : 1));

  let run = 0;
  rows.forEach((r) => {
    run += r.kind === "c" ? r.amount : -r.amount;
    r.run = run;
  });

  const q = $("search").value.trim().toLowerCase();
  const shown = rows
    .filter((r) =>
      !q || [r.no, r.vendor, r.desc, r.note].some((v) => (v || "").toLowerCase().includes(q))
    )
    .reverse();

  const tb = document.querySelector("#table tbody");
  if (!shown.length) {
    tb.innerHTML = '<tr><td colspan="9" class="empty">لا توجد حركات</td></tr>';
    return;
  }
  tb.innerHTML = shown
    .map((r) => {
      const isC = r.kind === "c";
      return `<tr>
        <td>${esc(r.date)}</td>
        <td>${isC ? "عهدة" : "فاتورة"}</td>
        <td>${esc(r.no)}</td>
        <td>${esc(r.vendor)}</td>
        <td class="desc">${esc(isC ? r.note : r.desc)}</td>
        <td class="in">${isC ? fmt(r.amount) : ""}</td>
        <td class="out">${isC ? "" : fmt(r.amount)}</td>
        <td><b class="${r.run < 0 ? "out" : ""}">${fmt(r.run)}</b></td>
        <td class="noprint"><button class="del" data-id="${r.id}" data-k="${r.kind}" title="حذف">✕</button></td>
      </tr>`;
    })
    .join("");
}

$("addCustody").onclick = () => {
  const amount = +$("cAmount").value;
  if (!(amount > 0)) return showMsg("أدخل مبلغ العهدة", true);
  data.custody.push({
    id: uid(), ts: Date.now(), amount,
    date: $("cDate").value || today(),
    note: $("cNote").value.trim(),
  });
  save();
  $("cAmount").value = "";
  $("cNote").value = "";
  render();
  showMsg("تم حفظ العهدة. المتبقي: " + fmt(totals().rem));
};

$("addInvoice").onclick = () => {
  const amount = +$("iAmount").value;
  if (!(amount > 0)) return showMsg("أدخل مبلغ الفاتورة", true);
  data.invoices.push({
    id: uid(), ts: Date.now(), amount,
    no: $("iNo").value.trim(),
    date: $("iDate").value || today(),
    vendor: $("iVendor").value.trim(),
    desc: $("iDesc").value.trim(),
  });
  save();
  ["iNo", "iVendor", "iAmount", "iDesc"].forEach((id) => ($(id).value = ""));
  render();
  const rem = totals().rem;
  showMsg(
    rem < 0
      ? "تم الحفظ. تنبيه: الفواتير تجاوزت العهدة بمقدار " + fmt(-rem)
      : "تم الحفظ. باقي من العهدة: " + fmt(rem),
    rem < 0
  );
};

document.addEventListener("click", (e) => {
  const b = e.target.closest(".del");
  if (!b || !confirm("هل تريد حذف هذه الحركة؟")) return;
  const list = b.dataset.k === "c" ? "custody" : "invoices";
  data[list] = data[list].filter((x) => x.id !== b.dataset.id);
  save();
  render();
});

$("search").oninput = render;
$("printBtn").onclick = () => window.print();

function download(name, content, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$("csvBtn").onclick = () => {
  const q = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  const rows = [["التاريخ", "النوع", "الرقم", "المورد", "الشرح", "مدين (عهدة)", "دائن (فاتورة)", "الرصيد"]];
  const all = [
    ...data.custody.map((x) => ({ ...x, kind: "c" })),
    ...data.invoices.map((x) => ({ ...x, kind: "i" })),
  ].sort((a, b) => (a.date === b.date ? a.ts - b.ts : a.date < b.date ? -1 : 1));
  let run = 0;
  all.forEach((r) => {
    const c = r.kind === "c";
    run += c ? r.amount : -r.amount;
    rows.push([r.date, c ? "عهدة" : "فاتورة", r.no || "", r.vendor || "", c ? r.note : r.desc, c ? r.amount : "", c ? "" : r.amount, run]);
  });
  download("custody-report-" + today() + ".csv", "\ufeff" + rows.map((r) => r.map(q).join(",")).join("\r\n"), "text/csv;charset=utf-8");
};

$("backupBtn").onclick = () =>
  download("custody-backup-" + today() + ".json", JSON.stringify(data), "application/json");

$("restoreFile").onchange = (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!Array.isArray(d.custody) || !Array.isArray(d.invoices)) throw 0;
      if (!confirm("سيتم استبدال البيانات الحالية بالنسخة الاحتياطية. متابعة؟")) return;
      data = d;
      save();
      render();
    } catch (err) {
      alert("ملف غير صالح");
    }
  };
  r.readAsText(f);
  e.target.value = "";
};

render();
