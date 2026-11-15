import mongoose from 'mongoose';

/**
 * India Post pincode master — one document per pincode, not per post office.
 *
 * Source: the All India Pincode Directory (165,627 post-office rows → 19,586 unique pincodes).
 * This is a REFERENCE table: it is written only by `scripts/import-pincodes.js` and is read-only
 * in the admin. If staff could edit it, a typo would silently break serviceability lookups.
 *
 * `city` is the postal DISTRICT, not the colloquial city. That matters: Mumbai is two districts
 * (MUMBAI and MUMBAI SUBURBAN), Bengaluru is two (BENGALURU URBAN / RURAL). A city-level rule has
 * to name the districts it means — the admin groups them under one label instead.
 */
const pincodeSchema = new mongoose.Schema(
  {
    // Stored as a string: leading zeros are significant, and Number('012345') loses them.
    pincode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [/^[1-9][0-9]{5}$/, 'A pincode is six digits, first digit 1-9'],
    },

    state: { type: String, trim: true, index: true },
    district: { type: String, trim: true, index: true },
    city: { type: String, trim: true, index: true }, // district, title-cased — what city rules match
    division: { type: String, trim: true },
    region: { type: String, trim: true },
    circle: { type: String, trim: true },

    officeCount: { type: Number, default: 0 },
    // True when at least one post office in the pincode actually delivers. Non-delivery pincodes
    // exist (they route through a neighbouring office) and are usually a bad sign for shipping.
    hasDelivery: { type: Boolean, default: false },

    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
  },
  { timestamps: true }
);

// The admin's "activate everything in this city" query, and the state roll-up.
pincodeSchema.index({ state: 1, city: 1 });

export const Pincode = mongoose.models.Pincode || mongoose.model('Pincode', pincodeSchema);
