'use strict';

/**
 * Employer repository
 * -------------------
 * Data access for the `employer_profiles` table (the join between a user
 * and their employer company).
 */

const db = require('../config/database');

async function createProfile({ user_id, company_id, designation = null, department = null, phone = null, is_primary_contact = false }, conn = null) {
  const exec = conn ? conn.execute.bind(conn) : (sql, params) => db.getPool().execute(sql, params);
  await exec(
    `INSERT INTO employer_profiles (user_id, company_id, designation, department, phone, is_primary_contact)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE company_id = VALUES(company_id), designation = VALUES(designation)`,
    [user_id, company_id, designation, department, phone, is_primary_contact ? 1 : 0]
  );
}

async function findByUserId(user_id) {
  return db.queryOne(`SELECT * FROM employer_profiles WHERE user_id = ? LIMIT 1`, [user_id]);
}

module.exports = {
  createProfile,
  findByUserId,
};
