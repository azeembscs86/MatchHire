'use strict';

/**
 * Candidate Portfolio controller
 * ------------------------------
 * Thin HTTP layer over `candidatePortfolio.service`. Mount path:
 * `/api/v1/candidates/portfolio` (candidate-self mutations) and
 * `/api/v1/candidates/:id/portfolio` (read-only foreign viewer).
 *
 * Auth at the route layer (requireAuth + requireCandidate for the
 * write endpoints; optionalAuth + visibility filter for the
 * read endpoint).
 */

const service = require('../services/candidatePortfolio.service');
const response = require('../utils/response.helper');

exports.listMine = async (req, res) => {
  const data = await service.listMine(req.user.id);
  return response.success(res, data, 'Portfolio items returned');
};

exports.create = async (req, res) => {
  const data = await service.create(req.user.id, req.body || {});
  return response.created(res, data, 'Portfolio item created');
};

exports.update = async (req, res) => {
  const data = await service.update(req.user.id, Number(req.params.id), req.body || {});
  return response.success(res, data, 'Portfolio item updated');
};

exports.remove = async (req, res) => {
  const data = await service.remove(req.user.id, Number(req.params.id));
  return response.success(res, data, 'Portfolio item deleted');
};

/**
 * Foreign-viewer read endpoint. Visibility filtered server-side
 * based on the viewer's role (employer / candidate / guest) and
 * whether they're the owner.
 */
exports.listForCandidate = async (req, res) => {
  const candidateId = Number(req.params.candidateId);
  const viewer = req.user || null;
  const selfView = !!viewer && Number(viewer.id) === candidateId;
  const records = await service.listForViewer(candidateId, { viewer, selfView });
  return response.success(res, { records }, 'Portfolio items returned');
};
