import { Router, type Request } from 'express';
import rateLimit from 'express-rate-limit';
import { Types } from 'mongoose';
import {
  confirmAssignmentSchema,
  musicianLoginRequestSchema,
  musicianTokenSchema,
  ordinalPartLabel,
} from '@score-assign/shared';
import { requireMusician, resolvePublicTenant, tenantContext } from '../middleware/context.js';
import { asyncRoute, notFound, unauthorized } from '../middleware/errors.js';
import { emailProvider, magicLinkEmail } from '../services/email.js';
import { createOpaqueToken, hashToken, signMusicianToken } from '../services/tokens.js';
import { tenantOrigin } from '../services/urls.js';

const linkLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10 });

/**
 * Musicians sign in with an emailed one-time link rather than a password:
 * they interact with the app once or twice per season, so there is no reason
 * to make them hold a credential.
 */
export const musicianAuthRouter = Router();
musicianAuthRouter.use(resolvePublicTenant);

musicianAuthRouter.post(
  '/request-link',
  linkLimiter,
  asyncRoute(async (req: Request, res) => {
    const { tenant, db } = tenantContext(req);
    const input = musicianLoginRequestSchema.parse(req.body);
    const musician = await db.Musician.findOne({ email: input.email });

    // Always reports success so the endpoint cannot be used to test whether an
    // address is registered with a choir.
    if (musician) {
      const { token, hash } = createOpaqueToken();
      await db.MusicianLoginToken.create({
        musicianId: musician._id,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });
      await emailProvider().send(
        magicLinkEmail({ to: musician.email, origin: tenantOrigin(req, tenant.slug), token }),
      );
    }

    res.status(202).json({ ok: true });
  }),
);

musicianAuthRouter.post(
  '/verify',
  linkLimiter,
  asyncRoute(async (req: Request, res) => {
    const { tenant, db } = tenantContext(req);
    const input = musicianTokenSchema.parse(req.body);
    const record = await db.MusicianLoginToken.findOne({ tokenHash: hashToken(input.token) });
    if (!record || record.usedAt || record.expiresAt <= new Date()) {
      throw unauthorized('That sign-in link is no longer valid');
    }
    record.usedAt = new Date();
    await record.save();

    const musician = await db.Musician.findById(record.musicianId);
    if (!musician) throw unauthorized('That sign-in link is no longer valid');

    res.json({
      accessToken: signMusicianToken({
        sub: String(musician._id),
        tenantId: String(tenant._id),
        scope: 'musician',
      }),
      musician: { id: String(musician._id), name: musician.name, email: musician.email },
      tenant: { name: tenant.name, slug: tenant.slug },
    });
  }),
);

export const musicianPortalRouter = Router();
musicianPortalRouter.use(requireMusician);

/** A musician's own record. The only place contact details are ever returned. */
musicianPortalRouter.get(
  '/profile',
  asyncRoute(async (req: Request, res) => {
    const { tenant, db } = tenantContext(req);
    const musicianId = new Types.ObjectId(req.musicianAuth!.musicianId);
    const [musician, instruments] = await Promise.all([
      db.Musician.findById(musicianId).lean(),
      db.Instrument.find({}).lean(),
    ]);
    if (!musician) throw notFound('Musician not found');
    const instrumentById = new Map(instruments.map((i) => [String(i._id), i]));

    res.json({
      tenant: { name: tenant.name, slug: tenant.slug },
      musician: {
        id: String(musician._id),
        name: musician.name,
        email: musician.email,
        phone: musician.phone,
        willingToDouble: musician.willingToDouble,
        experienceLevel: musician.experienceLevel,
        difficultyPreference: musician.difficultyPreference,
        instruments: musician.instruments
          .slice()
          .sort((a, b) => a.rank - b.rank)
          .map((pref) => ({
            instrumentId: String(pref.instrumentId),
            instrumentName: instrumentById.get(String(pref.instrumentId))?.name ?? 'Unknown',
            rank: pref.rank,
          })),
      },
    });
  }),
);

musicianPortalRouter.get(
  '/my-parts',
  asyncRoute(async (req: Request, res) => {
    const { tenant, db } = tenantContext(req);
    const musicianId = new Types.ObjectId(req.musicianAuth!.musicianId);
    const musician = await db.Musician.findById(musicianId).lean();
    if (!musician) throw notFound('Musician not found');

    const assignments = await db.Assignment.find({ musicianId }).lean();
    const [parts, songs, instruments, seasons] = await Promise.all([
      db.Part.find({ _id: { $in: assignments.map((a) => a.partId) } }).lean(),
      db.Song.find({}).lean(),
      db.Instrument.find({}).lean(),
      db.Season.find({}).lean(),
    ]);
    const partById = new Map(parts.map((p) => [String(p._id), p]));
    const songById = new Map(songs.map((s) => [String(s._id), s]));
    const instrumentById = new Map(instruments.map((i) => [String(i._id), i]));
    const seasonById = new Map(seasons.map((s) => [String(s._id), s]));

    res.json({
      tenant: { name: tenant.name, slug: tenant.slug },
      musician: { id: String(musician._id), name: musician.name, email: musician.email },
      assignments: assignments
        .map((a) => {
          const part = partById.get(String(a.partId));
          if (!part) return null;
          return {
            id: String(a._id),
            seasonName: seasonById.get(String(a.seasonId))?.name ?? null,
            songTitle: songById.get(String(part.songId))?.title ?? 'Unknown song',
            instrumentName: instrumentById.get(String(part.instrumentId))?.name ?? 'Unknown',
            partLabel: ordinalPartLabel(part.partNumber),
            difficulty: part.difficulty,
            confirmation: a.confirmation.status,
            respondedAt: a.confirmation.respondedAt,
            note: a.confirmation.note,
          };
        })
        .filter((a): a is NonNullable<typeof a> => a !== null),
    });
  }),
);

musicianPortalRouter.post(
  '/confirm',
  asyncRoute(async (req: Request, res) => {
    const { db } = tenantContext(req);
    const input = confirmAssignmentSchema.parse(req.body);
    const musicianId = new Types.ObjectId(req.musicianAuth!.musicianId);

    // Scoped by musicianId so a musician can only answer for their own part.
    const assignment = await db.Assignment.findOneAndUpdate(
      { _id: input.assignmentId, musicianId },
      {
        $set: {
          confirmation: {
            status: input.accepted ? 'accepted' : 'declined',
            respondedAt: new Date(),
            note: input.note ?? null,
          },
        },
      },
      { new: true },
    );
    if (!assignment) throw notFound('Assignment not found');
    res.json({
      id: String(assignment._id),
      confirmation: assignment.confirmation.status,
      note: assignment.confirmation.note,
    });
  }),
);
