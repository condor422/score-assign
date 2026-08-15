import { Router, type Request } from 'express';
import rateLimit from 'express-rate-limit';
import { intakeSubmissionSchema } from '@score-assign/shared';
import { resolvePublicTenant, tenantContext } from '../middleware/context.js';
import { asyncRoute, badRequest, forbidden, notFound } from '../middleware/errors.js';
import { assertCapacity } from '../middleware/entitlements.js';
import { validateAndNormalize } from '../services/intakeNormalizer.js';

/** Public endpoint: unauthenticated and internet-facing, so tightly limited. */
const submitLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20 });

export const publicIntakeRouter = Router();

publicIntakeRouter.use(resolvePublicTenant);

/** Form definition plus the tenant's instrument list, for rendering. */
publicIntakeRouter.get(
  '/forms/:slug',
  asyncRoute(async (req: Request, res) => {
    const { tenant, db } = tenantContext(req);
    const form = await db.IntakeForm.findOne({ slug: req.params.slug?.toLowerCase() }).lean();
    if (!form) throw notFound('Form not found');
    if (form.status !== 'open') throw forbidden('This form is not currently accepting responses');

    const now = new Date();
    if (form.opensAt && form.opensAt > now) throw forbidden('This form is not open yet');
    if (form.closesAt && form.closesAt < now) throw forbidden('This form has closed');

    const instruments = await db.Instrument.find({ active: true }).sort({ order: 1 }).lean();
    res.json({
      tenant: { name: tenant.name, slug: tenant.slug },
      form: {
        id: String(form._id),
        title: form.title,
        slug: form.slug,
        description: form.description,
        fields: [...form.fields].sort((a, b) => a.order - b.order),
      },
      instruments: instruments.map((i) => ({ id: String(i._id), name: i.name })),
    });
  }),
);

publicIntakeRouter.post(
  '/forms/:slug/responses',
  submitLimiter,
  asyncRoute(async (req: Request, res) => {
    const { tenant, db } = tenantContext(req);
    const body = intakeSubmissionSchema.parse(req.body);
    // A filled honeypot means a bot; accept silently so it learns nothing.
    if (body.honeypot) {
      res.status(202).json({ ok: true });
      return;
    }

    const form = await db.IntakeForm.findOne({ slug: req.params.slug?.toLowerCase() });
    if (!form) throw notFound('Form not found');
    if (form.status !== 'open') throw forbidden('This form is not currently accepting responses');

    const instruments = await db.Instrument.find({ active: true }).lean();
    const normalized = validateAndNormalize(form, body.answers, instruments);

    const existingMusician = await db.Musician.findOne({ email: normalized.email });
    if (!existingMusician) {
      await assertCapacity(tenant, db, 'musicians');
    }

    // The raw submission is preserved as its own immutable document; the
    // musician record is the deduplicated projection the engine consumes.
    const response = await db.IntakeResponse.create({
      formId: form._id,
      submittedAt: new Date(),
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
      answers: body.answers,
      normalized,
      status: 'new',
    });

    const musician = existingMusician
      ? await db.Musician.findOneAndUpdate(
          { _id: existingMusician._id },
          {
            $set: {
              name: normalized.name,
              phone: normalized.phone,
              instruments: normalized.instruments,
              willingToDouble: normalized.willingToDouble,
              experienceLevel: normalized.experienceLevel,
              difficultyPreference: normalized.difficultyPreference,
              active: true,
            },
            $addToSet: { sourceResponseIds: response._id },
          },
          { new: true },
        )
      : await db.Musician.create({
          name: normalized.name,
          email: normalized.email,
          phone: normalized.phone,
          instruments: normalized.instruments,
          willingToDouble: normalized.willingToDouble,
          experienceLevel: normalized.experienceLevel,
          difficultyPreference: normalized.difficultyPreference,
          sourceResponseIds: [response._id],
        });

    if (!musician) throw badRequest('Could not record this registration');

    response.musicianId = musician._id;
    response.status = 'linked';
    await response.save();

    res.status(201).json({
      ok: true,
      responseId: String(response._id),
      message:
        form.confirmationMessage ?? 'Thanks for registering. Your parts will be emailed to you.',
    });
  }),
);
