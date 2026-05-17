'use strict';

/**
 * Public domain schemas
 * ---------------------
 * Domain object shapes returned by public list/detail endpoints. These are
 * exported as components so route JSDoc blocks can reference them with $ref.
 */

module.exports = {
  schemas: {
    JobPublic: {
      type: 'object',
      properties: {
        id: { type: 'integer', example: 1 },
        title: { type: 'string', example: 'Senior Full-Stack Engineer' },
        slug: { type: 'string', example: 'senior-full-stack-engineer-1779004085000' },
        description: { type: 'string' },
        job_type: { type: 'string', example: 'full_time' },
        experience_level: { type: 'string', example: 'senior' },
        location: { type: 'string', example: 'San Francisco' },
        country: { type: 'string', example: 'USA' },
        is_remote: { type: 'integer', example: 1 },
        salary_min: { type: 'number', example: 140000 },
        salary_max: { type: 'number', example: 190000 },
        salary_currency: { type: 'string', example: 'USD' },
        skills_tags: { type: 'string', example: 'JavaScript,TypeScript,React,Node.js' },
        is_featured: { type: 'integer', example: 1 },
        published_at: { type: 'string', format: 'date-time' },
        company_name: { type: 'string', example: 'Acme Technologies' },
        company_logo: { type: 'string', nullable: true },
      },
    },

    CompanyPublic: {
      type: 'object',
      properties: {
        id: { type: 'integer', example: 1 },
        name: { type: 'string', example: 'Acme Technologies' },
        slug: { type: 'string', example: 'acme-technologies' },
        tagline: { type: 'string', nullable: true },
        industry: { type: 'string', example: 'Software' },
        size: { type: 'string', example: '201-500' },
        website: { type: 'string', nullable: true },
        logo_url: { type: 'string', nullable: true },
        location: { type: 'string', example: 'San Francisco' },
        country: { type: 'string', example: 'USA' },
        is_featured: { type: 'integer', example: 1 },
        verification_status: { type: 'string', example: 'verified' },
        open_jobs: { type: 'integer', example: 3 },
      },
    },

    CandidatePublic: {
      type: 'object',
      properties: {
        id: { type: 'integer', example: 6 },
        full_name: { type: 'string', example: 'David Kim' },
        headline: { type: 'string', example: 'Senior Full-Stack Engineer' },
        current_title: { type: 'string', example: 'Senior Software Engineer' },
        years_experience: { type: 'number', example: 7 },
        location: { type: 'string', example: 'San Francisco' },
        country: { type: 'string', example: 'USA' },
        open_to_remote: { type: 'integer', example: 1 },
        profile_strength: { type: 'integer', example: 92 },
      },
    },
  },
};
