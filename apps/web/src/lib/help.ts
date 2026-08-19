/**
 * Help copy lives in one place so the wording can be edited without hunting
 * through JSX, and so the user guide and the tooltips cannot drift apart.
 */
export const helpText = {
  instrumentRanking: {
    title: 'Preference order',
    body: 'Drag to rank. The assignment run tries to give everyone their first choice, and only moves down the list when a part is already full.',
  },
  willingToDouble: {
    title: 'Willing to double',
    body: 'Whether this player will cover more than one instrument in the same concert. Players who say no are assigned at most one instrument.',
  },
  experienceLevel: {
    title: 'Experience level',
    body: 'Compared against each part’s difficulty so challenging parts land with players who can carry them. Left blank, the player is treated as neutral.',
  },
  difficultyPreference: {
    title: 'Difficulty preference',
    body: 'What the player would rather be handed. It nudges the run, unlike experience level, which constrains it.',
  },
  maxAssignments: {
    title: 'Maximum parts',
    body: 'Upper limit on parts for this player across the season. Blank falls back to the run’s default.',
  },
  partPlayers: {
    title: 'Players per part',
    body: 'Minimum is what the part needs to sound; maximum is what it can hold. The run fills to the minimum first, then spreads remaining players.',
  },
  partDifficulty: {
    title: 'Part difficulty',
    body: 'Your judgement of how hard this part is. It is matched against player experience during the run.',
  },
  assignmentRun: {
    title: 'Assignment run',
    body: 'Nothing is assigned until you ask. The run reads every registration, fills parts, and leaves locked placements alone.',
  },
  assignmentLock: {
    title: 'Locking',
    body: 'A locked placement survives the next run. Lock the ones you have decided by hand before re-running.',
  },
  overCapacity: {
    title: 'Over capacity',
    body: 'You may drop a player onto a full part; it is allowed and flagged, showing e.g. 2/1, so you can settle the seating yourself.',
  },
  sectionScope: {
    title: 'Section scope',
    body: 'Section leaders see only the instruments assigned to them here. Leave empty to give them the whole ensemble.',
  },
  contactVisibility: {
    title: 'Contact details',
    body: 'Phone and email are removed on the server for section leaders and viewers, so they never reach the browser at all.',
  },
  planLimits: {
    title: 'Plan limits',
    body: 'The free tier caps parts and musicians. Paid plans lift both; the monthly and annual plans are identical apart from price and renewal.',
  },
  discountCode: {
    title: 'Discount codes',
    body: 'Student, teacher and non-profit codes apply to both the monthly and annual price. Some require proof before they take effect.',
  },
  discountVerification: {
    title: 'Verification queue',
    body: 'Codes that need proof sit here. Approving releases the discount; rejecting clears the code from the workspace.',
  },
  suspendTenant: {
    title: 'Suspension',
    body: 'A suspended workspace becomes read-only: staff can still see their roster, every change is refused, and registration closes.',
  },
  magicLink: {
    title: 'Musician sign-in',
    body: 'Musicians have no password. They enter their email and receive a single-use link, which is why an unknown address still reports success.',
  },
  instrumentRetire: {
    title: 'Retiring an instrument',
    body: 'Instruments are never deleted, because past parts point at them. Retiring hides one from new forms and pickers.',
  },
  formStatus: {
    title: 'Form status',
    body: 'Only an open form accepts registrations. Draft is for editing; closed keeps the responses but turns new ones away.',
  },
} as const;

export type HelpTopic = keyof typeof helpText;
