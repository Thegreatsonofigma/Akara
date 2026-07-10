import { CurrencyChip } from "@/components/product/CurrencyChip";
import { CURRENCIES } from "@/lib/site";

/**
 * Illustrated corridor network: five currency nodes joined by arcs with
 * energy flowing along them — a faint base line, a smoothly drifting
 * dash stream, and a dot gliding each route with eased SMIL motion.
 * Pure SVG + CSS. Collapses to a chip row on small screens; traveling
 * dots hide and dashes freeze under reduced motion.
 */

const NODES = [
  { code: "NGN", country: "Nigeria", x: 400, y: 80 },
  { code: "GHS", country: "Ghana", x: 110, y: 170 },
  { code: "RWF", country: "Rwanda", x: 690, y: 170 },
  { code: "XAF", country: "Cameroon", x: 215, y: 315 },
  { code: "KES", country: "Kenya", x: 585, y: 315 },
];

const ARCS = [
  { id: "akr-arc-1", d: "M 400 80 Q 230 80 110 170", color: "#9DFF1E", dur: "5.6s", begin: "0s" },
  { id: "akr-arc-2", d: "M 400 80 Q 570 80 690 170", color: "#E8F500", dur: "6.4s", begin: "1.1s" },
  { id: "akr-arc-3", d: "M 400 80 Q 240 230 215 315", color: "#FF2D55", dur: "7.2s", begin: "2.3s" },
  { id: "akr-arc-4", d: "M 400 80 Q 560 230 585 315", color: "#7b8cff", dur: "6.8s", begin: "0.6s" },
  { id: "akr-arc-5", d: "M 215 315 Q 400 375 585 315", color: "#ffffff", dur: "8.4s", begin: "1.8s" },
];

export function CorridorMap() {
  return (
    <>
      {/* Full map from sm upward */}
      <div
        className="relative mx-auto hidden aspect-[40/19] w-full max-w-3xl sm:block"
        role="img"
        aria-label="Corridor network connecting NGN, RWF, GHS, KES, and XAF"
      >
        <svg
          aria-hidden="true"
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 800 380"
          preserveAspectRatio="none"
          fill="none"
        >
          {ARCS.map((arc) => (
            <g key={arc.id}>
              {/* faint base route */}
              <path
                id={arc.id}
                d={arc.d}
                stroke={arc.color}
                strokeOpacity={arc.color === "#ffffff" ? 0.1 : 0.18}
                strokeWidth={1.5}
              />
              {/* drifting dash stream */}
              <path
                className="dash-flow"
                d={arc.d}
                stroke={arc.color}
                strokeOpacity={arc.color === "#ffffff" ? 0.3 : 0.6}
                strokeWidth={1.75}
                strokeLinecap="round"
              />
              {/* gliding dot with eased travel */}
              <circle
                className="motion-dot"
                r="3"
                fill={arc.color}
                opacity={arc.color === "#ffffff" ? 0.55 : 0.95}
              >
                <animateMotion
                  dur={arc.dur}
                  begin={arc.begin}
                  repeatCount="indefinite"
                  calcMode="spline"
                  keyPoints="0;1"
                  keyTimes="0;1"
                  keySplines="0.42 0 0.58 1"
                >
                  <mpath href={`#${arc.id}`} />
                </animateMotion>
              </circle>
            </g>
          ))}

          {/* calm glowing nodes — no blinking */}
          {NODES.map((node) => (
            <g key={node.code}>
              <circle
                cx={node.x}
                cy={node.y}
                r="11"
                fill="#9DFF1E"
                fillOpacity="0.12"
              />
              <circle
                cx={node.x}
                cy={node.y}
                r="5.5"
                fill="#9DFF1E"
                fillOpacity="0.25"
              />
              <circle cx={node.x} cy={node.y} r="3" fill="#9DFF1E" />
            </g>
          ))}
        </svg>

        {NODES.map((node) => (
          <div
            key={node.code}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${(node.x / 800) * 100}%`,
              top: `${(node.y / 380) * 100}%`,
            }}
          >
            <div className="-translate-y-6">
              <CurrencyChip code={node.code} country={node.country} />
            </div>
          </div>
        ))}
      </div>

      {/* Simple chip row on small screens */}
      <ul
        className="flex flex-wrap items-center justify-center gap-2.5 sm:hidden"
        aria-label="Launch currencies"
      >
        {CURRENCIES.map((c) => (
          <li key={c.code}>
            <CurrencyChip code={c.code} country={c.country} size="sm" />
          </li>
        ))}
      </ul>
    </>
  );
}
