/**
 * Quick script to check database users
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
import User from "../src/models/userModel";

async function checkUsers() {
  try {
    await mongoose.connect(process.env.ATLAS_URI!);
    
    const totalUsers = await User.countDocuments();
    const completeProfiles = await User.countDocuments({ isProfileComplete: true });
    const withLocation = await User.countDocuments({ "location.latitude": { $exists: true } });
    
    console.log(`📊 Database Stats:`);
    console.log(`   Total users: ${totalUsers}`);
    console.log(`   Complete profiles: ${completeProfiles}`);
    console.log(`   Users with location: ${withLocation}\n`);
    
    const users = await User.find().select("name gender isProfileComplete location").limit(10).lean();
    
    console.log("Sample users:");
    users.forEach((u: any) => {
      console.log(`   - ${u.name || "No name"} (${u.gender || "?"}) - Complete: ${u.isProfileComplete}, Location: ${u.location?.place || "None"}`);
    });
    
    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkUsers();
