import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../src/models/user.model.js';
import { Admin } from '../src/models/admin.model.js';
import { Staff, STAFF_ROLES } from '../src/models/staff.model.js';
import { Category } from '../src/models/category.model.js';
import { Product } from '../src/models/product.model.js';
import { Inventory } from '../src/models/inventory.model.js';
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
    console.log('Connecting to MongoDB for non-destructive seeding...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB.');

    // 1. Seed Super Admin into dedicated Admin collection (admin_m)
    console.log('\n--- Checking Root Admin Account (admin_m) ---');
    let rootAdmin = await Admin.findOne({ email: 'admin@avnfitness.com' });
    if (!rootAdmin) {
      rootAdmin = await Admin.create({
        name: 'Super Administrator',
        email: 'admin@avnfitness.com',
        password: 'Admin@123456',
        role: 'super_admin',
        phone: '+919876543210',
        isActive: true,
      });
      console.log(' -> Created Root Admin in admin_m: admin@avnfitness.com');
    } else {
      console.log(' -> Root Admin exists in admin_m: admin@avnfitness.com (preserved)');
    }

    // Clean up any duplicate admin record from staff_m so staff_m is strictly departmental staff
    await Staff.deleteOne({ email: 'admin@avnfitness.com' });

    // 2. Seed Departmental Staff Accounts into Staff collection (staff_m)
    console.log('\n--- Checking Departmental Staff Accounts (staff_m) ---');
    const departmentalStaff = [
      {
        name: 'Operations Manager',
        email: 'ops@avnfitness.com',
        password: 'Ops@123456',
        role: STAFF_ROLES.OPERATIONS,
        phone: '+919876543211',
        isActive: true,
      },
      {
        name: 'Product & Inventory Manager',
        email: 'product.manager@avnfitness.com',
        password: 'Product@123456',
        role: STAFF_ROLES.PRODUCT_INVENTORY_MANAGER,
        phone: '+919876543213',
        isActive: true,
      },
      {
        name: 'Order & Logistics Manager',
        email: 'order.manager@avnfitness.com',
        password: 'Order@123456',
        role: STAFF_ROLES.ORDER_MANAGER,
        phone: '+919876543214',
        isActive: true,
      },
      {
        name: 'Customer Support Lead',
        email: 'support@avnfitness.com',
        password: 'Support@123456',
        role: STAFF_ROLES.CUSTOMER_SUPPORT,
        phone: '+919876543215',
        isActive: true,
      },
      {
        name: 'Marketing & Campaigns Lead',
        email: 'marketing@avnfitness.com',
        password: 'Marketing@123456',
        role: STAFF_ROLES.MARKETING_MANAGER,
        phone: '+919876543216',
        isActive: true,
      },
      {
        name: 'Finance & Payouts Lead',
        email: 'finance@avnfitness.com',
        password: 'Finance@123456',
        role: STAFF_ROLES.FINANCE_MANAGER,
        phone: '+919876543217',
        isActive: true,
      },
    ];

    for (const staffMember of departmentalStaff) {
      let existing = await Staff.findOne({ email: staffMember.email });
      if (!existing) {
        await Staff.create(staffMember);
        console.log(` -> Created Staff in staff_m: ${staffMember.email} [${staffMember.role}]`);
      } else {
        console.log(` -> Staff exists in staff_m: ${staffMember.email} (preserved)`);
      }
    }

    // 3. Demo Customer Account (Only if does not exist, preserving all real customer users in 'users')
    console.log('\n--- Checking Demo Customer Account (users) ---');
    const demoCustomerEmail = 'rahul.sharma@example.com';
    let customerUser = await User.findOne({ email: demoCustomerEmail });
    if (!customerUser) {
      customerUser = await User.create({
        name: 'Rahul Sharma',
        email: demoCustomerEmail,
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
      console.log(' -> Created demo customer in users: rahul.sharma@example.com');
    } else {
      console.log(' -> Demo customer in users already exists (preserved)');
    }

    // 4. Ensure Categories (Non-destructive)
    console.log('\n--- Checking Categories ---');
    const categoriesData = [
      {
        name: 'Gym Supporters & Briefs',
        slug: 'gym-supporters-briefs',
        description: 'Premium elastic compression gym supporters designed for high-intensity powerlifting, running, and abdominal protection.',
      },
      {
        name: 'Resistance & Loop Bands',
        slug: 'resistance-loop-bands',
        description: 'Latex and fabric resistance loops for mobility, strength conditioning, and progressive overload warmups.',
      },
      {
        name: 'Weightlifting Accessories',
        slug: 'weightlifting-accessories',
        description: 'Lifting straps, heavy-duty wrist wraps, chalk blocks, and knee sleeves for serious lifters.',
      },
      {
        name: 'Shakers & Hydration',
        slug: 'shakers-hydration',
        description: 'BPA-free protein shakers, leak-proof steel water bottles, and pre-workout mixing containers.',
      },
    ];

    const categoryMap = {};
    for (const cat of categoriesData) {
      let existingCat = await Category.findOne({ slug: cat.slug });
      if (!existingCat) {
        existingCat = await Category.create(cat);
        console.log(` -> Created category: ${cat.name}`);
      } else {
        console.log(` -> Category exists: ${cat.name} (preserved)`);
      }
      categoryMap[cat.slug] = existingCat;
    }

    // 5. Ensure Products (Non-destructive)
    console.log('\n--- Checking Products ---');
    const productsData = [
      {
        name: 'AVN Pro Ergonomic Gym Supporter Brief',
        slug: 'avn-pro-ergonomic-gym-supporter-brief',
        description: 'Heavy duty moisture-wicking athletic supporter brief featuring a 3.5-inch anti-roll elastic waistband, reinforced dual-layer pouch, and soft leg straps for zero chafing during heavy squats and sprints.',
        category: categoryMap['gym-supporters-briefs']?._id,
        ageGroup: AGE_GROUPS.ADULTS,
        gender: GENDERS.MEN,
        status: PRODUCT_STATUS.ACTIVE,
        images: [
          {
            url: 'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?auto=format&fit=crop&w=800&q=80',
            altText: 'Gym Supporter Front View',
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
        category: categoryMap['resistance-loop-bands']?._id,
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
        category: categoryMap['weightlifting-accessories']?._id,
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
        category: categoryMap['shakers-hydration']?._id,
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
    ];

    for (const p of productsData) {
      if (p.category) {
        const existingP = await Product.findOne({ slug: p.slug });
        if (!existingP) {
          await Product.create(p);
          console.log(` -> Created Product: ${p.name}`);
        } else {
          console.log(` -> Product exists: ${p.name} (preserved)`);
        }
      }
    }

    // 6. Ensure Coupons (Non-destructive)
    
    // Sync all product variant SKUs into dedicated inventory_m collection
    console.log('\n--- Populating Inventory Collection (inventory_m) ---');
    const allProducts = await Product.find({});
    for (const prod of allProducts) {
      for (const v of prod.variants || []) {
        await Inventory.findOneAndUpdate(
          { sku: v.sku },
          {
            product: prod._id,
            productName: prod.name,
            sku: v.sku,
            variantTitle: v.title || `${v.size || ''} ${v.color || ''}`.trim() || 'Standard',
            size: v.size || 'Standard',
            color: v.color || 'Standard',
            stockQuantity: Number(v.stockQuantity) || 0,
            price: Number(v.price) || 0,
            lastRestockedAt: new Date(),
          },
          { upsert: true }
        );
        console.log(` -> Synced SKU to inventory_m: ${v.sku} (Stock: ${v.stockQuantity})`);
      }
    }

    console.log('\n--- Checking Coupons ---');
    const now = new Date();
    const expiryDate = new Date();
    expiryDate.setFullYear(now.getFullYear() + 1);

    const couponsData = [
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
    ];

    for (const c of couponsData) {
      const existingCoupon = await Coupon.findOne({ code: c.code });
      if (!existingCoupon) {
        await Coupon.create(c);
        console.log(` -> Created Coupon: ${c.code}`);
      } else {
        console.log(` -> Coupon exists: ${c.code} (preserved)`);
      }
    }

    console.log('\n==================================================');
    console.log(' Non-Destructive Seeding Completed!');
    console.log(' Root Super Admin is in "admin_m" collection.');
    console.log(' Departmental Staff accounts are in "staff_m" collection.');
    console.log(' Customer accounts are in "users" collection.');
    console.log('==================================================\n');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Seeding Error:', error);
    process.exit(1);
  }
};

seedDatabase();
