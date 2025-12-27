# Podlove Backend - AI-Powered Dating Platform

A sophisticated dating platform backend with **bidirectional AI-powered matching** using vector similarity search.

## 🎯 Overview

This is a Node.js/TypeScript backend that powers a dating application with intelligent matchmaking capabilities. The system uses:

- **MongoDB** - Primary database for user profiles and data
- **Pinecone** - Vector database for AI-powered similarity search
- **HuggingFace** - Free embedding generation for semantic understanding
- **OpenAI** - Compatibility scoring and content moderation
- **Express.js** - REST API server
- **Socket.io** - Real-time chat functionality

## ✨ Key Features

### 🤖 Bidirectional AI Matching
- **Dual Vector Storage** - Each user has 2 vectors: profile (who they are) + preferences (what they want)
- **Mutual Compatibility** - Matches only when BOTH users are compatible with each other
- **Semantic Understanding** - AI understands personality, interests, and values beyond simple filters
- **Graceful Fallback** - Falls back to OpenAI compatibility scoring if vector search fails

### 🎯 Smart Filtering
- **MongoDB Hard Filters** - Gender, age, body type, ethnicity preferences
- **Distance Enforcement** - Strict distance filtering after AI scoring
- **Complete Profiles Only** - Only shows matches with complete profiles
- **Subscription-Based Limits** - Different match counts for different subscription tiers

### 🔄 Automatic Syncing
- **Real-time Updates** - Profile changes automatically sync to Pinecone
- **Non-blocking** - Syncing happens in background, doesn't slow down APIs
- **Incremental Profiles** - Stores all profiles, indexes complete and incomplete

### 📱 Additional Features
- User authentication with JWT
- Phone verification via Twilio
- Email notifications
- Bio content moderation (OpenAI)
- Real-time chat with Socket.io
- Podcast scheduling for matched users
- Stripe payment integration
- File uploads (avatars, recordings)

## 🏗️ Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────────┐
│           Express.js REST API                │
│  ┌─────────────────────────────────────┐   │
│  │  Controllers                         │   │
│  │  - Auth  - User  - Matching  - Chat │   │
│  └─────────────┬───────────────────────┘   │
│                ▼                             │
│  ┌─────────────────────────────────────┐   │
│  │  Services                            │   │
│  │  - Matching (AI Vector Search)      │   │
│  │  - Vector Service (Pinecone)        │   │
│  │  - Embedding Service (OpenAI)      │   │
│  │  - OpenAI Service                    │   │
│  └─────────────┬───────────────────────┘   │
└────────────────┼─────────────────────────────┘
                 ▼
    ┌────────────────────────────┐
    │   Data Layer               │
    │  ┌──────────┐  ┌─────────┐│
    │  │ MongoDB  │  │ Pinecone││
    │  │ (Primary)│  │ (Vectors)││
    │  └──────────┘  └─────────┘│
    └────────────────────────────┘
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and pnpm
- MongoDB Atlas account
- Pinecone account (free tier works)
- OpenAI API account with credits
- OpenAI API key
- Twilio account (for SMS)
- Stripe account (for payments)

### Environment Variables

Create a `.env` file with:

```env
# Server
PORT=8000

# Database
ATLAS_URI=mongodb+srv://...

# AI & Matching
OPENAI_API_KEY=sk-proj-...
PINECONE_API_KEY=pcsk_...
PINECONE_INDEX=podlove-users
HUGGINGFACE_ACCESS_TOKEN=hf_...

# Authentication
JWT_ACCESS_SECRET=your-secret

# Email
MAIL_HOST=smtp.gmail.com
MAIL_USERNAME=your-email@gmail.com
MAIL_PASSWORD=your-app-password

# SMS
# (Your Twilio credentials)

# Payments
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# 100ms (Video calls)
HMS_ACCESS_KEY=...
HMS_SECRET_KEY=...
HMS_TEMPLATE_ID=...
```

### Installation

```bash
# Install dependencies
pnpm install

# Setup Pinecone index (IMPORTANT!)
# Go to https://app.pinecone.io/
# Create index named "podlove-users" with:
# - Dimensions: 1024
# - Metric: cosine
# - Cloud: AWS
# - Region: us-east-1

# Test vector setup
pnpm vector:test

# Migrate existing users to Pinecone
pnpm vector:migrate

# Start development server
pnpm run dev
```

## 📖 How Bidirectional Matching Works

### The Problem with Traditional Matching
Traditional dating apps match based on:
- User A's preferences → User B's profile
- **Issue**: One-sided matches where B might not be interested in A

### Our Solution: Bidirectional AI Matching

```
Step 1: MongoDB Filters
├─ Gender, age, body type, ethnicity
├─ Complete profiles only (isProfileComplete: true)
└─ Has location data

Step 2: Bidirectional Vector Matching
├─ Query 1: My preferences → Their profiles
│   (What I WANT vs Who THEY ARE)
├─ Query 2: Their preferences → My profile
│   (What THEY WANT vs Who I AM)
└─ Final Score = Average of both (only if both > 0)

Step 3: Distance Filter
├─ Calculate actual distance
└─ Keep only matches within user's distance preference

Step 4: Return Top N
└─ Sorted by AI compatibility score
```

### Dual Vector Storage

Each user = **2 vectors** in Pinecone:

**Vector 1: Profile (`userId_profile`)**
- Demographics (age, gender, body type, ethnicity)
- Bio and personality traits
- Interests and hobbies
- Compatibility answers (22 questions)
- Location

**Vector 2: Preferences (`userId_pref`)**
- Preferred gender(s)
- Preferred age range
- Preferred body type(s)
- Preferred ethnicity/ethnicities
- Distance preference

### Why This Works Better

✅ **Mutual Compatibility** - Both users must match each other  
✅ **Semantic Understanding** - AI understands meaning, not just keywords  
✅ **No One-Sided Matches** - Eliminates frustrating mismatches  
✅ **Personality Matching** - Goes beyond surface-level filters  

## 🧪 Testing

```bash
# Check database statistics
pnpm checkusers

# Test vector setup
pnpm vector:test

# Test AI matching for a user
pnpm test:matching [userId]

# Migrate all users to Pinecone
pnpm vector:migrate
```

**Example Test Output:**
```
🎯 Testing AI-Powered Matching System

👤 Test User: Andrew Williams (Male, 41)
🎯 Preferences: Female, 32-52, within 50km

🤖 Running AI similarity matching...
✅ Found 14 bidirectional matches

🏆 TOP 5 MATCHING USERS
1. Emily Young - Score: 67.9% - Distance:7.0 km
2. Linda Clark - Score: 66.2% - Distance:7.0 km
3. Sandra Hernandez - Score: 64.4% - Distance:3.0 km
```

## 📚 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `POST /api/auth/verify-otp` - Verify email OTP

### User Management
- `GET /api/user` - Get current user
- `PUT /api/user` - Update profile
- `POST /api/user/validate-bio` - Validate bio with AI

### Matching
- `POST /api/match/:id` - Create matches for user
- `GET /api/match` - Get matched users
- `GET /api/find-match` - Find new matches

### Chat
- `GET /api/chat` - Get chat history
- Socket.io events for real-time messaging

### Subscriptions
- `POST /api/subscription/create-checkout-session` - Stripe checkout
- `POST /api/subscription/webhook` - Stripe webhook

## 🔧 NPM Scripts

```bash
pnpm run dev          # Start development server
pnpm run build        # Build for production
pnpm run start        # Start production server

# Vector matching scripts
pnpm vector:test       # Test Pinecone/OpenAI setup
pnpm vector:migrate    # Migrate users to Pinecone
pnpm vector:recreate   # Recreate Pinecone index (1024 dims)
pnpm test:matching     # Test AI matching with sample user
pnpm test:openai       # Test OpenAI embeddings
pnpm test:performance  # Performance & latency metrics
pnpm checkusers        # Check database stats
```

## 📁 Project Structure

```
src/
├── app.ts                 # Express app setup
├── server.ts              # Server entry point
├── controllers/           # Route handlers
│   ├── authController.ts
│   ├── userController.ts
│   └── ...
├── services/              # Business logic
│   ├── matchesServices.ts      # AI matching logic
│   ├── vectorService.ts        # Pinecone operations
│   ├── embeddingService.ts     # OpenAI embeddings
│   ├── openaiServices.ts       # OpenAI integration
│   └── ...
├── models/                # MongoDB schemas
│   ├── userModel.ts
│   ├── podcastModel.ts
│   └── ...
├── routers/               # API routes
├── middlewares/           # Auth, error handling
├── utils/                 # Helper functions
│   └── userToText.ts           # Convert users to text
└── shared/                # Shared utilities

scripts/
├── testVectorSetup.ts     # Test Pinecone/OpenAI
├── migrateUsersToVectorDB.ts  # Migrate users
├── testMatching.ts        # Test matching system
└── checkUsers.ts          # Check database
```

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Windows
netstat -ano | findstr :8000
taskkill /PID <PID> /F

# Linux/Mac
lsof -ti:8000 | xargs kill -9
```

### Vector Dimension Mismatch
**Error**: `Vector dimension 2048 does not match the dimension of the index 1024`

**Solution**: Your Pinecone index must have **1024 dimensions**. Delete and recreate if needed.

### No Matches Found
**Possible causes:**
- No users within distance preference
- No complete profiles in database
- Preferences too restrictive

**Solution**: Check with `pnpm checkusers` and adjust preferences or increase distance.

### Rate Limit Errors (OpenAI)
**Error**: `429 Too Many Requests`

**Solution**: Free tier has rate limits. Script has automatic retry. Just wait.

### Migration Failed
**Check:**
1. MongoDB connection (`ATLAS_URI`)
2. Pinecone credentials (`PINECONE_API_KEY`)
3. Index exists and is ready
4. OpenAI API key is valid



## 🎯 Performance

- **Embedding Generation**: ~500-1000ms per user (free tier)
- **Vector Search**: ~50-200ms per query
- **MongoDB Filters**: ~50-100ms
- **Total Matching Time**: ~300-500ms per request

## 🔒 Security

- JWT-based authentication
- Password hashing with bcrypt
- Environment variables for secrets
- Input validation and sanitization
- Rate limiting on sensitive endpoints
- Content moderation for user bios

## 📈 Monitoring

Watch server logs for:

**Success:**
```
✅ User 690b266... synced to Pinecone (profile + preferences)
✅ Using vector similarity scores for 8 candidates
📍 5 matches within 25km distance preference
✅ Returning 5 matches (all within 25km)
```

**Warnings:**
```
⚠️ Vector search failed, falling back to OpenAI compatibility
⚠️ Failed to sync user to Pinecone: <reason>
```

## 🚢 Deployment

### Build for Production
```bash
pnpm run build
```

### Environment Setup
1. Set all environment variables on your hosting platform
2. Ensure Pinecone index is created and ready
3. Run migration script for existing users
4. Start server with `pnpm start`

### Recommended Platforms
- **API**: Railway, Render, Heroku, AWS EC2
- **Database**: MongoDB Atlas
- **Vector DB**: Pinecone (managed)

## 📄 Documentation

- [IMPLEMENTATION_COMPLETE.md](IMPLEMENTATION_COMPLETE.md) - Implementation details
- [VECTOR_MATCHING_README.md](VECTOR_MATCHING_README.md) - Technical deep dive
- [SETUP_GUIDE.md](SETUP_GUIDE.md) - Quick setup instructions
- [TESTING.md](TESTING.md) - Testing guide
- [BIDIRECTIONAL_MATCHING_UPGRADE.md](BIDIRECTIONAL_MATCHING_UPGRADE.md) - Architecture details

## 🤝 Contributing

This is a production backend. Any changes to matching logic should:
1. Include comprehensive tests
2. Not break existing functionality
3. Maintain backward compatibility
4. Update relevant documentation

## 📝 License

Proprietary - All rights reserved

## 🎉 Acknowledgments

- **OpenAI** for high-quality embedding generation
- **Pinecone** for excellent vector database
- **OpenAI** for GPT-4 compatibility scoring
- **MongoDB** for reliable database

---

**Built with ❤️ for better dating experiences**

*Last Updated: December 24, 2025*
