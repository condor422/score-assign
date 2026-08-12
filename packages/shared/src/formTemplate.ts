import type { FormField, IntakeFormInput } from './intake.js';

/**
 * The form every new tenant starts from, modelled on the Arizona Flute Society
 * "Alla Breve" registration. Every field is editable in the form builder --
 * organisation-specific questions (membership, rehearsal dates) are ordinary
 * data rows, not code.
 *
 * The instrument_ranking field carries no options: the tenant's instrument
 * list supplies them at render time, and the musician drags them into
 * preference order.
 */
const fields: FormField[] = [
  {
    key: 'name',
    label: 'Name (first and last)',
    type: 'text',
    role: 'name',
    required: true,
    options: [],
    order: 0,
  },
  {
    key: 'email',
    label: 'Email',
    type: 'email',
    role: 'email',
    required: true,
    options: [],
    order: 1,
  },
  {
    key: 'phone',
    label: 'Phone Number',
    type: 'phone',
    role: 'phone',
    required: true,
    options: [],
    order: 2,
  },
  {
    key: 'member_status',
    label: 'I am a current member of the organization.',
    helpText: 'Membership may be required to participate. Ask the director if unsure.',
    type: 'radio',
    required: true,
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ],
    order: 3,
  },
  {
    key: 'rehearsal_attendance',
    label: 'I can attend all scheduled rehearsals.',
    helpText:
      'Attendance at every rehearsal is normally required. Contact the director before registering if you cannot.',
    type: 'radio',
    required: true,
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ],
    order: 4,
  },
  {
    key: 'instruments',
    label:
      'Which instruments do you own and would like to play? Drag them into the order you prefer to play them.',
    helpText: 'Your first choice goes at the top.',
    type: 'instrument_ranking',
    role: 'instruments',
    required: true,
    options: [],
    order: 5,
  },
  {
    key: 'doubling',
    label:
      'If you play more than one instrument, are you comfortable doubling (playing multiple instruments) for this concert?',
    type: 'radio',
    role: 'doubling',
    required: false,
    options: [
      { value: 'yes', label: 'I am comfortable with doubling if needed.' },
      { value: 'no', label: 'I would prefer to stay on the same instrument.' },
    ],
    order: 6,
  },
  {
    key: 'experience',
    label: 'What is your overall experience level?',
    type: 'radio',
    role: 'experience',
    required: true,
    options: [
      { value: 'intermediate', label: 'Intermediate' },
      { value: 'advanced', label: 'Advanced' },
      {
        value: 'collegiate',
        label: 'Collegiate (currently working towards an undergraduate degree in music)',
      },
      { value: 'graduate_professional', label: 'Graduate / professional' },
    ],
    order: 7,
  },
  {
    key: 'difficulty',
    label: 'I would prefer to be placed on parts that are...',
    type: 'radio',
    role: 'difficulty',
    required: true,
    options: [
      { value: 'easier', label: 'Easier' },
      { value: 'moderate', label: 'Moderately difficult' },
      { value: 'challenging', label: 'More challenging' },
    ],
    order: 8,
  },
  {
    key: 'notes',
    label:
      'Anything else that would help us place you on parts that match your ability level?',
    type: 'longtext',
    role: 'notes',
    required: false,
    options: [],
    order: 9,
  },
];

export function defaultIntakeForm(overrides: Partial<IntakeFormInput> = {}): IntakeFormInput {
  return {
    title: 'Flute Choir Registration',
    slug: 'registration',
    description:
      'Complete the questions below to participate in the upcoming flute choir concert.',
    status: 'draft',
    confirmationMessage:
      'Thanks for registering. Parts will be emailed to you once assignments are complete.',
    fields,
    ...overrides,
  };
}
