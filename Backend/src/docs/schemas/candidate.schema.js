'use strict';

/**
 * Candidate domain schemas
 * ------------------------
 * Request bodies used by candidate-only endpoints (profile, skills,
 * preferences, applications).
 */

module.exports = {
  schemas: {
    CandidateProfileUpdate: {
      type: 'object',
      properties: {
        full_name: { type: 'string', example: 'David Kim' },
        phone: { type: 'string', nullable: true },
        avatar_url: { type: 'string', nullable: true },
        headline: { type: 'string', nullable: true, example: 'Senior Full-Stack Engineer' },
        // Bio character bounds match the validator (min 60, max 2000).
        summary: { type: 'string', nullable: true, minLength: 60, maxLength: 2000 },
        current_title: { type: 'string', nullable: true, example: 'Senior Software Engineer' },
        desired_role: { type: 'string', nullable: true, example: 'Staff Frontend / Tech Lead' },
        years_experience: { type: 'number', minimum: 0, maximum: 60 },
        location: { type: 'string', nullable: true, example: 'San Francisco' },
        country: { type: 'string', nullable: true, example: 'USA' },
        open_to_remote: { type: 'boolean', example: true },
        work_preference: {
          type: 'string',
          nullable: true,
          enum: ['remote', 'hybrid', 'onsite'],
          example: 'remote',
        },
        relocation_scope: {
          type: 'string',
          nullable: true,
          enum: ['anywhere', 'region', 'remote_only'],
          example: 'anywhere',
        },
        expected_salary_min: { type: 'number', nullable: true, example: 130000 },
        expected_salary_max: { type: 'number', nullable: true, example: 180000 },
        salary_currency: { type: 'string', example: 'USD' },
        availability: { type: 'string', enum: ['immediate', 'two_weeks', 'one_month', 'negotiable', 'not_looking'] },
        resume_url: { type: 'string', nullable: true },
        portfolio_url: { type: 'string', nullable: true },
        linkedin_url: { type: 'string', nullable: true },
        github_url: { type: 'string', nullable: true },
        languages: { type: 'array', items: { type: 'string' }, example: ['English', 'Korean'] },
        is_public: { type: 'boolean', default: true },
      },
      minProperties: 1,
    },

    /**
     * Work-experience row as returned by /experiences/list. Dates are
     * ISO 8601 (`YYYY-MM-DD`). `end_date` is null whenever
     * `is_current === 1`.
     */
    CandidateExperience: {
      type: 'object',
      properties: {
        id: { type: 'integer', example: 12 },
        candidate_user_id: { type: 'integer', example: 1492 },
        company: { type: 'string', example: 'Verkada' },
        title: { type: 'string', example: 'Senior Frontend Engineer' },
        start_date: { type: 'string', format: 'date', example: '2022-03-01' },
        end_date: { type: 'string', format: 'date', nullable: true, example: null },
        is_current: { type: 'integer', enum: [0, 1], example: 1 },
        description: { type: 'string', nullable: true },
        sort_order: { type: 'integer', example: 0 },
        created_at: { type: 'string', format: 'date-time' },
        updated_at: { type: 'string', format: 'date-time' },
      },
    },

    CandidateExperienceCreate: {
      type: 'object',
      required: ['company', 'title', 'start_date'],
      properties: {
        company: { type: 'string', maxLength: 190, example: 'Verkada' },
        title: { type: 'string', maxLength: 190, example: 'Senior Frontend Engineer' },
        start_date: { type: 'string', format: 'date', example: '2022-03-01' },
        end_date: { type: 'string', format: 'date', nullable: true },
        is_current: { type: 'boolean', default: false },
        description: { type: 'string', nullable: true, maxLength: 5000 },
      },
    },

    /**
     * Partial-update body: at least one field required. `end_date`
     * is rejected when `is_current=true` so the API cannot accept
     * contradictory state.
     */
    CandidateExperienceUpdate: {
      type: 'object',
      minProperties: 1,
      properties: {
        company: { type: 'string', maxLength: 190 },
        title: { type: 'string', maxLength: 190 },
        start_date: { type: 'string', format: 'date' },
        end_date: { type: 'string', format: 'date', nullable: true },
        is_current: { type: 'boolean' },
        description: { type: 'string', nullable: true, maxLength: 5000 },
      },
    },

    CandidateSkill: {
      type: 'object',
      required: ['skill_id'],
      properties: {
        skill_id: { type: 'integer', example: 1 },
        proficiency: { type: 'string', enum: ['beginner', 'intermediate', 'advanced', 'expert'], example: 'advanced' },
        years_experience: { type: 'number', minimum: 0, maximum: 60, example: 6 },
      },
    },

    CandidateSkillsUpdate: {
      type: 'object',
      required: ['skills'],
      properties: {
        skills: { type: 'array', maxItems: 50, items: { $ref: '#/components/schemas/CandidateSkill' } },
      },
    },

    CandidatePreferencesUpdate: {
      type: 'object',
      properties: {
        desired_titles: { type: 'array', items: { type: 'string' }, example: ['Software Engineer', 'Full Stack Developer'] },
        preferred_locations: { type: 'array', items: { type: 'string' }, example: ['Remote', 'Berlin'] },
        preferred_job_types: {
          type: 'array',
          items: { type: 'string', enum: ['full_time', 'part_time', 'contract', 'internship', 'temporary', 'freelance'] },
          example: ['full_time', 'contract'],
        },
        preferred_categories: { type: 'array', items: { type: 'string' } },
        remote_only: { type: 'boolean', example: true },
        salary_min: { type: 'number', nullable: true, example: 90000 },
        salary_max: { type: 'number', nullable: true, example: 160000 },
        salary_currency: { type: 'string', example: 'USD' },
        notify_email: { type: 'boolean', example: true },
        notify_push: { type: 'boolean', example: false },
      },
    },

    ApplyToJobRequest: {
      type: 'object',
      properties: {
        cover_letter: { type: 'string', nullable: true, example: 'I am excited about this role...' },
        expected_salary: { type: 'number', nullable: true, example: 145000 },
        resume_url: { type: 'string', nullable: true },
      },
    },
  },
};
