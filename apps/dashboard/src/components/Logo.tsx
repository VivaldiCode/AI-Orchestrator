export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id="aio-logo-g"
          x1="0"
          y1="0"
          x2="48"
          y2="48"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#6366f1" />
          <stop offset="1" stopColor="#4338ca" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill="url(#aio-logo-g)" />
      <line
        x1="14"
        y1="34"
        x2="32"
        y2="16"
        stroke="#fbbf24"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="33" cy="15" r="3.2" fill="#fbbf24" />
      <circle cx="14" cy="34" r="2.6" fill="#e0e7ff" />
      <circle cx="21" cy="21" r="2" fill="#c7d2fe" opacity="0.9" />
      <circle cx="28" cy="31" r="2" fill="#c7d2fe" opacity="0.7" />
    </svg>
  );
}
