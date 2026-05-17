'use strict';

const ROLES = Object.freeze({
  CANDIDATE: 'candidate',
  EMPLOYER: 'employer',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin',
});

const ALL_ROLES = Object.values(ROLES);

const ROLE_HIERARCHY = {
  candidate: 1,
  employer: 1,
  admin: 2,
  super_admin: 3,
};

module.exports = {
  ROLES,
  ALL_ROLES,
  ROLE_HIERARCHY,
};
