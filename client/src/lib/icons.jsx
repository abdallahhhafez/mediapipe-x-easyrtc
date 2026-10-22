/**
 * Hand-rolled line icons — one consistent 24px grid, 1.6 stroke, currentColor.
 * Keeps the bundle free of an icon dependency and matches the thin-line reference art.
 */
const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

const make = (paths) =>
  function Icon({ size = 20, className = '' }) {
    return (
      <svg {...base} width={size} height={size} className={className}>
        {paths}
      </svg>
    );
  };

export const Search = make(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>);
export const Pin = make(<><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" /></>);
export const Calendar = make(<><rect x="3" y="5" width="18" height="16" rx="4" /><path d="M8 3v4M16 3v4M3 10h18" /></>);
export const Clock = make(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const ArrowRight = make(<><path d="M5 12h14M13 6l6 6-6 6" /></>);
export const ArrowLeft = make(<><path d="M19 12H5M11 18l-6-6 6-6" /></>);
export const Star = make(<><path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9 6.7 19.7l1.1-5.9L3.5 9.7l5.9-.8L12 3.5Z" /></>);
export const Sliders = make(<><path d="M4 8h10M18 8h2M4 16h4M12 16h8" /><circle cx="16" cy="8" r="2" /><circle cx="10" cy="16" r="2" /></>);
export const Video = make(<><rect x="3" y="6" width="12" height="12" rx="3" /><path d="m15 11 6-3.5v9L15 13z" /></>);
export const VideoOff = make(<><path d="M15 10.5 20 7.5v9l-3.2-1.9" /><path d="M4 8.2A1.5 1.5 0 0 1 5.5 7H12" /><path d="M15 15.5a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 4 15.5V11" /><path d="M4 4l16 16" /></>);
export const Home = make(<><path d="m4 11 8-6.5 8 6.5" /><path d="M6 10v9h12v-9" /><path d="M10 19v-5h4v5" /></>);
export const Hospital = make(<><rect x="4" y="7" width="16" height="13" rx="3" /><path d="M12 11v5M9.5 13.5h5M9 7V4h6v3" /></>);
export const Bell = make(<><path d="M18 15v-4a6 6 0 1 0-12 0v4l-1.5 3h15L18 15Z" /><path d="M10 21h4" /></>);
export const BellOff = make(<><path d="M18 15v-4a6 6 0 0 0-8.4-5.5M6.2 8.5A6 6 0 0 0 6 11v4l-1.5 3h12" /><path d="M10 21h4M4 4l16 16" /></>);
export const Megaphone = make(<><path d="M4 10.5v3a2 2 0 0 0 2 2h2l8 4.5V4L8 8.5H6a2 2 0 0 0-2 2Z" /><path d="M19 9.5a3.5 3.5 0 0 1 0 5M8 15.5V20" /></>);
export const Trash = make(<><path d="M4 7h16M9.5 7V4.5h5V7" /><path d="M6.5 7 7.5 20h9l1-13" /><path d="M10.5 11v5.5M13.5 11v5.5" /></>);
export const User = make(<><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" /></>);
export const Users = make(<><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><path d="M16 5.2a3.2 3.2 0 0 1 0 6M18 20c0-2.4-.8-4.1-2-5.2" /></>);
export const Check = make(<><path d="m5 13 4.5 4.5L19 7" /></>);
export const X = make(<><path d="M6 6l12 12M18 6 6 18" /></>);
export const Plus = make(<><path d="M12 5v14M5 12h14" /></>);
export const Chart = make(<><path d="M4 20h16" /><path d="M7 20v-6M12 20V8M17 20v-9" /></>);
export const Shield = make(<><path d="M12 3.5 5 6v6c0 4.2 2.9 7.4 7 8.5 4.1-1.1 7-4.3 7-8.5V6l-7-2.5Z" /><path d="m9.5 12 1.8 1.8 3.4-3.6" /></>);
export const Wallet = make(<><rect x="3" y="6" width="18" height="13" rx="3.5" /><path d="M3 10h18M16.5 14.5h.01" /></>);
export const Note = make(<><rect x="5" y="3.5" width="14" height="17" rx="3" /><path d="M9 8.5h6M9 12.5h6M9 16.5h3" /></>);
export const Logout = make(<><path d="M14 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 16l-4-4 4-4M6 12h9" /></>);
export const Phone = make(<><path d="M6 4h3l1.5 4-2 1.5a11 11 0 0 0 6 6L16 13l4 1.5V18a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 4 6.2 2 2 0 0 1 6 4Z" /></>);
export const Message = make(<><path d="M20 12a7.5 7.5 0 0 1-10.8 6.7L4 20l1.4-4.4A7.5 7.5 0 1 1 20 12Z" /></>);
export const Palette = make(<><path d="M12 3.5a8.5 8.5 0 1 0 0 17c1 0 1.6-.7 1.6-1.5 0-.4-.2-.8-.2-1.2 0-.7.6-1.3 1.3-1.3H16a4 4 0 0 0 4-4c0-5-3.6-9-8-9Z" /><circle cx="8" cy="10.5" r="1" /><circle cx="12" cy="8" r="1" /><circle cx="16" cy="10.5" r="1" /></>);
export const Copy = make(<><rect x="8.5" y="8.5" width="11" height="11" rx="2.5" /><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>);
export const Pencil = make(<><path d="M4 20l.9-4L16 4.9a1.6 1.6 0 0 1 2.3 0l.8.8a1.6 1.6 0 0 1 0 2.3L8 19.1z" /><path d="M14 6.9 17.1 10" /></>);
export const Share = make(<><circle cx="6" cy="12" r="2.6" /><circle cx="17.5" cy="5.5" r="2.6" /><circle cx="17.5" cy="18.5" r="2.6" /><path d="M8.4 10.7 15.1 6.8M8.4 13.3l6.7 3.9" /></>);
export const Upload = make(<><path d="M12 15V4M8 8l4-4 4 4" /><path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" /></>);
export const Download = make(<><path d="M12 4v11M8 11l4 4 4-4" /><path d="M5 19h14" /></>);
export const FileText = make(<><rect x="5" y="3" width="14" height="18" rx="2.5" /><path d="M8.5 8h7M8.5 12h7M8.5 16h4" /></>);

/* ── Specialty art for the Find Care grid ── */
export const Heart = make(<><path d="M12 20s-7-4.4-7-9.4A4.1 4.1 0 0 1 12 8a4.1 4.1 0 0 1 7 2.6c0 5-7 9.4-7 9.4Z" /><path d="M8 12h2l1-2 1.5 3.5L14 12h2" /></>);
export const Tooth = make(<><path d="M7.5 3.5C5.5 3.5 4 5.2 4 7.6c0 3.4 1.4 5 2 8.4.4 2.3.8 3.5 1.8 3.5 1.3 0 1.4-1.7 1.8-3.7.3-1.5.7-2.3 2.4-2.3s2.1.8 2.4 2.3c.4 2 .5 3.7 1.8 3.7 1 0 1.4-1.2 1.8-3.5.6-3.4 2-5 2-8.4 0-2.4-1.5-4.1-3.5-4.1-1.8 0-2.6 1-4.5 1s-2.7-1-4.5-1Z" /></>);
export const Lungs = make(<><path d="M12 3v9" /><path d="M12 8c-1.5 0-2.5 1-3 2.5S7 15 5.5 17.5c-.8 1.3.2 2.7 1.7 2.4 2-.4 3.3-1.4 3.9-2.6.5-1 .9-2.3.9-4.3" /><path d="M12 8c1.5 0 2.5 1 3 2.5s2 4.5 3.5 7c.8 1.3-.2 2.7-1.7 2.4-2-.4-3.3-1.4-3.9-2.6-.5-1-.9-2.3-.9-4.3" /></>);
export const Brain = make(<><path d="M9.5 4.5A2.5 2.5 0 0 0 7 7a2.5 2.5 0 0 0-1.5 4.5A2.6 2.6 0 0 0 7 16c0 1.7 1.3 3 3 3 .8 0 1.5-.6 1.5-1.4V6.2c0-1-.9-1.7-2-1.7Z" /><path d="M14.5 4.5A2.5 2.5 0 0 1 17 7a2.5 2.5 0 0 1 1.5 4.5A2.6 2.6 0 0 1 17 16c0 1.7-1.3 3-3 3-.8 0-1.5-.6-1.5-1.4V6.2c0-1 .9-1.7 2-1.7Z" /></>);
export const Ear = make(<><path d="M8 20c-1.5-1.5-1-3.5-2.2-5.4A6.6 6.6 0 1 1 18.5 11c0 2-1.5 2.8-2.7 3.6-1 .7-1.3 1.4-1.6 2.4-.3 1.1-1.1 1.8-2.2 1.8-1 0-1.7-.6-1.9-1.6" /><path d="M9.5 10a2.6 2.6 0 1 1 4.4 1.9" /></>);
export const Eye = make(<><path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></>);
export const Mind = make(<><circle cx="12" cy="12" r="8.5" /><path d="M8.5 13.5c1 1.4 2.1 2 3.5 2s2.5-.6 3.5-2M9.5 9.5h.01M14.5 9.5h.01" /></>);
export const Bone = make(<><path d="M8.5 15.5 15.5 8.5" /><path d="M6 13.5a2.2 2.2 0 1 1 2.6-3 2.2 2.2 0 1 1 3 2.6" /><path d="M18 10.5a2.2 2.2 0 1 1-2.6 3 2.2 2.2 0 1 1-3-2.6" /></>);
export const Nurse = make(<><path d="M8 5.5h8l-.6 3.2a3.5 3.5 0 0 1-6.8 0L8 5.5Z" /><path d="M12 3v2.5M10.5 4.2h3" /><circle cx="12" cy="12.5" r="3" /><path d="M6 20c0-2.7 2.7-4.5 6-4.5s6 1.8 6 4.5" /></>);
export const Stethoscope = make(<><path d="M6 3.5v5a4 4 0 0 0 8 0v-5" /><path d="M4.5 3.5h3M12.5 3.5h3" /><path d="M10 16.5v-4" /><path d="M10 16.5a4.5 4.5 0 0 0 9 0v-1.2" /><circle cx="19" cy="13.5" r="1.8" /></>);
export const Pill = make(<><rect x="4" y="10.5" width="16" height="8" rx="4" transform="rotate(-45 12 14.5)" /><path d="M9.5 9.5 14.5 14.5" /></>);

export const SPECIALTY_ICONS = {
  heart: Heart,
  tooth: Tooth,
  lungs: Lungs,
  brain: Brain,
  ear: Ear,
  eye: Eye,
  mind: Mind,
  bone: Bone,
  nurse: Nurse,
  stethoscope: Stethoscope,
  pill: Pill,
};

export const SERVICE_ICONS = {
  home_visit: Home,
  telehealth: Video,
  clinic_visit: Hospital,
};

/* ── Shelf art for the pharmacy aisle ── */
export const Sparkle = make(<><path d="M12 3.5 13.6 9 19 10.5 13.6 12 12 17.5 10.4 12 5 10.5 10.4 9 12 3.5Z" /><path d="M17.5 16.5 18.2 18.8 20.5 19.5 18.2 20.2 17.5 22.5 16.8 20.2 14.5 19.5 16.8 18.8 17.5 16.5Z" /></>);
export const Percent = make(<><circle cx="8" cy="8" r="2.6" /><circle cx="16" cy="16" r="2.6" /><path d="M18.5 5.5 5.5 18.5" /></>);
export const Flag = make(<><path d="M6 21V4" /><path d="M6 4.5h11l-2 3.5 2 3.5H6" /></>);
export const Flower = make(<><circle cx="12" cy="12" r="2.4" /><path d="M12 9.6c0-2.4-.9-4.1 0-5.6.9 1.5 0 3.2 0 5.6ZM12 14.4c0 2.4-.9 4.1 0 5.6.9-1.5 0-3.2 0-5.6ZM9.6 12c-2.4 0-4.1-.9-5.6 0 1.5.9 3.2 0 5.6 0ZM14.4 12c2.4 0 4.1-.9 5.6 0-1.5.9-3.2 0-5.6 0Z" /></>);
export const Gift = make(<><rect x="3.5" y="9.5" width="17" height="11" rx="2" /><path d="M3.5 13.5h17M12 9.5v11" /><path d="M12 9.5c-3.5 0-5-1-5-2.6a2 2 0 0 1 3.6-1.2L12 9.5l1.4-3.8A2 2 0 0 1 17 6.9c0 1.6-1.5 2.6-5 2.6Z" /></>);
export const Bottle = make(<><path d="M10 3.5h4v3l1.8 2.4a3 3 0 0 1 .7 1.9v8.7a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2v-8.7a3 3 0 0 1 .7-1.9L10 6.5v-3Z" /><path d="M7.5 13.5h9" /></>);
export const Baby = make(<><path d="M10.5 2.5h3M12 2.5v2.6" /><path d="M9.5 5.5h5l1.4 2.4a2 2 0 0 1-1.7 3H9.8a2 2 0 0 1-1.7-3L9.5 5.5Z" /><rect x="8" y="11" width="8" height="10.5" rx="3" /></>);
export const Thermometer = make(<><path d="M14 14.5V5.5a2 2 0 1 0-4 0v9a4 4 0 1 0 4 0Z" /><path d="M12 9.5v6.2" /></>);
export const Droplet = make(<><path d="M12 3.5s6 6.2 6 10a6 6 0 0 1-12 0c0-3.8 6-10 6-10Z" /></>);
export const Kit = make(<><rect x="3" y="7" width="18" height="13" rx="3" /><path d="M9 7V5.5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2V7" /><path d="M12 11v5M9.5 13.5h5" /></>);
export const Bolt = make(<><path d="M13.5 3 6 13.5h5L10.5 21 18 10.5h-5L13.5 3Z" /></>);
export const Sun = make(<><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" /></>);
export const Brush = make(<><path d="M14 3.5 20.5 10l-8 8-6.5-6.5 8-8Z" /><path d="M6 11.5 3.5 20.5 12.5 18" /></>);
export const Female = make(<><circle cx="12" cy="8.5" r="5" /><path d="M12 13.5v7M9 18h6" /></>);
export const Comb = make(<><path d="M4.5 6.5h15v3a5 5 0 0 1-5 5h-5a5 5 0 0 1-5-5v-3Z" /><path d="M8.5 6.5v4M12 6.5v4M15.5 6.5v4" /><path d="M12 14.5v6" /></>);
export const Glasses = make(<><circle cx="6.5" cy="14" r="3.5" /><circle cx="17.5" cy="14" r="3.5" /><path d="M10 14h4" /><path d="M3 11 5 7h3M21 11l-2-4h-3" /></>);
export const Dumbbell = make(<><path d="M4 9.5v5M7 7.5v9M17 7.5v9M20 9.5v5" /><path d="M7 12h10" /></>);
export const Leaf = make(<><path d="M20 4c0 9-5.5 13-10.5 13A4.5 4.5 0 0 1 5 12.5C5 7 10 4 20 4Z" /><path d="M14.5 9.5 4 20" /></>);
export const Cigarette = make(<><rect x="3" y="14" width="14" height="4" rx="1.2" /><path d="M13 14v4" /><path d="M19.5 14v4M20 5.5c0 2-2 2-2 4M16.5 7.5c0 1.5-1.2 1.5-1.2 3" /></>);
export const Spray = make(<><rect x="7" y="9" width="8" height="12" rx="2" /><path d="M9 9V6.5a2 2 0 0 1 2-2h2v4.5" /><path d="M17 5.5h.01M19.5 7.5h.01M17 9.5h.01M19.5 11.5h.01" /></>);
export const Paw = make(<><ellipse cx="7" cy="10" rx="1.9" ry="2.4" /><ellipse cx="12" cy="7.5" rx="1.9" ry="2.4" /><ellipse cx="17" cy="10" rx="1.9" ry="2.4" /><path d="M12 12.5c3 0 5 2 5 4.3s-2.2 2.7-5 2.7-5-.4-5-2.7 2-4.3 5-4.3Z" /></>);

/** Shelf slug art for the pharmacy grid — keys match PharmacyCategory.icon. */
export const PHARMACY_CATEGORY_ICONS = {
  sparkle: Sparkle,
  percent: Percent,
  flag: Flag,
  flower: Flower,
  gift: Gift,
  bottle: Bottle,
  baby: Baby,
  face: Mind,
  device: Stethoscope,
  thermometer: Thermometer,
  pill: Pill,
  droplet: Droplet,
  kit: Kit,
  heart: Heart,
  bolt: Bolt,
  lungs: Lungs,
  brain: Brain,
  sun: Sun,
  brush: Brush,
  eye: Eye,
  female: Female,
  comb: Comb,
  ear: Ear,
  tooth: Tooth,
  bone: Bone,
  glasses: Glasses,
  dumbbell: Dumbbell,
  leaf: Leaf,
  cigarette: Cigarette,
  spray: Spray,
  paw: Paw,
};
