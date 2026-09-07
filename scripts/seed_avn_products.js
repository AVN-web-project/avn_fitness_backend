import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Category } from '../src/models/category.model.js';
import { Product } from '../src/models/product.model.js';
import { registerPdpReviews } from './register_pdp_reviews.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/avn_fitness';

async function seedAvnProducts() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected.');

    // Upsert Categories
    const categoriesData = [
      {
        name: 'Knee Support',
        slug: 'knee-support',
        description: 'Max Compression & Joint Stability',
        image: { url: '/knee-wrap.png', altText: 'AVN Knee Support Wraps' },
        sortOrder: 1,
      },
      {
        name: 'Wrist Support',
        slug: 'wrist-support',
        description: 'Heavy Duty Joint Lock & Wraps',
        image: { url: '/wrist-wrap.png', altText: 'AVN Wrist Support Wraps' },
        sortOrder: 2,
      },
      {
        name: 'Lifting Accessories',
        slug: 'lifting-accessories',
        description: 'Power Straps, Belts & Grip Gear',
        image: { url: '/lifting-straps.png', altText: 'AVN Lifting Accessories' },
        sortOrder: 3,
      },
      {
        name: 'Yoga Accessories',
        slug: 'yoga-accessories',
        description: 'Stretching Straps & Mobility Belts',
        image: { url: '/yoga-belt.png', altText: 'AVN Yoga Stretching Belt' },
        sortOrder: 4,
      },
    ];

    const categoryMap = {};
    for (const catData of categoriesData) {
      const cat = await Category.findOneAndUpdate(
        { slug: catData.slug },
        { ...catData, isActive: true },
        { upsert: true, new: true }
      );
      categoryMap[catData.slug] = cat._id;
      console.log(`Synced Category: ${cat.name} (${cat._id})`);
    }

    // Clean out previous sample products & orphaned categories
    console.log('Clearing old product catalog and orphaned categories...');
    await Category.deleteMany({ slug: { $nin: categoriesData.map((c) => c.slug) } });
    await Product.deleteMany({});

    // Products Data
    const productsData = [
      {
        name: 'KNEE WRAP',
        slug: 'knee-wrap-pro-79',
        category: categoryMap['knee-support'],
        tagline: 'Maximum joint protection for heavy squats and leg presses.',
        description: 'Engineered with heavy-duty elastic compound rubber and premium cotton wrap. Provides maximum rebound support during heavy squats and eliminates knee stiffness under heavy loading.',
        badge: 'BESTSELLER',
        image: '/knee-wrap.png',
        images: [
          { url: '/knee-wrap.png', altText: 'AVN Heavy Duty 79 inch Elastic Knee Wrap', isPrimary: true },
          { url: '/athelete-squat.png', altText: 'In Action Squats' },
        ],
        ratingsAverage: 4.9,
        ratingsCount: 342,
        status: 'active',
        ageGroup: 'adults',
        gender: 'unisex',
        tags: ['knee wrap', 'powerlifting', 'squats', 'rebound', 'knee support'],
        specifications: [
          { key: 'Length', value: '79 inches for full joint coverage' },
          { key: 'Grip', value: 'Dual red rubberized grip lines' },
          { key: 'Closure', value: 'Reinforced hook-and-loop closure' },
          { key: 'Best For', value: 'Powerlifting, Strongman & Heavy Squats' },
          { key: 'Max Load', value: 'Tested up to 450 kg (990 lbs)' },
          { key: 'Warranty', value: '1 Year Full Replacement Guarantee' },
        ],
        fullSpecs: {
          'SKU': 'AVN-KW-79',
          'Material': '70% Heavy Elastic Cotton, 30% Compound Rubber',
          'Dimensions': '79" L x 3" W (200cm x 7.6cm)',
          'Weight': '450g per pair',
          'Closure Type': 'Industrial Grade Hook & Loop (Velcro)',
          'Country of Origin': 'India',
        },
        careInstructions: 'Hand wash in cold water with mild detergent. Air dry flat in shade.',
        variants: [
          {
            sku: 'AVN-KW-79-RED',
            title: 'Crimson Red - Standard 79"',
            size: 'Standard 79"',
            color: 'Crimson Red',
            price: 899,
            compareAtPrice: 1299,
            stockQuantity: 15,
            isActive: true,
          },
          {
            sku: 'AVN-KW-79-BLK',
            title: 'Stealth Black - XL Heavy 90"',
            size: 'XL Heavy 90"',
            color: 'Stealth Black',
            price: 999,
            compareAtPrice: 1399,
            stockQuantity: 12,
            isActive: true,
          },
        ],
      },
      {
        name: 'ELBOW WRAP',
        slug: 'elbow-wrap-compression-sleeve',
        category: categoryMap['knee-support'],
        tagline: 'Compression sleeve for heavy bench press & overhead movements.',
        description: 'Stabilize your elbow joint and prevent tendonitis. Built with high-tension elastic weave for superior compression without restricting blood flow.',
        badge: 'POPULAR',
        image: '/elbow-wrap.png',
        images: [
          { url: '/elbow-wrap.png', altText: 'AVN Compression Elbow Wrap', isPrimary: true },
          { url: '/athelete-squat.png', altText: 'In Action' },
        ],
        ratingsAverage: 4.8,
        ratingsCount: 215,
        status: 'active',
        ageGroup: 'adults',
        gender: 'unisex',
        tags: ['elbow wrap', 'bench press', 'compression', 'overhead press', 'joint support'],
        specifications: [
          { key: 'Material', value: 'High-Density Neoprene & Nylon Blend' },
          { key: 'Thickness', value: '7mm Heavy-Duty Compression Layer' },
          { key: 'Joint Support', value: 'Elbow Joint & Triceps Tendon' },
          { key: 'Max Load', value: 'Tested up to 300 kg (660 lbs)' },
        ],
        fullSpecs: {
          'SKU': 'AVN-EW-01',
          'Weight': '320g per pair',
          'Target Audience': 'Unisex - Adults',
          'Warranty': '1 Year Replacement Guarantee',
          'Country of Origin': 'India',
        },
        careInstructions: 'Hand wash inside out with cold water. Air dry away from direct heat.',
        variants: [
          {
            sku: 'AVN-EW-01-RED-M',
            title: 'Crimson Red - Medium',
            size: 'Medium',
            color: 'Crimson Red',
            price: 699,
            compareAtPrice: 999,
            stockQuantity: 18,
            isActive: true,
          },
          {
            sku: 'AVN-EW-01-BLK-L',
            title: 'Stealth Black - Large',
            size: 'Large',
            color: 'Stealth Black',
            price: 749,
            compareAtPrice: 1049,
            stockQuantity: 14,
            isActive: true,
          },
        ],
      },
      {
        name: 'WRIST WRAP',
        slug: 'wrist-wrap-competition-18',
        category: categoryMap['wrist-support'],
        tagline: 'Lock down your wrists for maximum stability.',
        description: 'Eliminate wrist hyperextension during heavy benching and shoulder presses. Features reinforced thumb loop and heavy duty Velcro.',
        badge: 'HOT',
        image: '/wrist-wrap.png',
        images: [
          { url: '/wrist-wrap.png', altText: 'AVN 18-inch Competition Wrist Wraps', isPrimary: true },
        ],
        ratingsAverage: 4.9,
        ratingsCount: 512,
        status: 'active',
        ageGroup: 'adults',
        gender: 'unisex',
        tags: ['wrist wrap', 'bench press', 'competition', 'heavy duty', 'wrist support'],
        specifications: [
          { key: 'Length', value: '18-inch competition grade wrist support' },
          { key: 'Thumb Loop', value: 'Reinforced heavy duty thumb loop' },
          { key: 'Fastening', value: 'Industrial grade Velcro hook & loop' },
          { key: 'Best For', value: 'Bench Press, Overhead Press, Clean & Jerk' },
        ],
        fullSpecs: {
          'SKU': 'AVN-WW-18',
          'Material': 'Polyester Cotton Elastic Blend',
          'Dimensions': '18" x 3" Standard',
          'Weight': '250g per pair',
          'Warranty': '1 Year Replacement Guarantee',
          'Country of Origin': 'India',
        },
        careInstructions: 'Fasten Velcro strips together before washing. Hand wash cold with mild detergent.',
        variants: [
          {
            sku: 'AVN-WW-18-RED',
            title: 'Crimson Red - 18"',
            size: '18 Inch',
            color: 'Crimson Red',
            price: 499,
            compareAtPrice: 799,
            stockQuantity: 25,
            isActive: true,
          },
          {
            sku: 'AVN-WW-24-BLK',
            title: 'Stealth Black - 24"',
            size: '24 Inch',
            color: 'Stealth Black',
            price: 549,
            compareAtPrice: 849,
            stockQuantity: 20,
            isActive: true,
          },
        ],
      },
      {
        name: 'LIFTING STRAPS',
        slug: 'lifting-straps-deadlift-padded',
        category: categoryMap['lifting-accessories'],
        tagline: 'Unbreakable grip strength for heavy deadlifts & rows.',
        description: 'Take your grip out of the equation and focus on muscle contraction. Neoprene wrist padding prevents chafing while 100% heavy cotton web grips the barbell.',
        badge: 'ESSENTIAL',
        image: '/lifting-straps.png',
        images: [
          { url: '/lifting-straps.png', altText: 'AVN Padded Cotton Lifting Straps', isPrimary: true },
        ],
        ratingsAverage: 4.9,
        ratingsCount: 489,
        status: 'active',
        ageGroup: 'adults',
        gender: 'unisex',
        tags: ['lifting straps', 'deadlifts', 'rows', 'grip strength', 'powerlifting'],
        specifications: [
          { key: 'Material', value: '100% Heavy Duty Cotton Webbing' },
          { key: 'Padding', value: 'Neoprene wrist cushion to prevent skin bruising' },
          { key: 'Length', value: '23-inch length fits all barbell and dumbbell bars' },
          { key: 'Max Load', value: 'Tested to hold up to 350 kg deadlifts' },
        ],
        fullSpecs: {
          'SKU': 'AVN-LS-01',
          'Weight': '180g per pair',
          'Warranty': '1 Year Replacement Guarantee',
          'Country of Origin': 'India',
        },
        careInstructions: 'Hand wash in cold water with mild soap. Air dry away from direct heat.',
        variants: [
          {
            sku: 'AVN-LS-01-BLK',
            title: 'Stealth Black / One Size',
            size: 'Standard',
            color: 'Stealth Black',
            price: 599,
            compareAtPrice: 899,
            stockQuantity: 30,
            isActive: true,
          },
        ],
      },
      {
        name: 'YOGA BELT',
        slug: 'yoga-stretching-belt-cotton',
        category: categoryMap['yoga-accessories'],
        tagline: 'High tensile cotton strap for flexibility and alignment.',
        description: 'Deepen stretches and improve posture safely with non-slip metal D-ring buckle and organic cotton webbing.',
        badge: 'ECO-FRIENDLY',
        image: '/yoga-belt.png',
        images: [
          { url: '/yoga-belt.png', altText: 'AVN Yoga Stretching Belt', isPrimary: true },
        ],
        ratingsAverage: 4.7,
        ratingsCount: 167,
        status: 'active',
        ageGroup: 'all',
        gender: 'unisex',
        tags: ['yoga belt', 'stretching', 'flexibility', 'mobility', 'pilates'],
        specifications: [
          { key: 'Material', value: '100% Organic Cotton Webbing' },
          { key: 'Buckle', value: 'Dual solid alloy D-ring buckle' },
          { key: 'Length', value: '8 feet (244 cm) for full body poses' },
          { key: 'Width', value: '1.5 inches (3.8 cm)' },
        ],
        fullSpecs: {
          'SKU': 'AVN-YB-08',
          'Weight': '160g',
          'Warranty': '1 Year Replacement Guarantee',
          'Country of Origin': 'India',
        },
        careInstructions: 'Machine wash cold on delicate cycle. Air dry flat.',
        variants: [
          {
            sku: 'AVN-YB-08-NAT',
            title: 'Natural Canvas / 8ft',
            size: '8ft Standard',
            color: 'Natural Canvas',
            price: 399,
            compareAtPrice: 699,
            stockQuantity: 40,
            isActive: true,
          },
        ],
      },
      {
        name: 'LEVER WEIGHTLIFTING BELT',
        slug: 'leather-weightlifting-lever-belt',
        category: categoryMap['lifting-accessories'],
        tagline: '10mm competition grade genuine leather lever belt.',
        description: 'Built to meet IPF powerlifting specifications. Ultra-durable steel alloy lever buckle with top-grain genuine leather for maximum intra-abdominal pressure.',
        badge: 'ELITE PRO',
        image: '/knee-wrap.png',
        images: [
          { url: '/knee-wrap.png', altText: 'AVN Leather Weightlifting Lever Belt', isPrimary: true },
        ],
        ratingsAverage: 5.0,
        ratingsCount: 128,
        status: 'active',
        ageGroup: 'adults',
        gender: 'unisex',
        tags: ['lever belt', 'weightlifting', 'powerlifting', 'ipf', 'leather belt', 'squat'],
        specifications: [
          { key: 'Thickness', value: '10mm Competition Standard' },
          { key: 'Material', value: '4-layer Top-Grain Genuine Cowhide Leather' },
          { key: 'Buckle', value: 'Heavy Duty Chrome Finished Alloy Lever' },
          { key: 'Width', value: '4 inches uniform powerlifting cut' },
        ],
        fullSpecs: {
          'SKU': 'AVN-LB-10MM',
          'Weight': '1.3 kg',
          'Warranty': 'Lifetime Lever Buckle Warranty',
          'Country of Origin': 'India',
        },
        careInstructions: 'Wipe with damp cloth and leather conditioner twice a year.',
        variants: [
          {
            sku: 'AVN-LB-10-M',
            title: 'Medium (30"-34") / Stealth Black',
            size: 'Medium (30"-34")',
            color: 'Stealth Black',
            price: 3499,
            compareAtPrice: 4999,
            stockQuantity: 8,
            isActive: true,
          },
          {
            sku: 'AVN-LB-10-L',
            title: 'Large (34"-38") / Stealth Black',
            size: 'Large (34"-38")',
            color: 'Stealth Black',
            price: 3499,
            compareAtPrice: 4999,
            stockQuantity: 10,
            isActive: true,
          },
        ],
      },
      {
        name: 'ANKLE COMPRESSION SLEEVE',
        slug: 'ankle-compression-sleeve-support',
        category: categoryMap['knee-support'],
        tagline: 'Targeted compression for ankle stability and recovery.',
        description: 'High elastic compression sleeve with reinforced heel contour for sprain recovery, running, and heavy squat stability.',
        badge: 'RECOVERY',
        image: '/elbow-wrap.png',
        images: [
          { url: '/elbow-wrap.png', altText: 'AVN Ankle Compression Sleeve', isPrimary: true },
        ],
        ratingsAverage: 4.6,
        ratingsCount: 94,
        status: 'active',
        ageGroup: 'adults',
        gender: 'unisex',
        tags: ['ankle sleeve', 'compression', 'running', 'joint support', 'recovery'],
        specifications: [
          { key: 'Support Level', value: 'Medical-grade 20-30 mmHg compression' },
          { key: 'Fabric', value: '4-way stretch breathable nylon & spandex' },
          { key: 'Fit', value: 'Ergonomic non-slip anatomical heel pocket' },
        ],
        fullSpecs: {
          'SKU': 'AVN-AS-04',
          'Weight': '120g per pair',
          'Warranty': '1 Year Replacement Guarantee',
          'Country of Origin': 'India',
        },
        careInstructions: 'Hand wash cold. Line dry in shade.',
        variants: [
          {
            sku: 'AVN-AS-04-M',
            title: 'Medium (Men 7-9 / Women 8-10)',
            size: 'Medium',
            color: 'Stealth Black',
            price: 449,
            compareAtPrice: 749,
            stockQuantity: 20,
            isActive: true,
          },
          {
            sku: 'AVN-AS-04-L',
            title: 'Large (Men 10-12 / Women 11-13)',
            size: 'Large',
            color: 'Stealth Black',
            price: 449,
            compareAtPrice: 749,
            stockQuantity: 15,
            isActive: true,
          },
        ],
      },
      {
        name: 'LEGACY POWER WRAPS (DISCONTINUED)',
        slug: 'legacy-powerlifting-wraps-discontinued',
        category: categoryMap['knee-support'],
        tagline: 'Legacy model replaced by Knee Wrap Pro 79.',
        description: 'This item has been discontinued and is excluded from search catalog discovery by status governance.',
        badge: 'DISCONTINUED',
        image: '/knee-wrap.png',
        images: [
          { url: '/knee-wrap.png', altText: 'AVN Legacy Power Wraps', isPrimary: true },
        ],
        ratingsAverage: 3.5,
        ratingsCount: 12,
        status: 'discontinued',
        ageGroup: 'adults',
        gender: 'unisex',
        tags: ['legacy', 'discontinued'],
        specifications: [
          { key: 'Status', value: 'Archived legacy product' },
        ],
        fullSpecs: {
          'SKU': 'AVN-LEGACY-00',
        },
        careInstructions: 'N/A',
        variants: [
          {
            sku: 'AVN-LEGACY-00-STD',
            title: 'Standard (Archived)',
            size: 'Standard',
            color: 'Black',
            price: 299,
            compareAtPrice: 599,
            stockQuantity: 0,
            isActive: false,
          },
        ],
      },
    ];

    for (const pData of productsData) {
      const p = await Product.create(pData);
      console.log(`Created Product: ${p.name} [${p.slug}] with ${p.variants.length} variants`);
    }

    // Seed verified PDP reviews into MongoDB
    await registerPdpReviews();

    console.log('Finished seeding all AVN products and reviews successfully!');
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error seeding AVN products:', error);
    process.exit(1);
  }
}

seedAvnProducts();
