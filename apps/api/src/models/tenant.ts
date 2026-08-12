import { Schema, type Connection, type Model, type Types } from 'mongoose';
import {
  difficulties,
  experienceLevels,
  fieldRoles,
  fieldTypes,
  formStatuses,
  responseStatuses,
  type Difficulty,
  type ExperienceLevel,
  type FieldRole,
  type FieldType,
  type InstrumentPreference,
} from '@score-assign/shared';

/**
 * Every collection here lives in the tenant's own database, so documents carry
 * no tenantId: the database boundary *is* the tenant boundary.
 */

export interface InstrumentDoc {
  _id: Types.ObjectId;
  key: string;
  name: string;
  order: number;
  active: boolean;
}

const instrumentSchema = new Schema<InstrumentDoc>({
  key: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  order: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
});

export interface SeasonDoc {
  _id: Types.ObjectId;
  name: string;
  concertDate: Date | null;
  venue: string | null;
  notes: string | null;
  intakeFormId: Types.ObjectId | null;
  status: 'planning' | 'assigned' | 'archived';
  createdAt: Date;
  updatedAt: Date;
}

const seasonSchema = new Schema<SeasonDoc>(
  {
    name: { type: String, required: true },
    concertDate: { type: Date, default: null },
    venue: { type: String, default: null },
    notes: { type: String, default: null },
    intakeFormId: { type: Schema.Types.ObjectId, default: null },
    status: { type: String, enum: ['planning', 'assigned', 'archived'], default: 'planning' },
  },
  { timestamps: true },
);

export interface FormFieldDoc {
  key: string;
  label: string;
  helpText: string | null;
  type: FieldType;
  role: FieldRole | null;
  required: boolean;
  options: { value: string; label: string }[];
  order: number;
}

export interface IntakeFormDoc {
  _id: Types.ObjectId;
  seasonId: Types.ObjectId | null;
  title: string;
  slug: string;
  description: string | null;
  confirmationMessage: string | null;
  status: 'draft' | 'open' | 'closed';
  opensAt: Date | null;
  closesAt: Date | null;
  fields: FormFieldDoc[];
  createdAt: Date;
  updatedAt: Date;
}

const formFieldSubSchema = new Schema<FormFieldDoc>(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    helpText: { type: String, default: null },
    type: { type: String, enum: fieldTypes, required: true },
    role: { type: String, enum: fieldRoles, default: null },
    required: { type: Boolean, default: false },
    options: [
      new Schema({ value: { type: String, required: true }, label: { type: String, required: true } }, { _id: false }),
    ],
    order: { type: Number, default: 0 },
  },
  { _id: false },
);

const intakeFormSchema = new Schema<IntakeFormDoc>(
  {
    seasonId: { type: Schema.Types.ObjectId, default: null, index: true },
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    description: { type: String, default: null },
    confirmationMessage: { type: String, default: null },
    status: { type: String, enum: formStatuses, default: 'draft' },
    opensAt: { type: Date, default: null },
    closesAt: { type: Date, default: null },
    fields: { type: [formFieldSubSchema], required: true },
  },
  { timestamps: true },
);

export interface IntakeResponseDoc {
  _id: Types.ObjectId;
  formId: Types.ObjectId;
  submittedAt: Date;
  ip: string | null;
  userAgent: string | null;
  /** Verbatim submission. Never rewritten -- it is the musician's own record. */
  answers: Record<string, unknown>;
  normalized: {
    name: string;
    email: string;
    phone: string | null;
    instruments: InstrumentPreference[];
    willingToDouble: boolean | null;
    experienceLevel: ExperienceLevel | null;
    difficultyPreference: Difficulty | null;
    notes: string | null;
  };
  musicianId: Types.ObjectId | null;
  status: 'new' | 'linked' | 'rejected' | 'withdrawn';
}

const instrumentPreferenceSubSchema = new Schema<InstrumentPreference>(
  {
    instrumentId: { type: String, required: true },
    rank: { type: Number, required: true },
  },
  { _id: false },
);

const intakeResponseSchema = new Schema<IntakeResponseDoc>({
  formId: { type: Schema.Types.ObjectId, required: true, index: true },
  submittedAt: { type: Date, default: () => new Date() },
  ip: { type: String, default: null },
  userAgent: { type: String, default: null },
  answers: { type: Schema.Types.Mixed, required: true },
  normalized: {
    name: { type: String, required: true },
    email: { type: String, required: true, lowercase: true },
    phone: { type: String, default: null },
    instruments: { type: [instrumentPreferenceSubSchema], default: [] },
    willingToDouble: { type: Boolean, default: null },
    experienceLevel: { type: String, enum: experienceLevels, default: null },
    difficultyPreference: { type: String, enum: difficulties, default: null },
    notes: { type: String, default: null },
  },
  musicianId: { type: Schema.Types.ObjectId, default: null },
  status: { type: String, enum: responseStatuses, default: 'new' },
});
intakeResponseSchema.index({ formId: 1, submittedAt: -1 });
intakeResponseSchema.index({ 'normalized.email': 1 });

export interface MusicianDoc {
  _id: Types.ObjectId;
  name: string;
  email: string;
  phone: string | null;
  instruments: InstrumentPreference[];
  willingToDouble: boolean | null;
  experienceLevel: ExperienceLevel | null;
  difficultyPreference: Difficulty | null;
  maxAssignments: number | null;
  active: boolean;
  sourceResponseIds: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const musicianSchema = new Schema<MusicianDoc>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, default: null },
    instruments: { type: [instrumentPreferenceSubSchema], default: [] },
    willingToDouble: { type: Boolean, default: null },
    experienceLevel: { type: String, enum: experienceLevels, default: null },
    difficultyPreference: { type: String, enum: difficulties, default: null },
    maxAssignments: { type: Number, default: null },
    active: { type: Boolean, default: true },
    sourceResponseIds: [{ type: Schema.Types.ObjectId }],
  },
  { timestamps: true },
);

export interface SongDoc {
  _id: Types.ObjectId;
  seasonId: Types.ObjectId;
  title: string;
  composer: string | null;
  arranger: string | null;
  order: number;
  notes: string | null;
}

const songSchema = new Schema<SongDoc>({
  seasonId: { type: Schema.Types.ObjectId, required: true, index: true },
  title: { type: String, required: true },
  composer: { type: String, default: null },
  arranger: { type: String, default: null },
  order: { type: Number, default: 0 },
  notes: { type: String, default: null },
});

export interface PartDoc {
  _id: Types.ObjectId;
  seasonId: Types.ObjectId;
  songId: Types.ObjectId;
  instrumentId: Types.ObjectId;
  partNumber: number;
  difficulty: Difficulty;
  minPlayers: number;
  maxPlayers: number;
  notes: string | null;
  order: number;
}

const partSchema = new Schema<PartDoc>({
  seasonId: { type: Schema.Types.ObjectId, required: true, index: true },
  songId: { type: Schema.Types.ObjectId, required: true },
  instrumentId: { type: Schema.Types.ObjectId, required: true },
  partNumber: { type: Number, required: true },
  difficulty: { type: String, enum: difficulties, default: 'moderate' },
  minPlayers: { type: Number, default: 1 },
  maxPlayers: { type: Number, default: 1 },
  notes: { type: String, default: null },
  order: { type: Number, default: 0 },
});
// One document per distinct musical part: "song / instrument / part number".
partSchema.index({ songId: 1, instrumentId: 1, partNumber: 1 }, { unique: true });
partSchema.index({ seasonId: 1, order: 1 });

export interface AssignmentRunDoc {
  _id: Types.ObjectId;
  seasonId: Types.ObjectId;
  triggeredBy: string;
  startedAt: Date;
  finishedAt: Date | null;
  params: Record<string, unknown>;
  stats: Record<string, number>;
  warnings: { code: string; message: string; partId?: string; musicianId?: string }[];
  status: 'running' | 'succeeded' | 'failed';
  /** Assignments as they were before the run, enabling one-click revert. */
  snapshotBefore: {
    partId: Types.ObjectId;
    musicianId: Types.ObjectId;
    instrumentId: Types.ObjectId;
    locked: boolean;
  }[];
}

const runWarningSchema = new Schema<AssignmentRunDoc['warnings'][number]>(
  {
    code: { type: String, required: true },
    message: { type: String, required: true },
    partId: { type: String },
    musicianId: { type: String },
  },
  { _id: false },
);

const runSnapshotSchema = new Schema<AssignmentRunDoc['snapshotBefore'][number]>(
  {
    partId: { type: Schema.Types.ObjectId, required: true },
    musicianId: { type: Schema.Types.ObjectId, required: true },
    instrumentId: { type: Schema.Types.ObjectId, required: true },
    locked: { type: Boolean, default: false },
  },
  { _id: false },
);

const assignmentRunSchema = new Schema<AssignmentRunDoc>({
  seasonId: { type: Schema.Types.ObjectId, required: true, index: true },
  triggeredBy: { type: String, required: true },
  startedAt: { type: Date, default: () => new Date() },
  finishedAt: { type: Date, default: null },
  params: { type: Schema.Types.Mixed, default: {} },
  stats: { type: Schema.Types.Mixed, default: {} },
  warnings: { type: [runWarningSchema], default: [] },
  status: { type: String, enum: ['running', 'succeeded', 'failed'], default: 'running' },
  snapshotBefore: { type: [runSnapshotSchema], default: [] },
});

export interface AssignmentDoc {
  _id: Types.ObjectId;
  seasonId: Types.ObjectId;
  partId: Types.ObjectId;
  musicianId: Types.ObjectId;
  instrumentId: Types.ObjectId;
  runId: Types.ObjectId | null;
  source: 'auto' | 'manual';
  /** Locked assignments survive re-runs untouched. */
  locked: boolean;
  confirmation: {
    status: 'pending' | 'accepted' | 'declined';
    respondedAt: Date | null;
    note: string | null;
  };
  createdAt: Date;
  updatedAt: Date;
}

const assignmentSchema = new Schema<AssignmentDoc>(
  {
    seasonId: { type: Schema.Types.ObjectId, required: true, index: true },
    partId: { type: Schema.Types.ObjectId, required: true },
    musicianId: { type: Schema.Types.ObjectId, required: true },
    instrumentId: { type: Schema.Types.ObjectId, required: true },
    runId: { type: Schema.Types.ObjectId, default: null },
    source: { type: String, enum: ['auto', 'manual'], default: 'auto' },
    locked: { type: Boolean, default: false },
    confirmation: {
      status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },
      respondedAt: { type: Date, default: null },
      note: { type: String, default: null },
    },
  },
  { timestamps: true },
);
// A musician cannot hold the same part twice.
assignmentSchema.index({ partId: 1, musicianId: 1 }, { unique: true });
assignmentSchema.index({ seasonId: 1, musicianId: 1 });

export interface MusicianLoginTokenDoc {
  _id: Types.ObjectId;
  musicianId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

const musicianLoginTokenSchema = new Schema<MusicianLoginTokenDoc>(
  {
    musicianId: { type: Schema.Types.ObjectId, required: true, index: true },
    tokenHash: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
musicianLoginTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export interface TenantModels {
  Instrument: Model<InstrumentDoc>;
  Season: Model<SeasonDoc>;
  IntakeForm: Model<IntakeFormDoc>;
  IntakeResponse: Model<IntakeResponseDoc>;
  Musician: Model<MusicianDoc>;
  Song: Model<SongDoc>;
  Part: Model<PartDoc>;
  AssignmentRun: Model<AssignmentRunDoc>;
  Assignment: Model<AssignmentDoc>;
  MusicianLoginToken: Model<MusicianLoginTokenDoc>;
}

const cache = new WeakMap<Connection, TenantModels>();

/**
 * Obtains the tenant models bound to one tenant database. Callers only ever
 * receive this from the tenant middleware, which is what makes cross-tenant
 * reads structurally impossible rather than merely discouraged.
 */
export function tenantModels(connection: Connection): TenantModels {
  const existing = cache.get(connection);
  if (existing) return existing;

  const models: TenantModels = {
    Instrument: connection.model<InstrumentDoc>('Instrument', instrumentSchema),
    Season: connection.model<SeasonDoc>('Season', seasonSchema),
    IntakeForm: connection.model<IntakeFormDoc>('IntakeForm', intakeFormSchema),
    IntakeResponse: connection.model<IntakeResponseDoc>('IntakeResponse', intakeResponseSchema),
    Musician: connection.model<MusicianDoc>('Musician', musicianSchema),
    Song: connection.model<SongDoc>('Song', songSchema),
    Part: connection.model<PartDoc>('Part', partSchema),
    AssignmentRun: connection.model<AssignmentRunDoc>('AssignmentRun', assignmentRunSchema),
    Assignment: connection.model<AssignmentDoc>('Assignment', assignmentSchema),
    MusicianLoginToken: connection.model<MusicianLoginTokenDoc>(
      'MusicianLoginToken',
      musicianLoginTokenSchema,
    ),
  };
  cache.set(connection, models);
  return models;
}
