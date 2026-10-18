const PATHS = {
  home: (
    <>
      <rect x="3" y="3" width="7" height="8" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="15" width="7" height="6" rx="1.5" />
    </>
  ),
  life: (
    <>
      <path d="M4 12a8 8 0 1 1 4 7" />
      <path d="M4 7v5h5" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  trend: (
    <>
      <path d="M3 18l6-6 4 3 8-9" />
      <path d="M15 6h6v6" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="7" r="3" />
      <path d="M3 21v-2a6 6 0 0 1 12 0v2" />
      <path d="M17 4a3 3 0 0 1 0 6" />
      <path d="M20 21v-2a6 6 0 0 0-3-5" />
    </>
  ),
  chat: (
    <>
      <path d="M4 5h16v12H9l-5 4V5z" />
      <path d="M8 10h8M8 13h6" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M7 3v4M17 3v4M3 10h18" />
    </>
  ),
  settings: <path d="M4 7h16M4 17h16M9 4v6M16 14v6" />,
  plug: <path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-6 6v4" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="7" />
      <path d="m16 16 5 5" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a3 3 0 1 1 4 2.9c-1.3.4-1.5 1.4-1.5 2.1" />
      <path d="M12 17h.01" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  filter: <path d="M4 6h16l-6 7v6l-4-2v-4z" />,
  check: <path d="m4 13 5 5 11-12" />,
  alert: (
    <>
      <path d="M12 3 2 21h20L12 3z" />
      <path d="M12 9v5M12 18h.01" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, large = false }: { name: IconName; large?: boolean }) {
  return (
    <svg className={`icon-sm${large ? " ic-large" : ""}`} viewBox="0 0 24 24" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
