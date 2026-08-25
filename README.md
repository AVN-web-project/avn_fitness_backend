# Commercial Fitness Gear E-Commerce Platform — Backend API

Modern, scalable, and secure RESTful backend API built with **Node.js**, **Express.js**, and **MongoDB (Mongoose)** for direct-to-consumer (D2C) lightweight fitness gear e-commerce.

---

## Architecture Overview

```
avn_fitness_backend/
├── docs/                                # Project technical & functional specifications
├── src/
│   ├── config/                          # Environment, database, logger, constants & enums
│   ├── middlewares/                     # JWT Auth, RBAC, Rate Limiting, Error handling, Activity Logger
│   ├── models/                          # Mongoose Schemas & Models
│   │   ├── user.model.js                # Users, Address book & Roles
│   │   ├── product.model.js             # Products, Variants/SKUs & Non-delete status lifecycle
│   │   ├── category.model.js            # Hierarchical Categories & Subcategories
│   │   ├── cart.model.js                # Guest (x-guest-id) and Authenticated Carts
│   │   ├── order.model.js               # Orders, Status History & Return/Refund tracking
│   │   ├── payment.model.js             # Payment records
│   │   ├── shipment.model.js            # Carrier dispatch & parcel tracking
│   │   ├── coupon.model.js              # Coupon campaigns & eligibility rules
│   │   ├── review.model.js              # Ratings, Reviews & Content Moderation
│   │   ├── support.model.js             # Support tickets & Customer Care inquiries
│   │   └── activityLog.model.js         # Immutable Audit Trail / Logbook
│   ├── modules/                         # Modular domain controllers & routes
│   │   ├── auth/                        # Register, Login, Logout, Profile, Addresses
│   │   ├── products/                    # Catalog queries (filter/sort), Admin CRUD & Inventory
│   │   ├── categories/                  # Category tree & admin endpoints
│   │   ├── cart/                        # Cart calculation, sync & coupon application
│   │   ├── checkout/                    # Authenticated checkout initiation & payment verification
│   │   ├── orders/                      # Customer order tracking, cancellations & returns
│   │   ├── operations/                  # Dispatch queue, fulfillment & refund execution
│   │   ├── admin/                       # Audit logs, analytics & user governance
│   │   ├── coupons/                     # Promotional campaigns
│   │   ├── reviews/                     # Review submission & moderation
│   │   ├── support/                     # Support inquiries & ticket workflow
│   │   └── health/                      # Health check & system diagnostics
│   ├── utils/                           # ApiError, ApiResponse, asyncHandler, orderStateMachine
│   ├── app.js                           # Express application configuration
│   └── server.js                        # Server entry point & lifecycle hooks
├── scripts/
│   └── seed.js                          # Database seeder (Admin, Ops, Products, Coupons)
├── .env.example                         # Environment configuration template
└── package.json
```

---

## Core Business Rules & Invariants

1. **Guest Checkout Disabled**: Guests can freely browse products, filter/search, and add items to a guest cart. However, checkout requires authentication.
2. **Product Non-Deletion Policy**: Products cannot be permanently deleted. Instead, they transition between `active`, `unavailable`, and `discontinued`.
3. **Activity Log / Audit Trail**: Every operational and administrative staff action generates an audit entry in the `ActivityLog` collection (`PRODUCT_CREATED`, `ORDER_STATUS_CHANGED`, `RETURN_APPROVED`, `REFUND_RECORDED`, etc.).
4. **Order State Machine**: Strict transition validations:
   `Pending Payment` → `Paid / Confirmed` → `Processing` → `Shipped` → `Delivered`.
   Alternative flows: `Cancelled`, `Return Requested` → `Returned` → `Refunded`.
5. **Role-Based Access Control (RBAC)**:
   - `user`: Customer account
   - `operations`: Daily fulfillment, dispatch, return review, customer care, review moderation
   - `admin`: Full platform governance, catalog CRUD, audit logs, analytics, fallback operations access.

---

## Getting Started

### 1. Prerequisites
- **Node.js** >= 20.0.0
- **MongoDB** running locally or via MongoDB Atlas

### 2. Installation
```bash
npm install
```

### 3. Environment Configuration
Copy `.env.example` to `.env` and adjust settings:
```bash
cp .env.example .env
```

### 4. Seed Database (Optional)
Populates initial Admin, Operations user, sample customer, lightweight fitness categories, and products:
```bash
npm run seed
```

Default seeded credentials:
- **Admin**: `admin@avnfitness.com` / `Admin@123456`
- **Operations**: `ops@avnfitness.com` / `Ops@123456`
- **Customer**: `rahul.sharma@example.com` / `Customer@123456`

### 5. Start Application
```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

---

## Key API Endpoints

### Health & Diagnostics
- `GET /health` or `GET /api/v1/health`

### Authentication & Profile (`/api/v1/auth`)
- `POST /register` - Register customer account
- `POST /login` - Log in (User / Operations / Admin)
- `POST /logout` - Log out & clear auth cookie
- `GET /profile` - Get authenticated profile
- `POST /addresses` - Add address to address book

### Catalog & Products (`/api/v1/products`)
- `GET /` - List & filter products (`category`, `gender`, `ageGroup`, `minPrice`, `maxPrice`, `search`, `sort`)
- `GET /:slug` - Product details by slug
- `POST /` - (Admin) Create product with variants
- `PATCH /:id` - (Admin) Update product details
- `PATCH /:id/status` - (Admin) Change status (`active` | `unavailable` | `discontinued`)
- `PATCH /:id/inventory` - (Ops/Admin) Update variant stock quantity

### Cart (`/api/v1/cart`)
- `GET /` - Retrieve cart & bill summary (supports guest via `x-guest-id` or auth user)
- `POST /items` - Add item/variant to cart
- `PATCH /items/:itemId` - Update quantity
- `DELETE /items/:itemId` - Remove item
- `POST /apply-coupon` - Apply promotional coupon
- `POST /remove-coupon` - Remove coupon

### Checkout & Payments (`/api/v1/checkout`)
- `POST /create-order` - Initialize checkout order (Auth required)
- `POST /verify-payment` - Verify payment and transition order to `paid_confirmed`

### Customer Orders (`/api/v1/orders`)
- `GET /` - Customer order history
- `GET /:id` - Customer order details
- `POST /:id/cancel` - Cancel unfulfilled order
- `POST /:id/return` - Submit return request for delivered order

### Operations Workflows (`/api/v1/operations`)
- `GET /dashboard` - Dispatch queue stats & low stock alerts
- `GET /orders` - Operations order queue
- `PATCH /orders/:id/status` - Update order state
- `PATCH /orders/:id/dispatch` - Mark as Shipped & assign carrier tracking
- `PATCH /orders/:id/deliver` - Confirm delivery
- `POST /orders/:id/returns/review` - Approve/reject return request
- `POST /orders/:id/refund` - Record completed refund

### Admin Governance (`/api/v1/admin`)
- `GET /activity-logs` - Query searchable audit logbook
- `GET /analytics` - Business revenue, AOV, order distribution
- `GET /users` - Manage registered users
- `PATCH /users/:id/toggle-status` - Activate / deactivate user
