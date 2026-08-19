import { HelpTip } from './HelpTip';
import {
  difficultyLabels,
  experienceLevelLabels,
  type Difficulty,
  type ExperienceLevel,
} from '../lib/types';

export interface MusicianAttributes {
  willingToDouble: boolean | null;
  experienceLevel: ExperienceLevel | null;
  difficultyPreference: Difficulty | null;
  maxAssignments: number | null;
}

/**
 * The four fields the assignment engine reads beyond instrument preference.
 * Shared by manual entry and admin editing so a musician added by hand carries
 * the same information as one who registered through the intake form.
 */
export function MusicianAttributeFields({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: MusicianAttributes;
  onChange(next: MusicianAttributes): void;
}): JSX.Element {
  const patch = (fields: Partial<MusicianAttributes>): void => onChange({ ...value, ...fields });

  return (
    <div className="grid gap-3 md:grid-cols-4">
      <div>
        <label className="label" htmlFor={`${idPrefix}-double`}>
          Willing to double
          <HelpTip topic="willingToDouble" />
        </label>
        <select
          id={`${idPrefix}-double`}
          className="input"
          value={value.willingToDouble === null ? '' : value.willingToDouble ? 'yes' : 'no'}
          onChange={(event) =>
            patch({
              willingToDouble: event.target.value === '' ? null : event.target.value === 'yes',
            })
          }
        >
          <option value="">Not stated</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </div>

      <div>
        <label className="label" htmlFor={`${idPrefix}-experience`}>
          Experience
          <HelpTip topic="experienceLevel" />
        </label>
        <select
          id={`${idPrefix}-experience`}
          className="input"
          value={value.experienceLevel ?? ''}
          onChange={(event) =>
            patch({
              experienceLevel: event.target.value
                ? (event.target.value as ExperienceLevel)
                : null,
            })
          }
        >
          <option value="">Not stated</option>
          {Object.entries(experienceLevelLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor={`${idPrefix}-difficulty`}>
          Difficulty preference
          <HelpTip topic="difficultyPreference" />
        </label>
        <select
          id={`${idPrefix}-difficulty`}
          className="input"
          value={value.difficultyPreference ?? ''}
          onChange={(event) =>
            patch({
              difficultyPreference: event.target.value
                ? (event.target.value as Difficulty)
                : null,
            })
          }
        >
          <option value="">Not stated</option>
          {Object.entries(difficultyLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor={`${idPrefix}-max`}>
          Maximum parts
          <HelpTip topic="maxAssignments" />
        </label>
        <input
          id={`${idPrefix}-max`}
          className="input"
          type="number"
          min={1}
          max={50}
          placeholder="No limit"
          value={value.maxAssignments ?? ''}
          onChange={(event) =>
            patch({ maxAssignments: event.target.value ? Number(event.target.value) : null })
          }
        />
      </div>
    </div>
  );
}
