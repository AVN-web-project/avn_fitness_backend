import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../src/models/user.model.js';
import { Product } from '../src/models/product.model.js';
import { Review } from '../src/models/review.model.js';
import { REVIEW_STATUS, ROLES } from '../src/config/constants.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/avn_fitness';

export const PDP_REVIEWS_DATA = [
  {
    productSlug: 'knee-wrap-pro-79',
    reviews: [
      {
        author: 'Vikram S.',
        email: 'vikram.s@athlete.avngear.com',
        rating: 5,
        date: '2026-08-14',
        title: 'Insane rebound out of the hole!',
        comment: 'Hit a 220kg PR squat with these wraps. The rubberized grip prevents any slip during heavy sets. Absolutely essential for powerlifters.',
        helpful: 48,
      },
      {
        author: 'Rahul Verma',
        email: 'rahul.verma@athlete.avngear.com',
        rating: 5,
        date: '2026-08-02',
        title: 'Best knee wraps in India right now',
        comment: 'Quality feels super premium, just like SBD or Gangsta wraps but at a fraction of the cost. Rubber grip lines lock down perfectly.',
        helpful: 29,
      },
      {
        author: 'Ananya Sharma',
        email: 'ananya.sharma@athlete.avngear.com',
        rating: 4,
        date: '2026-07-21',
        title: 'Very stiff, takes time to break in',
        comment: 'Super tough material. It took me a couple of sessions to get used to the tension, but support is unmatched.',
        helpful: 14,
      },
    ],
  },
  {
    productSlug: 'elbow-wrap-compression-sleeve',
    reviews: [
      {
        author: 'Karan M.',
        email: 'karan.m@athlete.avngear.com',
        rating: 5,
        date: '2026-08-10',
        title: 'Saved my elbows on heavy bench days',
        comment: 'I used to get severe elbow pain after 140kg bench presses. These wraps kept my joints warm and pain-free!',
        helpful: 32,
      },
      {
        author: 'Devraj P.',
        email: 'devraj.p@athlete.avngear.com',
        rating: 5,
        date: '2026-07-28',
        title: 'Perfect compression',
        comment: 'Great fit and snug feeling. Doesn’t slide down during overhead presses.',
        helpful: 19,
      },
    ],
  },
  {
    productSlug: 'wrist-wrap-competition-18',
    reviews: [
      {
        author: 'Amitabh R.',
        email: 'amitabh.r@athlete.avngear.com',
        rating: 5,
        date: '2026-08-18',
        title: 'Rock solid wrist locking',
        comment: 'My wrists used to bend backward during heavy bench press. These wraps lock my wrists completely straight like iron bars.',
        helpful: 61,
      },
      {
        author: 'Siddharth G.',
        email: 'siddharth.g@athlete.avngear.com',
        rating: 5,
        date: '2026-08-05',
        title: 'Unbeatable value',
        comment: 'High quality Velcro, thick elastic material. The thumb loop is heavy duty and doesn’t tear.',
        helpful: 24,
      },
    ],
  },
  {
    productSlug: 'lifting-straps-deadlift-padded',
    reviews: [
      {
        author: 'Rohan Mehta',
        email: 'rohan.mehta@athlete.avngear.com',
        rating: 5,
        date: '2026-08-12',
        title: 'Pulled 260kg deadlift effortlessly!',
        comment: 'No wrist dig, no skin pinching thanks to the neoprene padding. Cotton grip bites onto the knurling like glue.',
        helpful: 55,
      },
      {
        author: 'Priya K.',
        email: 'priya.k@athlete.avngear.com',
        rating: 5,
        date: '2026-07-30',
        title: 'Must have for heavy back days',
        comment: 'Helps me target my lats without my grip giving out early on dumbbell rows.',
        helpful: 31,
      },
    ],
  },
  {
    productSlug: 'yoga-stretching-belt-cotton',
    reviews: [
      {
        author: 'Neha Kapoor',
        email: 'neha.kapoor@athlete.avngear.com',
        rating: 5,
        date: '2026-08-01',
        title: 'Great for hamstring flexibility',
        comment: 'Strong cotton material and smooth steel rings. Holds firmly without slipping during deep stretches.',
        helpful: 18,
      },
    ],
  },
  {
    productSlug: 'leather-weightlifting-lever-belt',
    reviews: [
      {
        author: 'Deepak N.',
        email: 'deepak.n@athlete.avngear.com',
        rating: 5,
        date: '2026-08-11',
        title: 'Absolute monster belt',
        comment: 'Locks tight and gives insane core stability!',
        helpful: 39,
      },
    ],
  },
  {
    productSlug: 'ankle-compression-sleeve-support',
    reviews: [
      {
        author: 'Sameer Joshi',
        email: 'sameer.joshi@athlete.avngear.com',
        rating: 5,
        date: '2026-08-15',
        title: 'Great ankle support during squats & lunges',
        comment: 'The targeted compression keeps my ankle stable after a mild sprain. Fits inside lifting shoes comfortably.',
        helpful: 22,
      },
    ],
  },
];

export async function registerPdpReviews() {
  console.log('--- Registering PDP Dummy Reviews into MongoDB ---');
  let createdUsers = 0;
  let registeredReviews = 0;

  for (const group of PDP_REVIEWS_DATA) {
    const product = await Product.findOne({ slug: group.productSlug });
    if (!product) {
      console.warn(`⚠️ Product with slug "${group.productSlug}" not found in MongoDB. Skipping.`);
      continue;
    }

    for (const rev of group.reviews) {
      // 1. Ensure author user account exists
      let user = await User.findOne({ email: rev.email });
      if (!user) {
        user = await User.create({
          name: rev.author,
          email: rev.email,
          password: 'Athlete@123456',
          phone: '+919876500000',
          role: ROLES.USER,
          authProvider: 'local',
          isActive: true,
        });
        createdUsers++;
      }

      // 2. Upsert review document
      const reviewDate = new Date(rev.date);
      const review = await Review.findOneAndUpdate(
        { product: product._id, user: user._id },
        {
          product: product._id,
          user: user._id,
          rating: rev.rating,
          title: rev.title,
          comment: rev.comment,
          helpful: rev.helpful || 0,
          status: REVIEW_STATUS.PUBLISHED,
          isVerifiedPurchase: true,
          createdAt: reviewDate,
          updatedAt: reviewDate,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      registeredReviews++;
      console.log(`  ✓ Registered review by ${rev.author} for [${product.slug}]: "${rev.title}"`);
    }

    // 3. Recompute product rating aggregates
    const stats = await Review.aggregate([
      { $match: { product: product._id, status: REVIEW_STATUS.PUBLISHED } },
      {
        $group: {
          _id: '$product',
          avgRating: { $avg: '$rating' },
          numReviews: { $sum: 1 },
        },
      },
    ]);

    if (stats.length > 0) {
      const avg = Math.round(stats[0].avgRating * 10) / 10;
      const count = stats[0].numReviews;
      await Product.findByIdAndUpdate(product._id, {
        ratingsAverage: avg,
        ratingsCount: count,
      });
      console.log(`  ⭐ Updated [${product.slug}] rating stats: ${avg} avg across ${count} published reviews`);
    }
  }

  console.log(`\n✅ Summary: Created ${createdUsers} reviewer accounts, registered ${registeredReviews} reviews.`);
}

async function run() {
  try {
    console.log(`Connecting to MongoDB at ${MONGODB_URI}...`);
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB.');

    await registerPdpReviews();

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
    process.exit(0);
  } catch (error) {
    console.error('Error registering PDP reviews:', error);
    process.exit(1);
  }
}

// Run if called directly
if (process.argv[1]?.endsWith('register_pdp_reviews.js')) {
  run();
}
