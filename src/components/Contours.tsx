/** Líneas de contorno orgánicas de fondo: decorativas, muy tenues. */
export function Contours() {
  const lines = Array.from({ length: 7 }, (_, i) => i)
  return (
    <svg
      aria-hidden
      focusable="false"
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
      viewBox="0 0 400 800"
      preserveAspectRatio="xMidYMid slice"
    >
      <g fill="none" stroke="#b6f36b" strokeWidth="1.1" opacity="0.1">
        {lines.map((i) => (
          <path key={`t${i}`} d={`M-30 ${70 + i * 26} C 50 ${20 + i * 30}, 110 ${150 + i * 18}, 200 ${90 + i * 24} S 350 ${10 + i * 34}, 440 ${80 + i * 22}`} />
        ))}
      </g>
      <g fill="none" stroke="#b6f36b" strokeWidth="1.1" opacity="0.07">
        {lines.map((i) => (
          <path key={`b${i}`} d={`M-30 ${650 + i * 24} C 60 ${700 - i * 14}, 130 ${600 + i * 20}, 220 ${660 + i * 18} S 360 ${720 - i * 12}, 440 ${640 + i * 20}`} />
        ))}
      </g>
    </svg>
  )
}
