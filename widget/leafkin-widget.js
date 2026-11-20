// LeafKin home screen widget for Scriptable (free iOS app: https://scriptable.app).
// The app fills in the three settings below: Settings → Home screen widget → Copy widget script.
// Shows which plants need water or food today and in the next few days.
// Tapping it can't open LeafKin: iOS doesn't let other apps open a Home Screen web app (only Safari, which has a
// separate, signed-out LeafKin). So a tap opens Scriptable, which reloads the plants and shows a preview.
// Works for small and medium widgets; keeps the last answer for when the phone is offline.

const FUNCTION_URL = "%%FUNCTION_URL%%";   // the LeafKin reminder service
const WIDGET_TOKEN = "%%WIDGET_TOKEN%%";   // your personal widget link: keep it to yourself

const GREEN = new Color("#2f5d3a"), LEAF = new Color("#7fb98a");
const BG = Color.dynamic(new Color("#f4f1e8"), new Color("#15201a"));
const TEXT = Color.dynamic(new Color("#1d2a21"), new Color("#e9efe6"));
const MUTED = Color.dynamic(new Color("#5d6b60"), new Color("#9aa89d"));

const fm = FileManager.local();
const cachePath = fm.joinPath(fm.documentsDirectory(), "leafkin-widget.json");

async function load() {
  try {
    const req = new Request(FUNCTION_URL);
    req.headers = { "x-widget-token": WIDGET_TOKEN };
    req.timeoutInterval = 15;
    const data = await req.loadJSON();
    if (data.error) return { error: data.error };
    fm.writeString(cachePath, JSON.stringify({ ...data, fetched: Date.now() }));
    return data;
  } catch (e) {
    if (fm.fileExists(cachePath)) return { ...JSON.parse(fm.readString(cachePath)), offline: true };
    return { error: "offline" };
  }
}

const what = (x) => [x.water === 0 ? "💧" : "", x.feed === 0 ? "🌱" : ""].join("");
const when = (x) => { const d = Math.min(x.water ?? 99, x.feed ?? 99); return d === 1 ? "tomorrow" : `in ${d} days`; };

function line(stack, text, opts = {}) {
  const t = stack.addText(text);
  t.font = opts.font || Font.systemFont(13);
  t.textColor = opts.color || TEXT;
  t.lineLimit = opts.lines || 1;
  t.minimumScaleFactor = 0.75;
  return t;
}

function build(data, family) {
  const w = new ListWidget();
  w.backgroundColor = BG;
  w.setPadding(12, 14, 12, 14);
  w.refreshAfterDate = new Date(Date.now() + 60 * 60 * 1000);

  const head = w.addStack(); head.centerAlignContent();
  line(head, "🌿 LeafKin", { font: Font.boldSystemFont(13), color: GREEN });
  head.addSpacer();
  if (data.offline) line(head, "offline", { font: Font.systemFont(10), color: MUTED });
  w.addSpacer(6);

  if (data.error) {
    line(w, data.error === "unknown_widget_link" ? "This widget script is out of date. Make a new one in LeafKin → Settings → Home screen widget." : "Can't reach LeafKin right now.", { color: MUTED, font: Font.systemFont(12), lines: 5 });
    w.addSpacer();
    return w;
  }

  const small = family === "small";
  const today = data.today || [], soon = data.soon || [];
  if (small) {
    // A big number (or ✓) with its label beside it, then the plants.
    const top = w.addStack(); top.centerAlignContent();
    line(top, today.length ? String(today.length) : "✓", { font: Font.boldSystemFont(today.length ? 36 : 28), color: LEAF });
    top.addSpacer(8);
    const label = top.addStack(); label.layoutVertically();
    const words = today.length ? [today.length === 1 ? "plant needs" : "plants need", "care today"] : ["Nothing to do", "today"];
    for (const x of words) line(label, x, { font: Font.semiboldSystemFont(12), color: today.length ? MUTED : LEAF });
    w.addSpacer(6);
    // Room for about 5 short lines below the top row.
    const ROWS = 5;
    if (today.length) {
      const shown = today.length <= ROWS ? today : today.slice(0, ROWS - 1);
      for (const x of shown) line(w, `${what(x)} ${x.name}`, { font: Font.systemFont(12) });
      if (today.length > shown.length) line(w, `+${today.length - shown.length} more`, { font: Font.systemFont(11), color: MUTED });
    } else if (soon.length) {
      // Grouped by day ("In 3 days" + names), as many as fit.
      let rows = ROWS, i = 0;
      while (i < soon.length && rows >= 2) {
        const day = when(soon[i]);
        line(w, day[0].toUpperCase() + day.slice(1), { font: Font.semiboldSystemFont(11), color: MUTED }); rows--;
        while (i < soon.length && when(soon[i]) === day && rows > 0) {
          const left = soon.length - i;
          if (rows === 1 && left > 1) { line(w, `+${left} more`, { font: Font.systemFont(11), color: MUTED }); rows = 0; i = soon.length; break; }
          line(w, soon[i].name, { font: Font.systemFont(12) }); rows--; i++;
        }
      }
    }
    w.addSpacer();
    return w;
  }

  const max = family === "large" ? 12 : 6;
  if (today.length) {
    line(w, "Today", { font: Font.semiboldSystemFont(12), color: MUTED });
    for (const x of today.slice(0, max)) line(w, `${what(x)}  ${x.name}`);
    if (today.length > max) line(w, `+${today.length - max} more`, { color: MUTED, font: Font.systemFont(12) });
  } else {
    line(w, "✓ Nothing to do today", { font: Font.semiboldSystemFont(14), color: LEAF });
  }
  const room = max - Math.min(today.length, max);
  if (soon.length && room > 0) {
    w.addSpacer(4);
    line(w, "Coming up", { font: Font.semiboldSystemFont(12), color: MUTED });
    for (const x of soon.slice(0, Math.max(1, room - 1))) {
      const row = w.addStack();
      line(row, x.name, { font: Font.systemFont(12) });
      row.addSpacer();
      line(row, when(x), { font: Font.systemFont(12), color: MUTED });
    }
  }
  w.addSpacer();
  return w;
}

const data = await load();
const widget = build(data, config.widgetFamily || "medium");
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium();
Script.complete();
