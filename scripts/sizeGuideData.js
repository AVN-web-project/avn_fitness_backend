const fitRows = [
  { size: 'S', fit: '20-23 cm' },
  { size: 'M', fit: '23-26 cm' },
  { size: 'L', fit: '26-29 cm' },
  { size: 'XL', fit: '29-32 cm' },
];

export const SIZE_GUIDES_BY_SLUG = {
  'knee-wrap-pro-79': {
    measurementType: 'supportGear',
    unit: 'inches',
    notes: 'Baseline length guide. Measure the product length required for your wrapping style; the available SKUs remain the source of truth for purchasable options.',
    rows: [
      { size: 'S', length: '60', width: '3' },
      { size: 'M', length: '70', width: '3' },
      { size: 'L', length: '79', width: '3' },
      { size: 'XL', length: '90', width: '3' },
    ],
  },
  'elbow-wrap-compression-sleeve': {
    measurementType: 'supportGear',
    unit: 'cm',
    notes: 'Baseline compression fit guide. Measure around the elbow with the arm relaxed and choose the closest range; size up for a lighter fit.',
    rows: fitRows,
  },
  'wrist-wrap-competition-18': {
    measurementType: 'supportGear',
    unit: 'inches',
    notes: 'These are length options rather than apparel sizes. Choose 18 inches for competition-style support or 24 inches for heavier wrist locking.',
    rows: [
      { size: '18-Inch Competition', length: '18', width: '3' },
      { size: '24-Inch Heavy Duty', length: '24', width: '3' },
    ],
  },
  'lifting-straps-deadlift-padded': {
    measurementType: 'supportGear',
    unit: 'inches',
    notes: 'One-size design with an adjustable wrist loop. The stated length is the strap length, not a body-size recommendation.',
    rows: [{ size: 'One Size', length: '23', width: '1.5' }],
  },
  'yoga-stretching-belt-cotton': {
    measurementType: 'supportGear',
    unit: 'inches',
    notes: 'One-size stretching belt. The stated length supports full-body poses and the width is the webbing width.',
    rows: [{ size: 'One Size', length: '96', width: '1.5' }],
  },
  'leather-weightlifting-lever-belt': {
    measurementType: 'supportGear',
    unit: 'inches',
    notes: 'Measure around the waist where the belt will sit, over the clothing used for training. The range is the waist circumference, not the belt length.',
    rows: [
      { size: 'S', length: '24-30', width: '4' },
      { size: 'M', length: '30-34', width: '4' },
      { size: 'L', length: '34-38', width: '4' },
      { size: 'XL', length: '38-44', width: '4' },
    ],
  },
  'ankle-compression-sleeve-support': {
    measurementType: 'supportGear',
    unit: 'cm',
    notes: 'Baseline compression fit guide. Measure the ankle circumference at the narrowest point above the ankle bone and size up if between ranges.',
    rows: fitRows,
  },
  'legacy-powerlifting-wraps-discontinued': {
    measurementType: 'supportGear',
    unit: 'inches',
    notes: 'Archived product measurement. This product is discontinued and not available for purchase.',
    rows: [{ size: 'Standard', length: '79', width: '3' }],
  },
};

export const getSizeGuideForSlug = (slug) => {
  const guide = SIZE_GUIDES_BY_SLUG[slug];
  return guide ? structuredClone(guide) : null;
};
