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
        summary: { type: 'string', nullable: true },
        current_title: { type: 'string', nullable: true, example: 'Senior Software Engineer' },
        years_experience: { type: 'number', minimum: 0, maximum: 60 },
        location: { type: 'string', nullable: true, example: 'San Francisco' },
        country: { type: 'string', nullable: true, example: 'USA' },
        open_to_remote: { type: 'boolean', example: true },
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
