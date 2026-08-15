import { Schema, type Connection, type Model, type Types } from 'mongoose';
import {
  discountCategories,
  discountTypes,
  planKeys,
  tenantRoles,
  tenantStatuses,
  type DiscountCategory,
  type PlanKey,
  type PlanLimits,
  type TenantRole,
  type TenantStatus,
} from '@score-assign/shared';

export interface TenantDoc {
  _id: Types.ObjectId;
  slug: string;
  name: string;
  contactEmail: string;
  timezone: string;
  dbName: string;
  status: TenantStatus;
  plan: PlanKey;
  limits: PlanLimits;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  discountCodeId: Types.ObjectId | null;
  /** Set when a code requires proof (student ID, 501c3 letter) before it applies. */
  pendingVerification: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const planLimitsSchema = new Schema<PlanLimits>(
  {
    maxParts: { type: Number, required: true },
    maxMusicians: { type: Number, required: true },
    maxSongs: { type: Number, required: true },
    maxSeats: { type: Number, required: true },
  },
  { _id: false },
);

const tenantSchema = new Schema<TenantDoc>(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true },
    contactEmail: { type: String, required: true, lowercase: true },
    timezone: { type: String, default: 'America/Phoenix' },
    dbName: { type: String, required: true },
    status: { type: String, enum: tenantStatuses, default: 'trialing', index: true },
    plan: { type: String, enum: planKeys, default: 'free' },
    limits: { type: planLimitsSchema, required: true },
    trialEndsAt: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null },
    discountCodeId: { type: Schema.Types.ObjectId, default: null },
    pendingVerification: { type: Boolean, default: false },
  },
  { timestamps: true },
);
tenantSchema.index({ status: 1, currentPeriodEnd: 1 });

export interface MembershipDoc {
  tenantId: Types.ObjectId;
  role: TenantRole;
}

export interface PlatformUserDoc {
  _id: Types.ObjectId;
  email: string;
  name: string;
  passwordHash: string;
  memberships: MembershipDoc[];
  /** Platform staff manage plans, discount codes and verification requests. */
  isPlatformAdmin: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const platformUserSchema = new Schema<PlatformUserDoc>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true },
    passwordHash: { type: String, required: true },
    memberships: [
      new Schema<MembershipDoc>(
        {
          tenantId: { type: Schema.Types.ObjectId, required: true },
          role: { type: String, enum: tenantRoles, required: true },
        },
        { _id: false },
      ),
    ],
    isPlatformAdmin: { type: Boolean, default: false },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);
platformUserSchema.index({ 'memberships.tenantId': 1 });

export interface RefreshTokenDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

const refreshTokenSchema = new Schema<RefreshTokenDoc>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    tokenHash: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
// Expired rows are useless once past expiry; let Mongo reap them.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export interface PlanDoc {
  _id: Types.ObjectId;
  key: PlanKey;
  name: string;
  priceCents: number;
  currency: string;
  interval: 'year';
  limits: PlanLimits;
  active: boolean;
}

const planSchema = new Schema<PlanDoc>({
  key: { type: String, enum: planKeys, required: true, unique: true },
  name: { type: String, required: true },
  priceCents: { type: Number, required: true },
  currency: { type: String, default: 'usd' },
  interval: { type: String, default: 'year' },
  limits: { type: planLimitsSchema, required: true },
  active: { type: Boolean, default: true },
});

export interface DiscountCodeDoc {
  _id: Types.ObjectId;
  code: string;
  label: string;
  category: DiscountCategory;
  type: 'percent' | 'fixed';
  value: number;
  appliesToPlanKeys: PlanKey[];
  maxRedemptions: number | null;
  redemptionCount: number;
  perTenantLimit: number;
  requiresVerification: boolean;
  validFrom: Date | null;
  validUntil: Date | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const discountCodeSchema = new Schema<DiscountCodeDoc>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    label: { type: String, required: true },
    category: { type: String, enum: discountCategories, required: true },
    type: { type: String, enum: discountTypes, required: true },
    value: { type: Number, required: true },
    appliesToPlanKeys: [{ type: String, enum: planKeys }],
    maxRedemptions: { type: Number, default: null },
    redemptionCount: { type: Number, default: 0 },
    perTenantLimit: { type: Number, default: 1 },
    requiresVerification: { type: Boolean, default: false },
    validFrom: { type: Date, default: null },
    validUntil: { type: Date, default: null },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export interface SubscriptionDoc {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  planKey: PlanKey;
  provider: string;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  status: string;
  discountCodeId: Types.ObjectId | null;
  listPriceCents: number;
  discountCents: number;
  amountCents: number;
  currency: string;
  trialStart: Date | null;
  trialEnd: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  canceledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const subscriptionSchema = new Schema<SubscriptionDoc>(
  {
    tenantId: { type: Schema.Types.ObjectId, required: true, index: true },
    planKey: { type: String, enum: planKeys, required: true },
    provider: { type: String, required: true },
    providerCustomerId: { type: String, default: null },
    providerSubscriptionId: { type: String, default: null },
    status: { type: String, required: true },
    discountCodeId: { type: Schema.Types.ObjectId, default: null },
    listPriceCents: { type: Number, required: true },
    discountCents: { type: Number, default: 0 },
    amountCents: { type: Number, required: true },
    currency: { type: String, default: 'usd' },
    trialStart: { type: Date, default: null },
    trialEnd: { type: Date, default: null },
    currentPeriodStart: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null },
    canceledAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export interface RedemptionDoc {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  discountCodeId: Types.ObjectId;
  createdAt: Date;
}

const redemptionSchema = new Schema<RedemptionDoc>(
  {
    tenantId: { type: Schema.Types.ObjectId, required: true },
    discountCodeId: { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
redemptionSchema.index({ tenantId: 1, discountCodeId: 1 });

export interface AuditLogDoc {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId | null;
  actorUserId: Types.ObjectId | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  meta: Record<string, unknown>;
  ip: string | null;
  createdAt: Date;
}

const auditLogSchema = new Schema<AuditLogDoc>(
  {
    tenantId: { type: Schema.Types.ObjectId, default: null, index: true },
    actorUserId: { type: Schema.Types.ObjectId, default: null },
    action: { type: String, required: true },
    targetType: { type: String, default: null },
    targetId: { type: String, default: null },
    meta: { type: Schema.Types.Mixed, default: {} },
    ip: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 730 });

export interface InviteDoc {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  email: string;
  role: TenantRole;
  tokenHash: string;
  invitedBy: Types.ObjectId;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
}

const inviteSchema = new Schema<InviteDoc>(
  {
    tenantId: { type: Schema.Types.ObjectId, required: true, index: true },
    email: { type: String, required: true, lowercase: true },
    role: { type: String, enum: tenantRoles, required: true },
    tokenHash: { type: String, required: true, index: true },
    invitedBy: { type: Schema.Types.ObjectId, required: true },
    expiresAt: { type: Date, required: true },
    acceptedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export interface PlatformModels {
  Tenant: Model<TenantDoc>;
  PlatformUser: Model<PlatformUserDoc>;
  RefreshToken: Model<RefreshTokenDoc>;
  Plan: Model<PlanDoc>;
  DiscountCode: Model<DiscountCodeDoc>;
  Subscription: Model<SubscriptionDoc>;
  Redemption: Model<RedemptionDoc>;
  AuditLog: Model<AuditLogDoc>;
  Invite: Model<InviteDoc>;
}

const cache = new WeakMap<Connection, PlatformModels>();

/** Models are bound to a connection, never registered globally. */
export function platformModels(connection: Connection): PlatformModels {
  const existing = cache.get(connection);
  if (existing) return existing;

  const models: PlatformModels = {
    Tenant: connection.model<TenantDoc>('Tenant', tenantSchema),
    PlatformUser: connection.model<PlatformUserDoc>('PlatformUser', platformUserSchema),
    RefreshToken: connection.model<RefreshTokenDoc>('RefreshToken', refreshTokenSchema),
    Plan: connection.model<PlanDoc>('Plan', planSchema),
    DiscountCode: connection.model<DiscountCodeDoc>('DiscountCode', discountCodeSchema),
    Subscription: connection.model<SubscriptionDoc>('Subscription', subscriptionSchema),
    Redemption: connection.model<RedemptionDoc>('Redemption', redemptionSchema),
    AuditLog: connection.model<AuditLogDoc>('AuditLog', auditLogSchema),
    Invite: connection.model<InviteDoc>('Invite', inviteSchema),
  };
  cache.set(connection, models);
  return models;
}
