'use strict';

/**
 * Employer domain schemas
 * -----------------------
 * Request bodies for employer-only endpoints: company profile updates, job
 * CRUD, applicant lists, interview scheduling.
 */

module.exports = {
  schemas: {
    CompanyUpdateRequest: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'Acme Technologies' },
        tagline: { type: 'string', nullable: true },
        description: { type: 'string', nullable: true },
        industry: { type: 'string', nullable: true, example: 'Software' },
        size: { type: 'string', nullable: true, example: '201-500' },
        website: { type: 'string', nullable: true, format: 'uri' },
        logo_url: { type: 'string', nullable: true },
        cover_url: { type: 'string', nullable: true },
        location: { type: 'string', nullable: true, example: 'San Francisco' },
        country: { type: 'string', nullable: true, example: 'USA' },
        founded_year: { type: 'integer', example: 2012 },
      },
      minProperties: 1,
    },

    JobCreateRequest: {
      type: 'object',
      required: ['title', 'description'],
      properties: {
        title: { type: 'string', example: 'Senior Backend Engineer' },
        description: { type: 'string', example: 'Build distributed systems ...' },
        responsibilities: { type: 'string', nullable: true },
        requirements: { type: 'string', nullable: true },
        benefits: { type: 'string', nullable: true },
        category_id: { type: 'integer', nullable: true, example: 1 },
        job_type: { type: 'string', enum: ['full_time', 'part_time', 'contract', 'internship', 'temporary', 'freelance'], default: 'full_time' },
        experience_level: { type: 'string', enum: ['entry', 'junior', 'mid', 'senior', 'lead', 'executive'], default: 'mid' },
        location: { type: 'string', nullable: true, example: 'San Francisco' },
        country: { type: 'string', nullable: true, example: 'USA' },
        is_remote: { type: 'boolean', default: false },
        salary_min: { type: 'number', nullable: true, example: 140000 },
        salary_max: { type: 'number', nullable: true, example: 200000 },
        salary_currency: { type: 'string', default: 'USD' },
        salary_period: { type: 'string', enum: ['hour', 'day', 'month', 'year'], default: 'year' },
        skills_tags: { type: 'array', items: { type: 'string' }, example: ['Node.js', 'TypeScript', 'AWS'] },
        application_deadline: { type: 'string', format: 'date', nullable: true },
        vacancies: { type: 'integer', minimum: 1, default: 1 },
        is_featured: { type: 'boolean', default: false },
        status: { type: 'string', enum: ['draft', 'open'], default: 'open' },
      },
    },

    JobUpdateRequest: {
      allOf: [
        { $ref: '#/components/schemas/JobCreateRequest' },
        { type: 'object', minProperties: 1 },
      ],
    },

    InterviewCreateRequest: {
      type: 'object',
      required: ['application_id', 'scheduled_at'],
      properties: {
        application_id: { type: 'integer', example: 4 },
        scheduled_at: { type: 'string', format: 'date-time', example: '2026-06-01T15:00:00.000Z' },
        duration_minutes: { type: 'integer', minimum: 5, maximum: 480, default: 45 },
        mode: { type: 'string', enum: ['onsite', 'phone', 'video', 'assessment'], default: 'video' },
        location: { type: 'string', nullable: true },
        meeting_url: { type: 'string', nullable: true, format: 'uri' },
        notes: { type: 'string', nullable: true },
      },
    },

    JobListFiltersBody: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['draft', 'open', 'closed', 'archived'], nullable: true },
        page: { type: 'integer', minimum: 1, default: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
      },
    },

    ApplicantListFiltersBody: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['applied', 'reviewing', 'shortlisted', 'interview', 'offered', 'hired', 'rejected', 'withdrawn'], nullable: true },
        page: { type: 'integer', minimum: 1, default: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
      },
    },

    RejectionReasonBody: {
      type: 'object',
      properties: {
        reason: { type: 'string', nullable: true, example: 'Looking for candidates with more cloud experience.' },
      },
    },
  },
};
