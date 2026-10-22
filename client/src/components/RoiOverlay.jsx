import { getRoiLayout, WALL } from '../vision/roi';

/**
 * What MediaPipe is actually looking at, drawn over the stream.
 *
 * Every crop box, with the digit the classifier returned and how confident it
 * was. This is the difference between "the CV works, trust me" and being able
 * to point at the one cell that is being misread — and it is how the ROI
 * geometry gets verified against the render by eye in a second.
 */
export default function RoiOverlay({ predictions = {} }) {
  const layout = getRoiLayout();

  return (
    <svg
      viewBox={`0 0 ${WALL.width} ${WALL.height}`}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      {layout.fields.map((field) =>
        field.cells.map((cell) => {
          const p = predictions[`${cell.metric}:${cell.index}`];
          const low = p && p.score < 0.9;

          return (
            <g key={`${cell.metric}:${cell.index}`}>
              <rect
                x={cell.x - 3}
                y={cell.y - 3}
                width={cell.w + 6}
                height={cell.h + 6}
                fill="none"
                stroke={low ? '#f85149' : p ? '#3fb950' : '#58a6ff'}
                strokeWidth="2"
                strokeDasharray={p ? '0' : '5 4'}
                opacity={0.85}
              />
              {p && (
                <text
                  x={cell.x + cell.w / 2}
                  y={cell.y - 8}
                  textAnchor="middle"
                  fill={low ? '#f85149' : '#3fb950'}
                  style={{ font: '600 15px ui-monospace, monospace' }}
                >
                  {p.label === 'blank' ? '␣' : p.label}
                  <tspan opacity="0.65"> {Math.round(p.score * 100)}</tspan>
                </text>
              )}
            </g>
          );
        }),
      )}
    </svg>
  );
}
