/** Highlights normalized model tokens (e.g. "HFW2449") inside a model with separators ("DH-IPC-HFW2449S-..."). */
export function HighlightModel({ model, tokens }: { model: string; tokens: string[] }) {
  if (!tokens.length) return <>{model}</>;
  const map: number[] = [];
  let norm = "";
  for (let i = 0; i < model.length; i++) {
    const ch = model[i].toUpperCase();
    if (/[A-Z0-9]/.test(ch)) {
      norm += ch;
      map.push(i);
    }
  }
  const marks = new Array(model.length).fill(false);
  for (const t of tokens) {
    if (!t) continue;
    let from = 0;
    while (true) {
      const idx = norm.indexOf(t, from);
      if (idx === -1) break;
      for (let k = idx; k < idx + t.length; k++) {
        const start = map[k];
        const end = k + 1 < idx + t.length ? map[k + 1] : map[k] + 1;
        for (let j = start; j < end; j++) marks[j] = true;
      }
      from = idx + t.length;
    }
  }
  const out: React.ReactNode[] = [];
  let buf = "";
  let cur = marks[0];
  const flush = (key: number) => {
    if (!buf) return;
    out.push(
      cur ? (
        <mark key={key} className="rounded-[3px] bg-accent-soft px-px text-accent">
          {buf}
        </mark>
      ) : (
        buf
      ),
    );
    buf = "";
  };
  for (let i = 0; i < model.length; i++) {
    if (marks[i] !== cur) {
      flush(i);
      cur = marks[i];
    }
    buf += model[i];
  }
  flush(model.length);
  return <>{out}</>;
}
