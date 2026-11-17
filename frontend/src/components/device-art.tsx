/**
 * Clean device illustrations used until real product photos are attached.
 * Colors come from CSS variables (--art-*) so they adapt to light/dark theme.
 */

const B = "var(--art-body)";
const S = "var(--art-shade)";
const L = "var(--art-line)";
const D = "var(--art-dark)";
const G = "var(--art-glass)";
const A = "var(--accent)";

function Shadow({ cx = 80, cy = 106, rx = 46 }: { cx?: number; cy?: number; rx?: number }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={5} fill="var(--art-shadow)" />;
}

function Lens({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={D} />
      <circle cx={cx} cy={cy} r={r * 0.62} fill={G} />
      <circle cx={cx} cy={cy} r={r * 0.3} fill={D} />
      <circle cx={cx - r * 0.25} cy={cy - r * 0.28} r={r * 0.14} fill="#fff" opacity=".55" />
    </g>
  );
}

const Bullet = () => (
  <g>
    <Shadow rx={52} />
    {/* wall plate + arm */}
    <rect x="18" y="40" width="12" height="44" rx="4" fill={S} stroke={L} />
    <path d="M29 60 h18 l6 -4 v10 l-6 -2 h-18z" fill={S} stroke={L} />
    <g transform="rotate(-9 90 58)">
      {/* body */}
      <rect x="48" y="44" width="86" height="32" rx="14" fill={B} stroke={L} />
      <rect x="48" y="62" width="86" height="14" rx="7" fill={S} opacity=".55" />
      {/* sun shield */}
      <path d="M50 44 q2 -9 14 -9 h66 q10 0 12 9z" fill={B} stroke={L} />
      {/* front */}
      <ellipse cx="134" cy="60" rx="7" ry="16" fill={D} />
      <ellipse cx="135" cy="60" rx="4.5" ry="10" fill={G} />
      <circle cx="135" cy="54" r="1.3" fill={A} opacity=".8" />
      <circle cx="135" cy="66" r="1.3" fill={A} opacity=".8" />
    </g>
  </g>
);

const Dome = ({ mini = false }: { mini?: boolean }) => {
  const k = mini ? 0.82 : 1;
  return (
    <g transform={`translate(${80 - 80 * k} ${mini ? 10 : 0}) scale(${k})`}>
      <Shadow rx={50} />
      <ellipse cx="80" cy="44" rx="52" ry="12" fill={S} stroke={L} />
      <rect x="28" y="40" width="104" height="10" fill={S} />
      <ellipse cx="80" cy="40" rx="52" ry="12" fill={B} stroke={L} />
      <path d="M36 50 a44 44 0 0 0 88 0z" fill={B} stroke={L} />
      <path d="M48 50 a32 32 0 0 0 64 0z" fill={D} opacity=".92" />
      <path d="M52 52 a28 26 0 0 0 30 24" fill="none" stroke="#fff" strokeOpacity=".18" strokeWidth="3" />
      <Lens cx={80} cy={62} r={11} />
    </g>
  );
};

const Ptz = () => (
  <g>
    <Shadow rx={40} />
    <rect x="72" y="6" width="16" height="20" rx="3" fill={S} stroke={L} />
    <rect x="50" y="24" width="60" height="14" rx="7" fill={B} stroke={L} />
    <rect x="48" y="36" width="64" height="26" rx="4" fill={B} stroke={L} />
    <rect x="48" y="52" width="64" height="10" fill={S} opacity=".6" />
    <path d="M48 62 a32 32 0 0 0 64 0z" fill={D} />
    <path d="M54 64 a26 24 0 0 0 20 22" fill="none" stroke="#fff" strokeOpacity=".2" strokeWidth="3" />
    <Lens cx={80} cy={76} r={10} />
    <circle cx="62" cy="44" r="1.6" fill={A} />
  </g>
);

const Pt = () => (
  <g>
    <Shadow rx={34} />
    <ellipse cx="80" cy="96" rx="30" ry="8" fill={S} stroke={L} />
    <rect x="50" y="86" width="60" height="10" fill={S} />
    <ellipse cx="80" cy="86" rx="30" ry="8" fill={B} stroke={L} />
    <circle cx="80" cy="54" r="32" fill={B} stroke={L} />
    <path d="M48 58 a32 32 0 0 0 64 0" fill={S} opacity=".5" />
    <rect x="58" y="40" width="44" height="28" rx="14" fill={D} />
    <Lens cx={80} cy={54} r={10} />
    <circle cx="64" cy="54" r="2" fill={A} opacity=".8" />
    <circle cx="96" cy="54" r="2" fill={A} opacity=".8" />
  </g>
);

const Fisheye = () => (
  <g>
    <Shadow rx={52} />
    <ellipse cx="80" cy="66" rx="56" ry="18" fill={S} stroke={L} />
    <ellipse cx="80" cy="60" rx="56" ry="18" fill={B} stroke={L} />
    <ellipse cx="80" cy="56" rx="22" ry="10" fill={D} />
    <ellipse cx="80" cy="54" rx="12" ry="6" fill={G} />
  </g>
);

const Thermal = () => (
  <g>
    <Shadow rx={52} />
    <rect x="22" y="44" width="12" height="40" rx="4" fill={S} stroke={L} />
    <path d="M33 62 h14" stroke={L} strokeWidth="6" />
    <rect x="46" y="38" width="90" height="42" rx="8" fill={B} stroke={L} />
    <path d="M44 38 q2 -8 12 -8 h74 q8 0 10 8z" fill={B} stroke={L} />
    <rect x="128" y="42" width="10" height="34" rx="4" fill={D} />
    <circle cx="133" cy="51" r="3.5" fill="#f97316" opacity=".85" />
    <circle cx="133" cy="67" r="3.5" fill={G} />
  </g>
);

const BoxDevice = ({ ports = false }: { ports?: boolean }) => (
  <g>
    <Shadow rx={62} cy={100} />
    {/* top face */}
    <path d="M28 52 l20 -16 h92 l-20 16z" fill={B} stroke={L} />
    {/* front */}
    <rect x="18" y="52" width="104" height="36" rx="3" fill={B} stroke={L} />
    {/* side */}
    <path d="M122 52 l20 -16 v34 l-20 18z" fill={S} stroke={L} />
    {ports ? (
      <g>
        {Array.from({ length: 8 }).map((_, i) => (
          <g key={i}>
            <rect x={26 + i * 11} y="62" width="8" height="7" rx="1" fill={D} />
            <circle cx={30 + i * 11} cy="75" r="1.2" fill={i % 3 === 0 ? A : "#22c55e"} />
          </g>
        ))}
      </g>
    ) : (
      <g>
        <rect x="26" y="62" width="48" height="5" rx="2" fill={S} />
        <rect x="26" y="71" width="36" height="5" rx="2" fill={S} />
        <circle cx="100" cy="64" r="2" fill="#22c55e" />
        <circle cx="108" cy="64" r="2" fill={A} />
        <rect x="92" y="72" width="22" height="6" rx="2" fill={D} />
      </g>
    )}
  </g>
);

const Intercom = () => (
  <g>
    <Shadow rx={30} />
    <rect x="56" y="10" width="48" height="94" rx="10" fill={B} stroke={L} />
    <rect x="62" y="16" width="36" height="40" rx="6" fill={D} />
    <Lens cx={80} cy={30} r={6} />
    <rect x="68" y="44" width="24" height="3" rx="1.5" fill={G} />
    {Array.from({ length: 4 }).map((_, i) => (
      <rect key={i} x="68" y={64 + i * 5} width="24" height="2" rx="1" fill={L} />
    ))}
    <circle cx="80" cy="92" r="6" fill={S} stroke={L} />
    <circle cx="80" cy="92" r="2.4" fill={A} />
  </g>
);

const MonitorArt = () => (
  <g>
    <Shadow rx={40} />
    <rect x="20" y="14" width="120" height="74" rx="6" fill={D} />
    <rect x="25" y="19" width="110" height="64" rx="3" fill={G} />
    {[0, 1].map((r) =>
      [0, 1].map((c) => (
        <rect key={`${r}${c}`} x={27 + c * 54} y={21 + r * 31} width="52" height="29" rx="2" fill={D} opacity=".35" />
      )),
    )}
    <path d="M72 88 h16 l4 12 h-24z" fill={S} stroke={L} />
    <rect x="58" y="100" width="44" height="5" rx="2.5" fill={B} stroke={L} />
  </g>
);

const Sensor = () => (
  <g>
    <Shadow rx={34} />
    <rect x="48" y="14" width="64" height="88" rx="14" fill={B} stroke={L} />
    <path d="M56 40 a24 24 0 0 1 48 0 v8 h-48z" fill={D} opacity=".9" />
    <path d="M60 40 a20 20 0 0 1 40 0" fill="none" stroke={G} strokeWidth="2" />
    <circle cx="80" cy="74" r="3" fill={A} />
    <rect x="66" y="86" width="28" height="3" rx="1.5" fill={L} />
  </g>
);

const Reader = () => (
  <g>
    <Shadow rx={30} />
    <rect x="54" y="8" width="52" height="96" rx="8" fill={D} />
    <rect x="60" y="14" width="40" height="28" rx="4" fill={G} />
    {Array.from({ length: 12 }).map((_, i) => (
      <rect key={i} x={62 + (i % 3) * 13} y={48 + Math.floor(i / 3) * 12} width="10" height="8" rx="2" fill={B} opacity=".85" />
    ))}
    <circle cx="80" cy="28" r="7" fill="none" stroke={A} strokeWidth="2" />
  </g>
);

const RouterArt = () => (
  <g>
    <Shadow rx={56} />
    <path d="M44 40 v-28" stroke={S} strokeWidth="5" strokeLinecap="round" />
    <path d="M116 40 v-28" stroke={S} strokeWidth="5" strokeLinecap="round" />
    <path d="M28 66 l14 -22 h76 l14 22z" fill={B} stroke={L} />
    <rect x="28" y="66" width="104" height="22" rx="5" fill={S} stroke={L} />
    {Array.from({ length: 5 }).map((_, i) => (
      <circle key={i} cx={50 + i * 12} cy="77" r="2" fill={i === 0 ? A : "#22c55e"} />
    ))}
  </g>
);

const Bracket = () => (
  <g>
    <Shadow rx={44} />
    <ellipse cx="80" cy="84" rx="40" ry="12" fill={S} stroke={L} />
    <rect x="40" y="46" width="80" height="38" fill={S} />
    <path d="M40 46 v38" stroke={L} />
    <path d="M120 46 v38" stroke={L} />
    <ellipse cx="80" cy="46" rx="40" ry="12" fill={B} stroke={L} />
    {[0, 1, 2, 3].map((i) => (
      <circle key={i} cx={58 + i * 15} cy={i % 2 ? 49 : 43} r="2.2" fill={L} />
    ))}
  </g>
);

const Generic = () => (
  <g>
    <Shadow rx={44} />
    <path d="M44 38 l36 -16 l36 16 l-36 16z" fill={B} stroke={L} />
    <path d="M44 38 v42 l36 18 v-44z" fill={S} stroke={L} />
    <path d="M116 38 v42 l-36 18 v-44z" fill={B} stroke={L} />
  </g>
);

export function DeviceArt({ kind, form, className }: { kind?: string | null; form?: string | null; className?: string }) {
  let art: React.ReactNode;
  if (kind === "camera" || kind === "thermal" || !kind) {
    switch (form) {
      case "dome":
        art = <Dome />;
        break;
      case "minidome":
        art = <Dome mini />;
        break;
      case "ptz":
        art = <Ptz />;
        break;
      case "pt":
      case "cube":
        art = <Pt />;
        break;
      case "fisheye":
      case "panoramic":
        art = <Fisheye />;
        break;
      default:
        art = kind === "thermal" ? <Thermal /> : kind === "camera" ? <Bullet /> : <Generic />;
    }
  } else {
    art =
      {
        recorder: <BoxDevice />,
        switch: <BoxDevice ports />,
        network: <RouterArt />,
        intercom: <Intercom />,
        monitor: <MonitorArt />,
        alarm: <Sensor />,
        access: <Reader />,
        accessory: <Bracket />,
      }[kind] ?? <Generic />;
  }
  return (
    <svg viewBox="0 0 160 120" className={className} aria-hidden>
      {art}
    </svg>
  );
}
