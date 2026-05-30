/**
 * Canonical rejection reasons.
 *
 * Drives:
 *   - the employer reject-application form (the radio list).
 *   - the candidate-side rejected-application card that renders the
 *     reason + improvement suggestions.
 *
 * The set MIRRORS Backend/src/validators/employer.validator.js
 * `REJECTION_REASON_KEYS` exactly. If you add a reason here, add it
 * there too (the validator enforces the keys server-side).
 *
 * Persistence shape on `applications.rejection_reason` (VARCHAR(500)):
 *   - Canonical key — e.g. "skills_mismatch"
 *   - "other:<custom text>" — the "other" branch preserves the
 *     employer-supplied text verbatim so the candidate sees the
 *     original wording. `parseRejectionReason()` below splits this.
 */

export const REJECTION_REASONS = [
  {
    key: 'skills_mismatch',
    label: 'Skills do not match requirements',
    suggestions: [
      'Compare the job\'s required skills against your profile and close the gaps with focused study.',
      'Add the missing skills to your profile so future job recommendations rank you better.',
      'Build one small project per missing skill and link it from your profile.',
    ],
  },
  {
    key: 'insufficient_experience',
    label: 'Insufficient experience',
    suggestions: [
      'Expand each role in your Work Experience section with specific responsibilities and measurable outcomes.',
      'Take on side projects, freelance work, or contributions to open source to build hands-on years.',
      'Apply to slightly more junior roles in the same family to grow into the senior tier.',
    ],
  },
  {
    key: 'education_mismatch',
    label: 'Education requirements not met',
    suggestions: [
      'Add any completed degrees, diplomas, or certificates to your Profile → Education section.',
      'Consider an industry certification that signals the same knowledge (e.g. AWS, Google, PMP).',
      'Some roles weight equivalent experience equally — make sure your work history shows it.',
    ],
  },
  {
    key: 'salary_mismatch',
    label: 'Salary expectations mismatch',
    suggestions: [
      'Revisit Preferences → Compensation and align your expectations with the role\'s band.',
      'Use the Salary Explorer on the home page to benchmark roles by country and experience.',
      'Filter the Jobs page by the salary band that matches your target.',
    ],
  },
  {
    key: 'position_filled',
    label: 'Position already filled',
    suggestions: [
      'Not your fault — the role closed before your application could progress.',
      'Save your strongest applications and apply to similar roles at the same company while you\'re top of mind.',
      'Follow the company so you see their next opening as soon as it\'s posted.',
    ],
  },
  {
    key: 'location_mismatch',
    label: 'Location mismatch',
    suggestions: [
      'Update Preferences → Location with the cities, countries, and remote modes you\'re actually open to.',
      'If you\'re open to relocation, set the relocation/visa toggles so this filter stops blocking you.',
      'For remote-friendly roles, make sure your profile location reads as the right timezone.',
    ],
  },
  {
    key: 'incomplete_profile',
    label: 'Incomplete profile',
    suggestions: [
      'Fill every section on your Profile page — about, skills, experience, education, projects.',
      'Aim for a profile completion score above 80% before applying to senior roles.',
      'Add at least one portfolio link or project so employers can see your work.',
    ],
  },
  {
    key: 'incomplete_application',
    label: 'Incomplete application',
    suggestions: [
      'Re-read the job description and answer every screening question.',
      'Tailor your cover letter to the role rather than reusing a generic one.',
      'Upload a fresh, role-targeted resume — the latest version of your profile resume.',
    ],
  },
  {
    key: 'poor_interview',
    label: 'Poor interview performance',
    suggestions: [
      'Run a few mock interviews using your strongest 5 STAR stories until they\'re effortless.',
      'For senior tracks, dedicate practice to a 45-minute system-design rehearsal.',
      'End each real interview with three sharp role-specific questions — it shows engagement.',
    ],
  },
  {
    key: 'other',
    label: 'Other',
    suggestions: [
      'Review the reason the employer wrote and apply the relevant fix.',
      'Update your profile to address any gap the employer mentioned.',
    ],
  },
];

const KEY_INDEX = Object.fromEntries(REJECTION_REASONS.map((r) => [r.key, r]));

/**
 * Decode the value stored on `applications.rejection_reason`.
 *
 * Backend stores either:
 *   - the canonical key alone (e.g. "skills_mismatch"), or
 *   - "other:<custom text>" — the employer-supplied free text.
 *
 * Returns `null` when the column is empty / unknown, so callers can
 * fall back to "Not specified" gracefully.
 *
 * @param   {string|null|undefined} stored
 * @returns {{ key: string, label: string, customText: string|null, suggestions: string[] } | null}
 */
export function parseRejectionReason(stored) {
  if (!stored) return null;
  const text = String(stored).trim();
  if (!text) return null;
  // "other:<text>" branch — keep the custom text for display.
  if (text.toLowerCase().startsWith('other:')) {
    const customText = text.slice('other:'.length).trim();
    const meta = KEY_INDEX.other;
    return {
      key: 'other',
      label: customText || meta.label,
      customText: customText || null,
      suggestions: meta.suggestions,
    };
  }
  const meta = KEY_INDEX[text];
  if (meta) {
    return { key: meta.key, label: meta.label, customText: null, suggestions: meta.suggestions };
  }
  // Legacy free-text rows (pre-Step 53) — show the raw value with
  // generic improvement suggestions.
  return {
    key: 'other',
    label: text,
    customText: text,
    suggestions: KEY_INDEX.other.suggestions,
  };
}
