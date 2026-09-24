const base = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2,
  strokeLinecap: 'round', strokeLinejoin: 'round' }

const I = (paths) => function Icon({ size = 22, className = '' }) {
  return <svg {...base} width={size} height={size} className={className} aria-hidden="true">{paths}</svg>
}

export const IconBack = I(<path d="M15 18l-6-6 6-6" />)
export const IconPlus = I(<path d="M12 5v14M5 12h14" />)
export const IconMinus = I(<path d="M5 12h14" />)
export const IconMore = I(<><circle cx="12" cy="5" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="12" cy="19" r="1.4" /></>)
export const IconCheck = I(<path d="M20 6L9 17l-5-5" />)
export const IconX = I(<path d="M18 6L6 18M6 6l12 12" />)
export const IconCloud = I(<path d="M17.5 19H7a5 5 0 1 1 1.1-9.9A6 6 0 0 1 19.4 11 4 4 0 0 1 17.5 19z" />)
export const IconCloudOff = I(<><path d="M2 2l20 20" /><path d="M5.8 9.4A5 5 0 0 0 7 19h10.5M21 16.7A4 4 0 0 0 19.4 11 6 6 0 0 0 10 6.3" /></>)
export const IconSync = I(<><path d="M21 12a9 9 0 0 1-15.3 6.4L3 16" /><path d="M3 12A9 9 0 0 1 18.3 5.6L21 8" /><path d="M21 3v5h-5M3 21v-5h5" /></>)
export const IconTrash = I(<><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></>)
export const IconEdit = I(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>)
export const IconShare = I(<><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" /><path d="M16 6l-4-4-4 4M12 2v14" /></>)
export const IconFile = I(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></>)
export const IconUsers = I(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>)
export const IconFilm = I(<><rect x="2" y="3" width="20" height="18" rx="2" /><path d="M7 3v18M17 3v18M2 8h5M2 16h5M17 8h5M17 16h5M2 12h20" /></>)
export const IconBox = I(<><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8M12 13v8" /></>)
export const IconUser = I(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>)
export const IconSun = I(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>)
export const IconInfo = I(<><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></>)
export const IconCalendar = I(<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>)
export const IconChevron = I(<path d="M9 18l6-6-6-6" />)
