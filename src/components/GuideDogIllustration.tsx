// Flat, geometric side-profile illustration of a dog in a guide harness,
// facing right. Coat variants draw from real guide-dog breeds/colors per
// issue #15 — the point isn't to depict one specific dog, just to make the
// per-load randomization feel like it could be any of the org's dogs.
export interface GuideDogCoat {
  id: 'german-shepherd' | 'yellow-lab' | 'black-lab' | 'black-and-tan';
  label: string;
  body: string;
  ear: string;
  muzzle: string;
  leg: string;
}

export const GUIDE_DOG_COATS: GuideDogCoat[] = [
  {
    id: 'german-shepherd',
    label: 'German Shepherd',
    body: '#a9784f',
    ear: '#2b2320',
    muzzle: '#2b2320',
    leg: '#2b2320',
  },
  {
    id: 'yellow-lab',
    label: 'Yellow Lab',
    body: '#e8c27e',
    ear: '#d1a860',
    muzzle: '#d1a860',
    leg: '#e8c27e',
  },
  {
    id: 'black-lab',
    label: 'Black Lab',
    body: '#2b2b30',
    ear: '#1c1c20',
    muzzle: '#1c1c20',
    leg: '#2b2b30',
  },
  {
    id: 'black-and-tan',
    label: 'Black & Tan Lab',
    body: '#241f1d',
    ear: '#241f1d',
    muzzle: '#a9713f',
    leg: '#a9713f',
  },
];

export function randomGuideDogCoat(): GuideDogCoat {
  return GUIDE_DOG_COATS[Math.floor(Math.random() * GUIDE_DOG_COATS.length)];
}

export function GuideDogIllustration({
  coat,
  className,
}: {
  coat: GuideDogCoat;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 200 140"
      className={className}
      role="img"
      aria-label={`Illustrated ${coat.label} guide dog in harness`}
    >
      {/* tail */}
      <path
        d="M45 78 C 25 68, 20 48, 32 38"
        stroke={coat.body}
        strokeWidth="10"
        strokeLinecap="round"
        fill="none"
      />
      {/* legs */}
      <rect x="62" y="98" width="11" height="32" rx="5" fill={coat.leg} />
      <rect x="86" y="98" width="11" height="32" rx="5" fill={coat.leg} />
      <rect x="138" y="98" width="11" height="32" rx="5" fill={coat.leg} />
      <rect x="158" y="98" width="11" height="32" rx="5" fill={coat.leg} />
      {/* body */}
      <ellipse cx="105" cy="82" rx="58" ry="30" fill={coat.body} />
      {/* head */}
      <circle cx="158" cy="54" r="27" fill={coat.body} />
      {/* ear */}
      <path
        d="M148 32 C 142 20, 152 14, 162 22 C 166 30, 162 40, 152 40 Z"
        fill={coat.ear}
      />
      {/* muzzle */}
      <ellipse cx="181" cy="61" rx="15" ry="10" fill={coat.muzzle} />
      <circle cx="193" cy="59" r="4" fill="#171717" />
      <circle cx="164" cy="47" r="2.6" fill="#171717" />
      {/* harness: chest strap + back handle, always the same sky accent so
          it reads as equipment, not part of the dog */}
      <path
        d="M92 66 L138 46"
        stroke="#38bdf8"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <rect x="95" y="48" width="26" height="10" rx="4" fill="#0284c7" />
    </svg>
  );
}
