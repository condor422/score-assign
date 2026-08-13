import { Router, type Request } from 'express';
import type { Types } from 'mongoose';
import { intakeFormSchema, reservedSlugs } from '@score-assign/shared';
import { requireAuth, requireCapability, tenantContext } from '../middleware/context.js';
import { asyncRoute, badRequest, conflict, notFound } from '../middleware/errors.js';

export const formsRouter = Router();
formsRouter.use(requireAuth);

/** Exactly one field may claim each engine-facing role. */
function assertRolesUnique(fields: { role?: string | null; label: string }[]): void {
  const seen = new Set<string>();
  for (const field of fields) {
    if (!field.role) continue;
    if (seen.has(field.role)) {
      throw badRequest(`Two fields both act as "${field.role}"; only one is allowed`);
    }
    seen.add(field.role);
  }
  for (const required of ['name', 'email', 'instruments']) {
    if (!seen.has(required)) {
      throw badRequest(`The form needs a field marked as "${required}"`);
    }
  }
}

formsRouter.get(
  '/',
  asyncRoute(async (req: Request, res) => {
    const { db } = tenantContext(req);
    const forms = await db.IntakeForm.find({}).sort({ createdAt: -1 }).lean();
    const counts = await db.IntakeResponse.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $group: { _id: '$formId', count: { $sum: 1 } } },
    ]);
    const countByForm = new Map(counts.map((c) => [String(c._id), c.count]));
    res.json(
      forms.map((f) => ({
        id: String(f._id),
        title: f.title,
        slug: f.slug,
        status: f.status,
        fieldCount: f.fields.length,
        responseCount: countByForm.get(String(f._id)) ?? 0,
        seasonId: f.seasonId ? String(f.seasonId) : null,
      })),
    );
  }),
);

formsRouter.get(
  '/:id',
  asyncRoute(async (req: Request, res) => {
    const { db } = tenantContext(req);
    const form = await db.IntakeForm.findById(req.params.id).lean();
    if (!form) throw notFound('Form not found');
    res.json({ ...form, id: String(form._id) });
  }),
);

formsRouter.post(
  '/',
  requireCapability('form.write'),
  asyncRoute(async (req: Request, res) => {
    const { db } = tenantContext(req);
    const input = intakeFormSchema.parse(req.body);
    if (reservedSlugs.has(input.slug)) throw conflict(`"${input.slug}" is reserved`);
    assertRolesUnique(input.fields);
    const created = await db.IntakeForm.create({
      ...input,
      fields: input.fields.map((f) => ({ ...f, helpText: f.helpText ?? null, role: f.role ?? null })),
    });
    res.status(201).json({ ...created.toObject(), id: String(created._id) });
  }),
);

formsRouter.put(
  '/:id',
  requireCapability('form.write'),
  asyncRoute(async (req: Request, res) => {
    const { db } = tenantContext(req);
    const input = intakeFormSchema.parse(req.body);
    assertRolesUnique(input.fields);
    const updated = await db.IntakeForm.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          ...input,
          fields: input.fields.map((f) => ({
            ...f,
            helpText: f.helpText ?? null,
            role: f.role ?? null,
          })),
        },
      },
      { new: true },
    );
    if (!updated) throw notFound('Form not found');
    res.json({ ...updated.toObject(), id: String(updated._id) });
  }),
);

/**
 * Responses are shown verbatim next to the derived projection. A raw submission
 * holds whatever the musician typed, contact details included, so this needs
 * the contact-grade capability rather than plain roster access.
 */
formsRouter.get(
  '/:id/responses',
  requireCapability('form.readResponses'),
  asyncRoute(async (req: Request, res) => {
    const { db } = tenantContext(req);
    const responses = await db.IntakeResponse.find({ formId: req.params.id })
      .sort({ submittedAt: -1 })
      .limit(500)
      .lean();
    res.json(
      responses.map((r) => ({
        id: String(r._id),
        submittedAt: r.submittedAt,
        status: r.status,
        answers: r.answers,
        normalized: r.normalized,
        musicianId: r.musicianId ? String(r.musicianId) : null,
      })),
    );
  }),
);
