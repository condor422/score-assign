export interface SessionResponse {
  accessToken: string;
  user: { id: string; name: string; email: string; role: 'owner' | 'admin' | 'director' | 'viewer' };
  tenant: {
    id: string;
    slug: string;
    name: string;
    status: string;
    plan: 'free' | 'annual';
    trialEndsAt: string | null;
    trialExpired: boolean;
    limits: { maxParts: number; maxMusicians: number; maxSongs: number; maxSeats: number };
  };
}

export interface Instrument {
  id: string;
  name: string;
  key?: string;
  active?: boolean;
}

export interface Season {
  id: string;
  name: string;
  status: string;
  concertDate: string | null;
  venue: string | null;
  intakeFormId: string | null;
}

export interface Song {
  id: string;
  title: string;
  composer?: string | null;
  order: number;
}

export interface BoardAssignment {
  id: string;
  musicianId: string;
  musicianName: string;
  musicianEmail: string | null;
  source: 'auto' | 'manual';
  locked: boolean;
  confirmation: 'pending' | 'accepted' | 'declined';
}

export interface BoardPart {
  id: string;
  songId: string;
  songTitle: string;
  instrumentId: string;
  instrumentName: string;
  partNumber: number;
  partLabel: string;
  difficulty: 'easier' | 'moderate' | 'challenging';
  minPlayers: number;
  maxPlayers: number;
  assignments: BoardAssignment[];
}

export interface RunWarning {
  code: string;
  message: string;
  partId?: string;
  musicianId?: string;
}

export interface RunStats {
  musiciansConsidered: number;
  musiciansAssigned: number;
  partsTotal: number;
  partsFilled: number;
  partsUnfilled: number;
  assignmentsCreated: number;
  minAssignmentsPerMusician: number;
  maxAssignmentsPerMusician: number;
  avgAssignmentsPerMusician: number;
  topPreferenceSatisfiedPct: number;
}

export interface Board {
  songs: Song[];
  instruments: Instrument[];
  parts: BoardPart[];
  unassigned: {
    id: string;
    name: string;
    instruments: { instrumentId: string; rank: number }[];
    experienceLevel: string | null;
  }[];
  lastRun: {
    id: string;
    startedAt: string;
    status: string;
    stats: RunStats;
    warnings: RunWarning[];
  } | null;
}

export interface Musician {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  instruments: { instrumentId: string; rank: number }[];
  willingToDouble: boolean | null;
  experienceLevel: string | null;
  difficultyPreference: string | null;
  maxAssignments: number | null;
  active: boolean;
}

export interface FormSummary {
  id: string;
  title: string;
  slug: string;
  status: 'draft' | 'open' | 'closed';
  fieldCount: number;
  responseCount: number;
  seasonId: string | null;
}

export interface PublicFormField {
  key: string;
  label: string;
  helpText: string | null;
  type:
    | 'text'
    | 'longtext'
    | 'email'
    | 'phone'
    | 'radio'
    | 'checkbox'
    | 'instrument_ranking'
    | 'boolean';
  role: string | null;
  required: boolean;
  options: { value: string; label: string }[];
  order: number;
}

export interface PublicForm {
  tenant: { name: string; slug: string };
  form: {
    id: string;
    title: string;
    slug: string;
    description: string | null;
    fields: PublicFormField[];
  };
  instruments: Instrument[];
}

export interface Usage {
  usage: { parts: number; musicians: number; songs: number };
  limits: { maxParts: number; maxMusicians: number; maxSongs: number; maxSeats: number };
  plan: string;
  status: string;
}

export interface PlansResponse {
  plans: { key: string; name: string; priceCents: number; interval: string; limits: Usage['limits'] }[];
  current: {
    plan: string;
    status: string;
    trialEndsAt: string | null;
    trialExpired: boolean;
    currentPeriodEnd: string | null;
    limits: Usage['limits'];
  };
}

export interface Quote {
  listPriceCents: number;
  discountCents: number;
  totalCents: number;
  code?: string;
  label?: string;
  requiresVerification?: boolean;
}

export interface MyParts {
  tenant: { name: string; slug: string };
  musician: { id: string; name: string; email: string };
  assignments: {
    id: string;
    seasonName: string | null;
    songTitle: string;
    instrumentName: string;
    partLabel: string;
    confirmation: 'pending' | 'accepted' | 'declined';
  }[];
}
