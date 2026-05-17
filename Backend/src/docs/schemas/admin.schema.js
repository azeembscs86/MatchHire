'use strict';

/**
 * Admin domain schemas
 * --------------------
 * Request bodies for admin / super_admin moderation endpoints.
 */

module.exports = {
  schemas: {
    AdminUserListFilters: {
      type: 'object',
      properties: {
        keyword: { type: 'string', nullable: true },
        role: { type: 'string', enum: ['candidate', 'employer', 'admin', 'super_admin'], nullable: true },
        status: { type: 'string', nullable: true },
        page: { type: 'integer', minimum: 1, default: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
      },
    },

    UserStatusUpdate: {
      type: 'object',
      required: ['status'],
      properties: {
        status: { type: 'string', enum: ['active', 'inactive', 'suspended', 'pending'] },
        reason: { type: 'string', nullable: true },
      },
    },

    CompanyVerifyRequest: {
      type: 'object',
      required: ['verification_status'],
      properties: {
        verification_status: { type: 'string', enum: ['verified', 'rejected', 'pending'] },
        reason: { type: 'string', nullable: true },
      },
    },

    JobStatusUpdate: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['open', 'closed', 'archived'], nullable: true },
        admin_status: { type: 'string', enum: ['pending', 'approved', 'rejected'], nullable: true },
        reason: { type: 'string', nullable: true },
      },
      description: 'At least one of `status` or `admin_status` is required.',
    },
  },
};
