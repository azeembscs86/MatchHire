'use strict';

/**
 * Common OpenAPI components
 * -------------------------
 * Re-usable response envelopes, error shapes, pagination metadata, and the
 * canonical examples shown across every endpoint.
 *
 * These are merged into the final OpenAPI definition by `src/docs/swagger.js`.
 */

module.exports = {
  schemas: {
    /** The mandatory header object on every API response. */
    ResponseHeader: {
      type: 'object',
      properties: {
        responseCode: { type: 'integer', enum: [0, 1], example: 1, description: '1 = success, 0 = failure' },
        status: { type: 'string', example: 'Success', enum: ['Success', 'Error', 'Validation Error'] },
        message: { type: 'string', example: 'Data Returned Successfully' },
      },
      required: ['responseCode', 'status', 'message'],
    },

    /** Generic success envelope shape used across all 2xx responses. */
    SuccessEnvelope: {
      type: 'object',
      properties: {
        Response: { $ref: '#/components/schemas/ResponseHeader' },
        Data: { type: 'object', additionalProperties: true, example: {} },
      },
      example: {
        Response: { responseCode: 1, status: 'Success', message: 'Data Returned Successfully' },
        Data: {},
      },
    },

    /** Generic error envelope shape for non-validation failures. */
    ErrorEnvelope: {
      type: 'object',
      properties: {
        Response: { $ref: '#/components/schemas/ResponseHeader' },
        Data: { nullable: true, example: null },
      },
      example: {
        Response: { responseCode: 0, status: 'Error', message: 'Something went wrong' },
        Data: null,
      },
    },

    /** Envelope used when Joi validation fails. */
    ValidationEnvelope: {
      type: 'object',
      properties: {
        Response: { $ref: '#/components/schemas/ResponseHeader' },
        Errors: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string', example: 'email' },
              message: { type: 'string', example: 'email is required' },
              type: { type: 'string', example: 'any.required' },
            },
          },
        },
      },
      example: {
        Response: { responseCode: 0, status: 'Validation Error', message: 'Invalid request data' },
        Errors: [
          { field: 'email', message: 'email must be a valid email', type: 'string.email' },
          { field: 'password', message: 'password is required', type: 'any.required' },
        ],
      },
    },

    /** Pagination block returned by every list endpoint. */
    Pagination: {
      type: 'object',
      properties: {
        page: { type: 'integer', example: 1 },
        limit: { type: 'integer', example: 10 },
        total: { type: 'integer', example: 100 },
        totalPages: { type: 'integer', example: 10 },
      },
    },

    /** Standard list payload (records + pagination). */
    ListEnvelope: {
      type: 'object',
      properties: {
        Response: { $ref: '#/components/schemas/ResponseHeader' },
        Data: {
          type: 'object',
          properties: {
            records: { type: 'array', items: { type: 'object' } },
            pagination: { $ref: '#/components/schemas/Pagination' },
          },
        },
      },
      example: {
        Response: { responseCode: 1, status: 'Success', message: 'Jobs Returned Successfully' },
        Data: {
          records: [],
          pagination: { page: 1, limit: 10, total: 100, totalPages: 10 },
        },
      },
    },

    /** Generic POST-body shape used by paginated authenticated lists. */
    ListFiltersBody: {
      type: 'object',
      properties: {
        page: { type: 'integer', minimum: 1, default: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
        status: { type: 'string', nullable: true, description: 'Optional status filter' },
      },
    },
  },

  responses: {
    EmptySuccess: {
      description: 'Operation completed',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } },
    },
    GenericError: {
      description: 'Request failed',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
    },
    ValidationError: {
      description: 'Joi validation failure',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationEnvelope' } } },
    },
    UnauthorizedError: {
      description: 'Missing or invalid token',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ErrorEnvelope' },
          example: {
            Response: { responseCode: 0, status: 'Error', message: 'Authentication token missing' },
            Data: null,
          },
        },
      },
    },
    ForbiddenError: {
      description: 'Role does not permit this action',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ErrorEnvelope' },
          example: {
            Response: { responseCode: 0, status: 'Error', message: 'You do not have access to this resource' },
            Data: null,
          },
        },
      },
    },
    NotFoundError: {
      description: 'Resource not found',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ErrorEnvelope' },
          example: {
            Response: { responseCode: 0, status: 'Error', message: 'Resource not found' },
            Data: null,
          },
        },
      },
    },
    ConflictError: {
      description: 'Resource already exists',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ErrorEnvelope' },
          example: {
            Response: { responseCode: 0, status: 'Error', message: 'Email already in use' },
            Data: null,
          },
        },
      },
    },
    PaginatedList: {
      description: 'Paginated records',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/ListEnvelope' } } },
    },
    PaginatedJobs: {
      description: 'Paginated jobs',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ListEnvelope' },
          example: {
            Response: { responseCode: 1, status: 'Success', message: 'Jobs Returned Successfully' },
            Data: {
              records: [
                {
                  id: 1,
                  title: 'Senior Full-Stack Engineer',
                  company_name: 'Acme Technologies',
                  company_logo: 'https://logo.clearbit.com/acme.com',
                  location: 'San Francisco',
                  is_remote: 1,
                  job_type: 'full_time',
                  experience_level: 'senior',
                  salary_min: 140000,
                  salary_max: 190000,
                  salary_currency: 'USD',
                  skills_tags: 'JavaScript,TypeScript,React,Node.js',
                  is_featured: 1,
                  published_at: '2026-05-17T12:47:30.000Z',
                },
              ],
              pagination: { page: 1, limit: 10, total: 5, totalPages: 1 },
            },
          },
        },
      },
    },
  },
};
