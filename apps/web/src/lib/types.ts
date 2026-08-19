export type TenantRole = 'owner' | 'admin' | 'director' | 'section_leader' | 'viewer';

export type Capability =
  | 'roster.read'
  | 'roster.readContact'
  | 'roster.write'
  | 'program.write'
  | 'assignment.run'
  | 'assignment.write'
  | 'assignment.notify'
  | 'form.write'
  | 'form.readResponses'
  | 'billing.manage'
  | 'team.manage'
  | 'settings.manage';

/** Mirrors the API sentinel for an uncapped limit. */
export const UNLIMITED = 1_000_000;

export type PlanKey = 'free' | 'monthly' | 'annual';
export type PaidPlanKey = 'monthly' | 'annual';
export type BillingInterval = 'month' | 'year';

export const roleLabels: Record<TenantRole, string> = {
  owner: 'Owner',
  admin: 'Administrator',
  director: 'Director',
  section_leader: 'Section leader',
  viewer: 'Viewer',
};

export type ExperienceLevel =
  | 'intermediate'
  | 'advanced'
  | 'collegiate'
  | 'graduate_professional';

export type Difficulty = 'easier' | 'moderate' | 'challenging';

export const experienceLevelLabels: Record<ExperienceLevel, string> = {
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  collegiate: 'Collegiate',
  graduate_professional: 'Graduate / professional',
};

export const difficultyLabels: Record<Difficulty, string> = {
  easier: 'Easier',
  moderate: 'Moderate',
  challenging: 'Challenging',
};

export interface SessionResponse {
  accessToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: TenantRole;
    capabilities: Capability[];
    isPlatformAdmin: boolean;
  };
  tenant: {
    id: string;
    slug: string;
    name: string;
    status: string;
    plan: PlanKey;
    trialEndsAt: string | null;
    trialExpired: boolean;
    limits: { maxParts: number; maxMusicians: number; maxSongs: number; maxSeats: number };
  };
}

export interface Instrument {
  id: string;
  name: string;
  key?: string;
  order?: number;
  active?: boolean;
}

export interface Organization {
  id: string;
  slug: string;
  name: string;
  contactEmail: string;
  timezone: string;
  plan: PlanKey;
  status: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  limits: { maxParts: number; maxMusicians: number; maxSongs: number; maxSeats: number };
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
  /** Present only for callers holding roster.readContact. */
  musicianEmail?: string | null;
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
  /** Redacted server-side unless the caller holds roster.readContact. */
  email?: string;
  phone?: string | null;
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
  plans: {
    key: PlanKey;
    name: string;
    priceCents: number;
    interval: BillingInterval;
    limits: Usage['limits'];
  }[];
  current: {
    plan: PlanKey;
    status: string;
    trialEndsAt: string | null;
    trialExpired: boolean;
    currentPeriodEnd: string | null;
    limits: Usage['limits'];
  };
}

export interface RosterPart {
  assignmentId: string;
  partId: string;
  instrumentId: string;
  songTitle: string;
  instrumentName: string;
  partLabel: string;
  difficulty: 'easier' | 'moderate' | 'challenging';
  locked: boolean;
  confirmation: 'pending' | 'accepted' | 'declined';
}

export interface RosterMusician {
  id: string;
  name: string;
  sections: { instrumentId: string; instrumentName: string; rank: number }[];
  parts: RosterPart[];
  partCount: number;
  willingToDouble: boolean | null;
  experienceLevel: string | null;
  difficultyPreference: string | null;
  maxAssignments: number | null;
  active: boolean;
  email?: string;
  phone?: string | null;
}

export interface Roster {
  includesContact: boolean;
  sectionScope: string[] | null;
  instruments: Instrument[];
  musicians: RosterMusician[];
}

export interface PlatformMetrics {
  tenantsByStatus: Record<string, number>;
  tenantsByPlan: Record<string, number>;
  pendingVerification: number;
  activeCodes: number;
}

export interface PlatformTenant {
  id: string;
  slug: string;
  name: string;
  contactEmail: string;
  status: string;
  suspendedAt: string | null;
  suspensionReason: string | null;
  plan: PlanKey;
  interval: BillingInterval;
  seats: number;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  pendingVerification: boolean;
  createdAt: string;
  discountCode: { code: string; label: string; category: string } | null;
}

export interface PlatformDiscountCode {
  id: string;
  code: string;
  label: string;
  category: string;
  type: 'percent' | 'fixed';
  value: number;
  appliesToPlanKeys: PlanKey[];
  maxRedemptions: number | null;
  perTenantLimit: number;
  redemptionCount: number;
  requiresVerification: boolean;
  validFrom: string | null;
  validUntil: string | null;
  active: boolean;
}

export interface Quote {
  planKey: PaidPlanKey;
  interval: BillingInterval;
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
    difficulty: 'easier' | 'moderate' | 'challenging';
    confirmation: 'pending' | 'accepted' | 'declined';
    respondedAt: string | null;
    note: string | null;
  }[];
}

export interface MusicianProfile {
  tenant: { name: string; slug: string };
  musician: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    willingToDouble: boolean | null;
    experienceLevel: string | null;
    difficultyPreference: string | null;
    instruments: { instrumentId: string; instrumentName: string; rank: number }[];
  };
}
