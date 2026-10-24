/**
 * ObjectId guard.
 *
 * Every id lookup used to call `.match()` straight on the incoming value, e.g.
 *   { _id: productId.match(/^[0-9a-fA-F]{24}$/) ? productId : null }
 * A non-string body — {"productId": 123} — has no `.match`, so the handler threw a
 * TypeError and returned 500 instead of 400. Always test through this instead.
 */
export const isObjectId = (value) =>
  typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value);
