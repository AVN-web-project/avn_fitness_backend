/**
 * Pagination parsing.
 *
 * The controllers did this by hand:
 *   const pageNum = parseInt(page, 10);
 *   const limitNum = parseInt(limit, 10);
 *   const skip = (pageNum - 1) * limitNum;
 * Two problems. `?page=abc` yields NaN, and `skip(NaN)` makes MongoDB throw — a 500 for a
 * bad query string. And `?limit=1000000` was accepted, so the server would serialise a
 * million documents. This defaults the page, clamps the limit, and never returns NaN.
 */
const MAX_LIMIT = 100;

export const parsePagination = (query = {}, { defaultLimit = 20, maxLimit = MAX_LIMIT } = {}) => {
  const rawPage = parseInt(query?.page, 10);
  const rawLimit = parseInt(query?.limit, 10);

  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, maxLimit) : defaultLimit;

  return { page, limit, skip: (page - 1) * limit };
};
