import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../src/models/user.model.js';
import { Category } from '../src/models/category.model.js';
import { Product } from '../src/models/product.model.js';
import { Coupon } from '../src/models/coupon.model.js';
import {
  AGE_GROUPS,
  DISCOUNT_TYPE,
  GENDERS,
  PRODUCT_STATUS,
  ROLES,
} from '../src/config/constants.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/avn_fitness';

const seedDatabase = async () => {
  try {
    console.log('Connecting to MongoDB for seeding...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB.');

    // Clear existing collections
    console.log('Clearing existing collections...');
    await Promise.all([
      User.deleteMany({}),
      Category.deleteMany({}),
      Product.deleteMany({}),
      Coupon.deleteMany({}),
    ]);

    // 1. Seed Users
    console.log('Seeding initial business & customer users...');
    const adminUser = await User.create({
      name: 'Super Administrator',
      email: 'admin@avnfitness.com',
      password: 'Admin@123456',
      role: ROLES.ADMIN,
      phone: '+919876543210',
      isActive: true,
    });

    const opsUser = await User.create({
      name: 'Operations Manager',
      email: 'ops@avnfitness.com',
      password: 'Ops@123456',
      role: ROLES.OPERATIONS,
      phone: '+919876543211',
      isActive: true,
    });

    const customerUser = await User.create({
      name: 'Rahul Sharma',
      email: 'rahul.sharma@example.com',
      password: 'Customer@123456',
      role: ROLES.USER,
      phone: '+919876543212',
      isActive: true,
      addresses: [
        {
          title: 'Home',
          fullName: 'Rahul Sharma',
          phone: '+919876543212',
          street: 'Flat 402, Green Valley Apartments, Indiranagar',
          city: 'Bengaluru',
          state: 'Karnataka',
          pincode: '560038',
          country: 'India',
          isDefault: true,
        },
      ],
    });

    // 2. Seed Categories
    console.log('Seeding lightweight fitness gear categories...');
    const supporterCat = await Category.create({
      name: 'Supporters & Protection',
      slug: 'supporters-and-protection',
      description: 'Gym supporters, compression gear, knee & elbow sleeves for joint protection.',
      sortOrder: 1,
    });

    const bandsCat = await Category.create({
      name: 'Resistance Bands',
      slug: 'resistance-bands',
      description: 'Loop resistance bands, tube bands, and strength training elastic gear.',
      sortOrder: 2,
    });

    const weightsCat = await Category.create({
      name: 'Lightweight Weights',
      slug: 'lightweight-weights',
      description: 'Neoprene dumbbells, kettlebells, and wearable ankle/wrist weights.',
      sortOrder: 3,
    });

    const shakersCat = await Category.create({
      name: 'Shakers & Hydration',
      slug: 'shakers-and-hydration',
      description: 'BPA-free protein shakers, insulated gym bottles, and wire-whisk blenders.',
      sortOrder: 4,
    });

    const accessoriesCat = await Category.create({
      name: 'Gym Accessories',
      slug: 'gym-accessories',
      description: 'Wrist wraps, heavy duty lifting straps, workout gloves, and speed ropes.',
      sortOrder: 5,
    });

    // 3. Seed Products
    console.log('Seeding initial fitness products with variants...');
    await Product.create([
      {
        name: 'AVN Pro Ergonomic Gym Supporter',
        slug: 'avn-pro-ergonomic-gym-supporter',
        description: 'Engineered for high-intensity lifting, squats, and running. High-grade breathable cotton-spandex blend with reinforced wide elastic waistband for maximum core and groin support.',
        category: supporterCat._id,
        ageGroup: AGE_GROUPS.ADULTS,
        gender: GENDERS.MEN,
        status: PRODUCT_STATUS.ACTIVE,
        images: [
          {
            url: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=800&q=80',
            altText: 'AVN Pro Gym Supporter Front View',
            isPrimary: true,
          },
        ],
        specifications: [
          { key: 'Material', value: '85% Combed Cotton, 15% Spandex Elastic' },
          { key: 'Waistband', value: '3.5-inch Reinforced Anti-Roll Band' },
          { key: 'Care', value: 'Machine wash cold, air dry' },
        ],
        sizeGuide: {
          instructions: 'Measure around natural waistline above hip bones.',
        },
        variants: [
          {
            sku: 'SUP-PRO-BLK-S',
            title: 'Small (28-30 in) / Classic Black',
            size: 'S',
            color: 'Black',
            price: 499,
            compareAtPrice: 699,
            stockQuantity: 50,
            isActive: true,
          },
          {
            sku: 'SUP-PRO-BLK-M',
            title: 'Medium (31-33 in) / Classic Black',
            size: 'M',
            color: 'Black',
            price: 499,
            compareAtPrice: 699,
            stockQuantity: 75,
            isActive: true,
          },
          {
            sku: 'SUP-PRO-BLK-L',
            title: 'Large (34-36 in) / Classic Black',
            size: 'L',
            color: 'Black',
            price: 499,
            compareAtPrice: 699,
            stockQuantity: 60,
            isActive: true,
          },
          {
            sku: 'SUP-PRO-BLK-XL',
            title: 'X-Large (37-40 in) / Classic Black',
            size: 'XL',
            color: 'Black',
            price: 549,
            compareAtPrice: 749,
            stockQuantity: 40,
            isActive: true,
          },
        ],
        ratingsAverage: 4.8,
        ratingsCount: 42,
        tags: ['supporter', 'protection', 'men', 'gym-wear'],
      },
      {
        name: 'AVN Heavy-Duty Resistance Loop Bands (Set of 5)',
        slug: 'avn-heavy-duty-resistance-loop-bands-set-of-5',
        description: '100% natural Malaysian latex resistance loop bands for warmups, glute activation, physical therapy, and pullup assistance. Color-coded resistance from Extra Light to Extra Heavy.',
        category: bandsCat._id,
        ageGroup: AGE_GROUPS.ALL,
        gender: GENDERS.UNISEX,
        status: PRODUCT_STATUS.ACTIVE,
        images: [
          {
            url: 'https://images.unsplash.com/photo-1598289431512-b97b0917affc?auto=format&fit=crop&w=800&q=80',
            altText: 'Resistance Bands Set',
            isPrimary: true,
          },
        ],
        specifications: [
          { key: 'Material', value: '100% Natural Latex' },
          { key: 'Levels', value: '5-10 lbs, 10-15 lbs, 15-20 lbs, 25-30 lbs, 35-40 lbs' },
          { key: 'Included', value: '5 Bands, Carry Pouch, Workout Manual' },
        ],
        variants: [
          {
            sku: 'BND-SET-5-STD',
            title: 'Standard Set of 5 Bands with Carry Pouch',
            packQuantity: 5,
            price: 799,
            compareAtPrice: 1299,
            stockQuantity: 120,
            isActive: true,
          },
        ],
        ratingsAverage: 4.9,
        ratingsCount: 128,
        tags: ['bands', 'resistance', 'calisthenics', 'home-workout'],
      },
      {
        name: 'AVN Pro Wrist Wraps (Pair)',
        slug: 'avn-pro-wrist-wraps-pair',
        description: '18-inch heavy duty elastic wrist wraps with reinforced thumb loops and industrial strength hook-and-loop closure for bench press, overhead presses, and Olympic lifts.',
        category: accessoriesCat._id,
        ageGroup: AGE_GROUPS.ALL,
        gender: GENDERS.UNISEX,
        status: PRODUCT_STATUS.ACTIVE,
        images: [
          {
            url: 'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?auto=format&fit=crop&w=800&q=80',
            altText: 'Wrist Wraps Pair',
            isPrimary: true,
          },
        ],
        specifications: [
          { key: 'Length', value: '18 inches' },
          { key: 'Closure', value: 'Heavy Duty Velcro' },
          { key: 'Material', value: 'Woven Cotton Elastic' },
        ],
        variants: [
          {
            sku: 'WRP-BLK-RED',
            title: 'Black & Stealth Red / 18 inch',
            color: 'Black/Red',
            price: 449,
            compareAtPrice: 699,
            stockQuantity: 90,
            isActive: true,
          },
          {
            sku: 'WRP-MIL-GRN',
            title: 'Military Green / 18 inch',
            color: 'Military Green',
            price: 449,
            compareAtPrice: 699,
            stockQuantity: 50,
            isActive: true,
          },
        ],
        ratingsAverage: 4.7,
        ratingsCount: 65,
        tags: ['wraps', 'accessories', 'powerlifting', 'wrist-support'],
      },
      {
        name: 'AVN Cyclone 700ml Protein Shaker Bottle',
        slug: 'avn-cyclone-700ml-protein-shaker-bottle',
        description: 'Leak-proof BPA-free gym shaker with stainless steel wire whisk ball, embossed measurement markings, and built-in pill organizer compartment.',
        category: shakersCat._id,
        ageGroup: AGE_GROUPS.ALL,
        gender: GENDERS.UNISEX,
        status: PRODUCT_STATUS.ACTIVE,
        images: [
          {
            url: 'https://images.unsplash.com/photo-1546483875-ad9014c88eba?auto=format&fit=crop&w=800&q=80',
            altText: 'Protein Shaker Bottle',
            isPrimary: true,
          },
        ],
        specifications: [
          { key: 'Capacity', value: '700 ml (24 oz)' },
          { key: 'Material', value: '100% BPA Free Food Grade PP' },
          { key: 'Lid', value: 'Leak-proof flip cap with carry loop' },
        ],
        variants: [
          {
            sku: 'SHK-CYC-700-BLK',
            title: 'Matte Black / 700ml',
            color: 'Matte Black',
            price: 349,
            compareAtPrice: 499,
            stockQuantity: 150,
            isActive: true,
          },
          {
            sku: 'SHK-CYC-700-BLU',
            title: 'Ocean Blue / 700ml',
            color: 'Ocean Blue',
            price: 349,
            compareAtPrice: 499,
            stockQuantity: 100,
            isActive: true,
          },
        ],
        ratingsAverage: 4.6,
        ratingsCount: 89,
        tags: ['shaker', 'hydration', 'bottle', 'supplements'],
      },
    ]);

    // 4. Seed Coupons
    console.log('Seeding initial promotional coupons...');
    const now = new Date();
    const expiryDate = new Date();
    expiryDate.setFullYear(now.getFullYear() + 1); // 1 year validity

    await Coupon.create([
      {
        code: 'WELCOME10',
        description: '10% instant discount on your first fitness gear order',
        discountType: DISCOUNT_TYPE.PERCENTAGE,
        discountValue: 10,
        minCartValue: 499,
        maxDiscountAmount: 300,
        startDate: now,
        endDate: expiryDate,
        usageLimitTotal: 10000,
        usageLimitPerUser: 1,
        isActive: true,
      },
      {
        code: 'FIT100',
        description: 'Flat ₹100 discount on orders above ₹999',
        discountType: DISCOUNT_TYPE.FIXED,
        discountValue: 100,
        minCartValue: 999,
        startDate: now,
        endDate: expiryDate,
        usageLimitTotal: 5000,
        usageLimitPerUser: 2,
        isActive: true,
      },
    ]);

    console.log('==================================================');
    console.log(' Database Seeding Completed Successfully!');
    console.log(' Super Admin User: admin@avnfitness.com / Admin@123456');
    console.log(' Operations User : ops@avnfitness.com / Ops@123456');
    console.log(' Customer User   : rahul.sharma@example.com / Customer@123456');
    console.log(' Active Coupons  : WELCOME10, FIT100');
    console.log('==================================================');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Seeding Error:', error);
    process.exit(1);
  }
};

seedDatabase();
