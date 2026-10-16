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
