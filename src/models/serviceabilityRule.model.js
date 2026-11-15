import mongoose from 'mongoose';

/**
 * Serviceability rules — the small table the operations team actually maintains.
 *
 * Rules are hierarchical and resolve most-specific-first:
 *
 *     pincode  →  city  →  state  →  default
 *
 * So "Mumbai is active" is one row, and "but not 400003" is a second row that overrides it. You
 * end up managing a few dozen exceptions instead of 19,586 records.
 *
 * Any field left null on a rule is INHERITED from the broader rule that matches next, which is why
 * a pincode can override `isActive` without having to restate the ETA.
 */
const serviceabilityRuleSchema = new mongoose.Schema(
  {
    level: {
      type: String,
      enum: ['pincode', 'city', 'state', 'default'],
      required: true,
      index: true,
    },

    // pincode → '400050' | city → 'Mumbai' (as stored on the Pincode master) | state → 'MAHARASHTRA'
    // | default → '' (a single row)
    value: { type: String, default: '', trim: true },

    // What the customer sees when they ask about this area.
    isActive: { type: Boolean, default: null },
    codAvailable: { type: Boolean, default: null },
    etaDays: { type: Number, default: null, min: 0, max: 30 },

    // Free-text the admin sees: "Mumbai (both districts)".
    label: { type: String, default: '', trim: true },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true }
);

// One rule per level+value — a second row for the same city would be ambiguous.
serviceabilityRuleSchema.index({ level: 1, value: 1 }, { unique: true });

export const ServiceabilityRule =
  mongoose.models.ServiceabilityRule ||
  mongoose.model('ServiceabilityRule', serviceabilityRuleSchema);
