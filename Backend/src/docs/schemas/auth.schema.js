'use strict';

/**
 * Auth domain schemas
 * -------------------
 * Request payloads and the standard `AuthLoginResponse` envelope shared by
 * register / login / refresh.
 */

module.exports = {
  schemas: {
    RegisterCandidateRequest: {
      type: 'object',
      required: ['full_name', 'email', 'password'],
      properties: {
        full_name: { type: 'string', minLength: 2, maxLength: 150, example: 'Maria Singh' },
        email: { type: 'string', format: 'email', example: 'maria@example.com' },
        phone: { type: 'string', nullable: true, example: '+1 555 1234' },
        password: { type: 'string', minLength: 8, example: 'Password@123', description: 'Min 8 chars, must include letters and numbers' },
        headline: { type: 'string', nullable: true, example: 'Backend Engineer' },
        current_title: { type: 'string', nullable: true, example: 'Software Engineer' },
        location: { type: 'string', nullable: true, example: 'Berlin' },
        country: { type: 'string', nullable: true, example: 'Germany' },
        years_experience: { type: 'number', minimum: 0, maximum: 60, default: 0 },
      },
    },

    RegisterEmployerRequest: {
      type: 'object',
      required: ['full_name', 'email', 'password', 'company'],
      properties: {
        full_name: { type: 'string', example: 'Alex Park' },
        email: { type: 'string', format: 'email', example: 'alex@acme-careers.com' },
        phone: { type: 'string', nullable: true },
        password: { type: 'string', minLength: 8, example: 'Password@123' },
        designation: { type: 'string', nullable: true, example: 'Head of Talent' },
        company: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', example: 'Acme Careers' },
            website: { type: 'string', format: 'uri', nullable: true },
            industry: { type: 'string', nullable: true, example: 'Software' },
            size: { type: 'string', nullable: true, example: '51-200' },
            location: { type: 'string', nullable: true },
            country: { type: 'string', nullable: true },
            description: { type: 'string', nullable: true },
          },
        },
      },
    },

    LoginRequest: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', format: 'email', example: 'david@candidate.com' },
        password: { type: 'string', example: 'Password@123' },
      },
    },

    RefreshTokenRequest: {
      type: 'object',
      required: ['refresh_token'],
      properties: { refresh_token: { type: 'string', example: '1f2c...e74' } },
    },

    ForgotPasswordRequest: {
      type: 'object',
      required: ['email'],
      properties: { email: { type: 'string', format: 'email', example: 'david@candidate.com' } },
    },

    ResetPasswordRequest: {
      type: 'object',
      required: ['token', 'password'],
      properties: {
        token: { type: 'string', example: 'abc123def456' },
        password: { type: 'string', minLength: 8, example: 'NewPassword@123' },
      },
    },

    ChangePasswordRequest: {
      type: 'object',
      required: ['current_password', 'new_password'],
      properties: {
        current_password: { type: 'string', example: 'Password@123' },
        new_password: { type: 'string', minLength: 8, example: 'Password@456' },
      },
    },

    AuthUser: {
      type: 'object',
      properties: {
        id: { type: 'integer', example: 6 },
        full_name: { type: 'string', example: 'David Kim' },
        email: { type: 'string', example: 'david@candidate.com' },
        role: { type: 'string', enum: ['candidate', 'employer', 'admin', 'super_admin'], example: 'candidate' },
        status: { type: 'string', example: 'active' },
        email_verified_at: { type: 'string', format: 'date-time', nullable: true },
        avatar_url: { type: 'string', nullable: true },
        created_at: { type: 'string', format: 'date-time' },
      },
    },

    AuthLoginResponse: {
      type: 'object',
      properties: {
        Response: { $ref: '#/components/schemas/ResponseHeader' },
        Data: {
          type: 'object',
          properties: {
            user: { $ref: '#/components/schemas/AuthUser' },
            access_token: { type: 'string', example: 'eyJhbGciOi...' },
            refresh_token: { type: 'string', example: '1f2c...e74' },
            token_type: { type: 'string', example: 'Bearer' },
            expires_in: { type: 'string', example: '7d' },
          },
        },
      },
    },
  },

  responses: {
    AuthLoginSuccess: {
      description: 'Authenticated session',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/AuthLoginResponse' },
          example: {
            Response: { responseCode: 1, status: 'Success', message: 'Login successful' },
            Data: {
              user: {
                id: 6,
                full_name: 'David Kim',
                email: 'david@candidate.com',
                role: 'candidate',
                status: 'active',
                avatar_url: null,
                created_at: '2026-05-17T12:47:30.000Z',
              },
              access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjYsInJvbGUiOiJjYW5kaWRhdGUi...',
              refresh_token: '1f2c0a7b9c...e74',
              token_type: 'Bearer',
              expires_in: '7d',
            },
          },
        },
      },
    },
  },

  examples: {
    AuthLoginExample: {
      summary: 'Successful login',
      value: {
        Response: { responseCode: 1, status: 'Success', message: 'Login successful' },
        Data: {
          user: { id: 6, full_name: 'David Kim', email: 'david@candidate.com', role: 'candidate' },
          access_token: 'eyJ...',
          refresh_token: '1f2c...e74',
          token_type: 'Bearer',
          expires_in: '7d',
        },
      },
    },
  },
};
