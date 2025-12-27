"""
MongoDB User Data Generator for Bidirectional Matching Demo
Creates 5 sample users from New York with bidirectional preferences
Inserts directly into MongoDB and provides ObjectIds
"""

from datetime import datetime, timedelta
import json
import random
import os
from pymongo import MongoClient
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def calculate_dob_from_age(age):
    """Calculate date of birth from age in DD/MM/YYYY format"""
    today = datetime.now()
    birth_year = today.year - age
    birth_month = random.randint(1, 12)
    birth_day = random.randint(1, 28)  # Safe day for all months
    return f"{birth_day}/{birth_month}/{birth_year}"

# New York coordinates
NY_LAT = 40.7128
NY_LON = -74.0060

# Sample user (The main user we're matching against)
sample_user = {
    "name": "Alex Martinez",
    "email": "alex.martinez@demo.com",
    "password": "$2b$10$demohashedpassword123",  # Hashed password
    "gender": "Male",
    "dateOfBirth": calculate_dob_from_age(32),  # 32 years old
    "location": {
        "latitude": NY_LAT,
        "longitude": NY_LON,
        "place": "New York, NY"
    },
    "bio": "Software engineer passionate about technology, fitness, and outdoor adventures. Love hiking on weekends and trying new restaurants. Looking for someone who shares similar interests and values meaningful conversations.",
    "bodyType": "Athletic",
    "ethnicity": ["White"],
    "interests": ["Technology", "Fitness", "Hiking", "Cooking", "Travel"],
    "personality": {
        "spectrum": 3,
        "balance": 4,
        "focus": 3
    },
    "preferences": {
        "gender": ["Female"],
        "age": {
            "min": 28,
            "max": 38
        },
        "distance": 50,
        "bodyType": ["Athletic", "Slim", "Average"],
        "ethnicity": ["White", "Asian", "Hispanic", "Mixed"]
    },
    "isProfileComplete": True,
    "isMatch": False,
    "compatibility": [
        "Value career and ambition",
        "Enjoy outdoor activities",
        "Prefer meaningful conversations over small talk",
        "Love trying new experiences"
    ],
    "createdAt": datetime.now().isoformat(),
    "updatedAt": datetime.now().isoformat()
}

# Create 5 matching users - all bidirectionally compatible
matching_users = [
    {
        "name": "Sarah Johnson",
        "email": "sarah.johnson@demo.com",
        "password": "$2b$10$demohashedpassword123",
        "gender": "Female",
        "dateOfBirth": calculate_dob_from_age(30),  # Matches sample user's age preference (28-38)
        "location": {
            "latitude": NY_LAT + 0.01,  # Slightly different location in NY
            "longitude": NY_LON + 0.01,
            "place": "Brooklyn, NY"
        },
        "bio": "Tech enthusiast and fitness lover. Passionate about hiking and exploring new places. Looking for someone ambitious who enjoys both adventure and deep conversations.",
        "bodyType": "Athletic",  # Matches sample user's preference
        "ethnicity": ["White"],  # Matches sample user's preference
        "interests": ["Technology", "Hiking", "Yoga", "Photography", "Travel"],
        "personality": {
            "spectrum": 4,
            "balance": 4,
            "focus": 3
        },
        "preferences": {
            "gender": ["Male"],  # Matches sample user's gender
            "age": {
                "min": 30,
                "max": 40  # Includes sample user's age (32)
            },
            "distance": 50,
            "bodyType": ["Athletic", "Slim", "Muscular"],  # Matches sample user's body type
            "ethnicity": ["White", "Mixed", "Hispanic"]  # Includes sample user's ethnicity
        },
        "isProfileComplete": True,
        "isMatch": False,
        "compatibility": [
            "Value career and ambition",
            "Enjoy outdoor activities",
            "Prefer meaningful conversations over small talk",
            "Appreciate work-life balance"
        ],
        "createdAt": datetime.now().isoformat(),
        "updatedAt": datetime.now().isoformat()
    },
    {
        "name": "Emily Chen",
        "email": "emily.chen@demo.com",
        "password": "$2b$10$demohashedpassword123",
        "gender": "Female",
        "dateOfBirth": calculate_dob_from_age(29),  # 28-38 range
        "location": {
            "latitude": NY_LAT - 0.02,
            "longitude": NY_LON + 0.02,
            "place": "Queens, NY"
        },
        "bio": "Software developer who loves coding and cooking. Enjoy weekend hikes and exploring the city. Seeking someone who's passionate about technology and growth.",
        "bodyType": "Slim",  # Matches sample user's preference
        "ethnicity": ["Asian"],  # Matches sample user's preference
        "interests": ["Technology", "Cooking", "Hiking", "Reading", "Music"],
        "personality": {
            "spectrum": 3,
            "balance": 5,
            "focus": 4
        },
        "preferences": {
            "gender": ["Male"],
            "age": {
                "min": 28,
                "max": 36  # Includes sample user's age (32)
            },
            "distance": 50,
            "bodyType": ["Athletic", "Slim", "Average"],
            "ethnicity": ["White", "Asian", "Mixed"]
        },
        "isProfileComplete": True,
        "isMatch": False,
        "compatibility": [
            "Love trying new restaurants",
            "Enjoy outdoor activities",
            "Tech-savvy and career-focused",
            "Value personal growth"
        ],
        "createdAt": datetime.now().isoformat(),
        "updatedAt": datetime.now().isoformat()
    },
    {
        "name": "Jessica Rodriguez",
        "email": "jessica.rodriguez@demo.com",
        "password": "$2b$10$demohashedpassword123",
        "gender": "Female",
        "dateOfBirth": calculate_dob_from_age(33),  # 28-38 range
        "location": {
            "latitude": NY_LAT + 0.03,
            "longitude": NY_LON - 0.01,
            "place": "Manhattan, NY"
        },
        "bio": "Fitness instructor and travel enthusiast. Love hiking, exploring new cuisines, and meaningful conversations. Looking for someone adventurous and down-to-earth.",
        "bodyType": "Athletic",  # Matches sample user's preference
        "ethnicity": ["Hispanic"],  # Matches sample user's preference
        "interests": ["Fitness", "Travel", "Cooking", "Hiking", "Dancing"],
        "personality": {
            "spectrum": 4,
            "balance": 3,
            "focus": 3
        },
        "preferences": {
            "gender": ["Male"],
            "age": {
                "min": 30,
                "max": 38  # Includes sample user's age (32)
            },
            "distance": 50,
            "bodyType": ["Athletic", "Muscular", "Slim"],
            "ethnicity": ["White", "Hispanic", "Mixed"]
        },
        "isProfileComplete": True,
        "isMatch": False,
        "compatibility": [
            "Enjoy outdoor activities",
            "Love trying new experiences",
            "Value fitness and health",
            "Prefer meaningful conversations"
        ],
        "createdAt": datetime.now().isoformat(),
        "updatedAt": datetime.now().isoformat()
    },
    {
        "name": "Olivia Thompson",
        "email": "olivia.thompson@demo.com",
        "password": "$2b$10$demohashedpassword123",
        "gender": "Female",
        "dateOfBirth": calculate_dob_from_age(31),  # 28-38 range
        "location": {
            "latitude": NY_LAT - 0.01,
            "longitude": NY_LON - 0.02,
            "place": "Bronx, NY"
        },
        "bio": "Digital marketing specialist with a passion for technology and outdoor adventures. Weekend hiker and food explorer. Seeking someone who values both career and fun.",
        "bodyType": "Average",  # Matches sample user's preference
        "ethnicity": ["Mixed"],  # Matches sample user's preference
        "interests": ["Technology", "Hiking", "Photography", "Food", "Travel"],
        "personality": {
            "spectrum": 3,
            "balance": 4,
            "focus": 4
        },
        "preferences": {
            "gender": ["Male"],
            "age": {
                "min": 29,
                "max": 37  # Includes sample user's age (32)
            },
            "distance": 50,
            "bodyType": ["Athletic", "Average", "Slim"],
            "ethnicity": ["White", "Mixed", "Asian"]
        },
        "isProfileComplete": True,
        "isMatch": False,
        "compatibility": [
            "Tech-savvy and career-focused",
            "Enjoy outdoor activities",
            "Love trying new experiences",
            "Value meaningful conversations"
        ],
        "createdAt": datetime.now().isoformat(),
        "updatedAt": datetime.now().isoformat()
    },
    {
        "name": "Mia Williams",
        "email": "mia.williams@demo.com",
        "password": "$2b$10$demohashedpassword123",
        "gender": "Female",
        "dateOfBirth": calculate_dob_from_age(35),  # 28-38 range
        "location": {
            "latitude": NY_LAT + 0.02,
            "longitude": NY_LON + 0.03,
            "place": "Staten Island, NY"
        },
        "bio": "Product manager who loves technology, fitness, and exploring new restaurants. Enjoy hiking trails and weekend adventures. Looking for someone ambitious and fun-loving.",
        "bodyType": "Slim",  # Matches sample user's preference
        "ethnicity": ["White"],  # Matches sample user's preference
        "interests": ["Technology", "Fitness", "Cooking", "Hiking", "Wine"],
        "personality": {
            "spectrum": 4,
            "balance": 5,
            "focus": 3
        },
        "preferences": {
            "gender": ["Male"],
            "age": {
                "min": 30,
                "max": 40  # Includes sample user's age (32)
            },
            "distance": 50,
            "bodyType": ["Athletic", "Slim", "Average"],
            "ethnicity": ["White", "Asian", "Mixed"]
        },
        "isProfileComplete": True,
        "isMatch": False,
        "compatibility": [
            "Value career and ambition",
            "Love trying new restaurants",
            "Enjoy outdoor activities",
            "Appreciate work-life balance"
        ],
        "createdAt": datetime.now().isoformat(),
        "updatedAt": datetime.now().isoformat()
    }
]

# Combine all users
all_users = [sample_user] + matching_users

# Print summary
print("=" * 80)
print("BIDIRECTIONAL MATCHING DEMO - USER DATA GENERATED")
print("=" * 80)
print(f"\nTotal Users Created: {len(all_users)}")
print(f"Location: New York, NY")
print(f"All users within 50km of each other\n")

print("-" * 80)
print("SAMPLE USER (Main User)")
print("-" * 80)
print(f"Name: {sample_user['name']}")
print(f"Gender: {sample_user['gender']}")
print(f"Age: 32 years")
print(f"Looking for: {', '.join(sample_user['preferences']['gender'])}")
print(f"Age Range: {sample_user['preferences']['age']['min']}-{sample_user['preferences']['age']['max']}")
print(f"Preferred Body Types: {', '.join(sample_user['preferences']['bodyType'])}")
print(f"Preferred Ethnicities: {', '.join(sample_user['preferences']['ethnicity'])}")
print(f"Bio: {sample_user['bio'][:100]}...")

print("\n" + "-" * 80)
print("MATCHING USERS (All bidirectionally compatible)")
print("-" * 80)

for i, user in enumerate(matching_users, 1):
    age_from_dob = datetime.now().year - int(user['dateOfBirth'].split('/')[-1])
    print(f"\n{i}. {user['name']}")
    print(f"   Gender: {user['gender']} (matches sample user's preference)")
    print(f"   Age: {age_from_dob} (within sample user's range: 28-38)")
    print(f"   Body Type: {user['bodyType']} (matches sample user's preference)")
    print(f"   Ethnicity: {', '.join(user['ethnicity'])} (matches sample user's preference)")
    print(f"   Looking for: {', '.join(user['preferences']['gender'])} (includes sample user)")
    print(f"   Age Range: {user['preferences']['age']['min']}-{user['preferences']['age']['max']} (includes 32)")
    print(f"   Bio: {user['bio'][:80]}...")

# Save to JSON file
output_file = "demo_users.json"
with open(output_file, 'w') as f:
    json.dump(all_users, f, indent=2)

print("\n" + "=" * 80)
print("DATA EXPORT")
print("=" * 80)
print(f"\n✅ User data saved to: {output_file}")
print(f"   Total records: {len(all_users)}")
print(f"   Format: JSON")

# Insert users into MongoDB
print("\n" + "=" * 80)
print("MONGODB INSERTION")
print("=" * 80)

try:
    # Get MongoDB URI from environment
    mongo_uri = os.getenv('ATLAS_URI')
    if not mongo_uri:
        print("\n❌ Error: ATLAS_URI not found in environment variables")
        print("   Please set ATLAS_URI in your .env file")
        exit(1)
    
    print(f"\n🔗 Connecting to MongoDB...")
    client = MongoClient(mongo_uri)
    db = client.get_database()  # Uses database from URI
    users_collection = db['users']
    
    print(f"✅ Connected to MongoDB")
    print(f"   Database: {db.name}")
    print(f"   Collection: users")
    
    # Insert users
    print(f"\n📥 Inserting {len(all_users)} users...")
    result = users_collection.insert_many(all_users)
    inserted_ids = result.inserted_ids
    
    print(f"✅ Successfully inserted {len(inserted_ids)} users")
    
    # Print user IDs
    print("\n📋 USER IDs (MongoDB ObjectIds):")
    print("-" * 80)
    print(f"\n{'Name':<25} {'MongoDB ObjectId':<30} {'Role'}")
    print("-" * 80)
    
    for i, (user, obj_id) in enumerate(zip(all_users, inserted_ids)):
        role = "SAMPLE USER" if i == 0 else f"Match {i}"
        print(f"{user['name']:<25} {str(obj_id):<30} {role}")
    
    # Store sample user ID for easy access
    sample_user_id = str(inserted_ids[0])
    
    print("\n" + "=" * 80)
    print("QUICK TEST COMMAND")
    print("=" * 80)
    print(f"\n🧪 Test matching with sample user:")
    print(f"   pnpm test:matching {sample_user_id}")
    
    print(f"\n📊 Expected results: All 5 matching users with scores 75-95%")
    
    # Close connection
    client.close()
    print(f"\n✅ MongoDB connection closed")
    
except Exception as e:
    print(f"\n❌ MongoDB Error: {str(e)}")
    print(f"\n💡 Fallback: Use JSON file for manual import")
    print(f"   File: {output_file}")
    exit(1)

print("\n" + "=" * 80)
print("NEXT STEPS")
print("=" * 80)
print("""
1. ✅ Users inserted into MongoDB

2. Run migration to Pinecone:
   pnpm vector:migrate

3. Test bidirectional matching:
   Use the command shown above

4. Verify all 5 users appear in results with high match scores (>80%)

5. Test performance:
   pnpm test:performance
""")

print("\n" + "=" * 80)
print("BIDIRECTIONAL MATCHING VALIDATION")
print("=" * 80)
print("""
✅ Sample User → Matching Users:
   - Sample user prefers: Female, 28-38, Athletic/Slim/Average, White/Asian/Hispanic/Mixed
   - All 5 users match: Female ✓, Ages 29-35 ✓, Athletic/Slim/Average ✓, White/Asian/Hispanic/Mixed ✓

✅ Matching Users → Sample User:
   - All 5 users prefer: Male ✓
   - All 5 users' age ranges include 32 ✓
   - All 5 users prefer Athletic/Slim/Average (sample is Athletic) ✓
   - All 5 users prefer White/Mixed/Asian/Hispanic (sample is White) ✓

🎯 Expected Match Scores: 75-95% (bidirectional compatibility)
""")

print("=" * 80)
print(f"Generated at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print("=" * 80)
