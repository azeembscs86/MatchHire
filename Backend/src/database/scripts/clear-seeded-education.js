'use strict';

/**
 * One-off cleanup: clear the synthetic education strings that
 * `seed.bulk.js` used to write into `candidate_profiles.education`
 * for every bulk-generated demo candidate. The string follows the
 * pattern:
 *
 *   "BS in Computer Science · <Word> University · <YYYY>"
 *
 * That value polluted every seeded candidate's profile with content
 * they had never entered, which then surfaced on the candidate's
 * own Profile page as "system / default education". This script
 * sets the column to NULL for any row whose value matches the
 * synthesised pattern. Real candidates who have typed their own
 * education are untouched.
 *
 * Usage:
 *
 *   node Backend/src/database/scripts/clear-seeded-education.js          # dry-run
 *   node Backend/src/database/scripts/clear-seeded-education.js --apply  # commit changes
 *
 * Idempotent — running twice is harmless because the second pass
 * finds zero matching rows.
 */

const db = require('../../config/database');

/**
 * The synthetic patterns the two bulk seeds used to write. Each is a
 * LIKE pattern (escape `%`). If we ever add a new synthetic shape,
 * register it here too — the script unions them so one pass clears
 * every variant.
 */
const PATTERNS = [
  // seed.bulk.js (engineering candidates)
  'BS in Computer Science · % University · %',
  // seed.industries.js — varied templates per profession
  'Bachelor of Science in % - % Institute of Technology - %',
  'MBBS / Bachelor of Medicine - % Medical College - %',
  'Masters in Education - % University - %',
  'ACCA / Bachelor of Commerce - % School of Business - %',
  'LLB - % School of Law - %',
];

async function main() {
  const apply = process.argv.includes('--apply');

  // Count matches per pattern so the operator can audit what's about
  // to change before passing `--apply`.
  let total = 0;
  for (const p of PATTERNS) {
    const row = await db.queryOne(
      `SELECT COUNT(*) AS n FROM candidate_profiles WHERE education LIKE ?`,
      [p]
    );
    const n = Number(row?.n || 0);
    if (n > 0) console.log(`  [${n.toString().padStart(4)}] ${p}`);
    total += n;
  }
  console.log(`---\nTotal rows matching synthetic education patterns: ${total}`);
  if (total === 0) {
    console.log('Nothing to clear.');
    process.exit(0);
  }

  if (!apply) {
    console.log('Dry run — pass --apply to actually clear the field.');
    process.exit(0);
  }

  const pool = db.getPool();
  let affected = 0;
  for (const p of PATTERNS) {
    const [result] = await pool.execute(
      `UPDATE candidate_profiles SET education = NULL WHERE education LIKE ?`,
      [p]
    );
    affected += result.affectedRows;
  }
  console.log(`Cleared education on ${affected} rows.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('clear-seeded-education failed:', err.message);
  process.exit(1);
});
