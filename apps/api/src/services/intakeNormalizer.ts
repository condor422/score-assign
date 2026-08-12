import {
  difficultySchema,
  experienceLevelSchema,
  type Difficulty,
  type ExperienceLevel,
  type FieldRole,
  type FormField,
  type InstrumentPreference,
} from '@score-assign/shared';
import { badRequest } from '../middleware/errors.js';
import type { IntakeFormDoc, InstrumentDoc } from '../models/tenant.js';

export interface NormalizedIntake {
  name: string;
  email: string;
  phone: string | null;
  instruments: InstrumentPreference[];
  willingToDouble: boolean | null;
  experienceLevel: ExperienceLevel | null;
  difficultyPreference: Difficulty | null;
  notes: string | null;
}

function asString(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function truthy(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  const text = asString(value)?.toLowerCase();
  if (!text) return null;
  if (['yes', 'true', '1'].includes(text)) return true;
  if (['no', 'false', '0'].includes(text)) return false;
  return null;
}

/**
 * Validates a submission against its form definition and derives the fields
 * the assignment engine needs. The raw answers are stored untouched alongside
 * this projection.
 */
export function validateAndNormalize(
  form: Pick<IntakeFormDoc, 'fields'>,
  answers: Record<string, unknown>,
  instruments: Pick<InstrumentDoc, '_id' | 'name'>[],
): NormalizedIntake {
  const fields = [...form.fields].sort((a, b) => a.order - b.order);
  const known = new Set(fields.map((f) => f.key));
  for (const key of Object.keys(answers)) {
    if (!known.has(key)) throw badRequest(`Unknown field "${key}"`);
  }

  for (const field of fields) {
    const value = answers[field.key];
    const empty =
      value === undefined ||
      value === null ||
      value === '' ||
      (Array.isArray(value) && value.length === 0);
    if (field.required && empty) throw badRequest(`"${field.label}" is required`);
    if (empty) continue;
    assertFieldShape(field, value);
  }

  const byRole = new Map<FieldRole, string>();
  for (const field of fields) {
    if (field.role) byRole.set(field.role, field.key);
  }
  const read = (role: FieldRole): unknown => {
    const key = byRole.get(role);
    return key === undefined ? undefined : answers[key];
  };

  const name = asString(read('name'));
  const email = asString(read('email'))?.toLowerCase() ?? null;
  if (!name) throw badRequest('A name field is required on this form');
  if (!email) throw badRequest('An email field is required on this form');

  const validIds = new Set(instruments.map((i) => String(i._id)));
  const ranked = normalizeInstruments(read('instruments'), validIds);
  if (ranked.length === 0) throw badRequest('Select at least one instrument you can play');

  const experienceRaw = asString(read('experience'));
  const difficultyRaw = asString(read('difficulty'));

  return {
    name,
    email,
    phone: asString(read('phone')),
    instruments: ranked,
    willingToDouble: ranked.length > 1 ? truthy(read('doubling')) : null,
    experienceLevel: experienceLevelSchema.safeParse(experienceRaw).data ?? null,
    difficultyPreference: difficultySchema.safeParse(difficultyRaw).data ?? null,
    notes: asString(read('notes')),
  };
}

function assertFieldShape(field: FormField | IntakeFormDoc['fields'][number], value: unknown): void {
  switch (field.type) {
    case 'checkbox':
    case 'instrument_ranking':
      if (!Array.isArray(value)) throw badRequest(`"${field.label}" expects a list`);
      break;
    case 'boolean':
      if (truthy(value) === null) throw badRequest(`"${field.label}" expects yes or no`);
      break;
    case 'radio': {
      const allowed = field.options.map((o) => o.value);
      if (allowed.length > 0 && !allowed.includes(String(value))) {
        throw badRequest(`"${field.label}" has an unexpected answer`);
      }
      break;
    }
    case 'email':
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(value))) {
        throw badRequest(`"${field.label}" must be a valid email address`);
      }
      break;
    default:
      if (typeof value !== 'string' && typeof value !== 'number') {
        throw badRequest(`"${field.label}" expects text`);
      }
  }
}

/**
 * The ranking field arrives as an ordered array of instrument ids (drag order,
 * most preferred first). A plain checkbox list is accepted too, in which case
 * selection order becomes the ranking.
 */
function normalizeInstruments(value: unknown, validIds: Set<string>): InstrumentPreference[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: InstrumentPreference[] = [];
  for (const entry of value) {
    const id =
      typeof entry === 'string'
        ? entry
        : typeof entry === 'object' && entry !== null
          ? asString((entry as { instrumentId?: unknown }).instrumentId)
          : null;
    if (!id) continue;
    if (!validIds.has(id)) throw badRequest('Unknown instrument selected');
    if (seen.has(id)) continue;
    seen.add(id);
    result.push({ instrumentId: id, rank: result.length + 1 });
  }
  return result;
}
