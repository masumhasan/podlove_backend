import type { UserSchema } from "@models/userModel";

/**
 * Converts a user's FULL profile (profile + preferences) to semantic text for embedding
 * Used for: Initial embeddings, full profile updates
 */
export function userProfileToText(user: any): string {
  const parts: string[] = [];

  // Basic info
  if (user.name) parts.push(`Name: ${user.name}`);
  if (user.gender) parts.push(`Gender: ${user.gender}`);
  if (user.dateOfBirth) parts.push(`Date of Birth: ${user.dateOfBirth}`);
  if (user.bodyType) parts.push(`Body Type: ${user.bodyType}`);
  if (user.ethnicity?.length) parts.push(`Ethnicity: ${user.ethnicity.join(", ")}`);

  // Bio
  if (user.bio) parts.push(`Bio: ${user.bio}`);

  // Personality
  if (user.personality) {
    parts.push(
      `Personality - Spectrum: ${user.personality.spectrum}, Balance: ${user.personality.balance}, Focus: ${user.personality.focus}`
    );
  }

  // Interests
  if (user.interests?.length) {
    parts.push(`Interests: ${user.interests.join(", ")}`);
  }

  // Location
  if (user.location?.place) {
    parts.push(`Location: ${user.location.place}`);
  }

  // Compatibility answers (MOST IMPORTANT for matching)
  if (user.compatibility?.length) {
    parts.push(`Compatibility Answers: ${user.compatibility.join(" | ")}`);
  }

  // Preferences
  if (user.preferences) {
    const pref = user.preferences;
    if (pref.gender?.length) {
      parts.push(`Looking for: ${pref.gender.join(", ")}`);
    }
    if (pref.age) {
      parts.push(`Age preference: ${pref.age.min}-${pref.age.max}`);
    }
    if (pref.bodyType?.length) {
      parts.push(`Preferred body type: ${pref.bodyType.join(", ")}`);
    }
    if (pref.ethnicity?.length) {
      parts.push(`Preferred ethnicity: ${pref.ethnicity.join(", ")}`);
    }
    if (pref.distance) {
      parts.push(`Distance preference: ${pref.distance} km`);
    }
  }

  return parts.join(". ");
}

/**
 * Converts ONLY user's profile (WHO they ARE) to semantic text
 * Used for: Profile vector in bidirectional matching
 */
export function userProfileOnlyToText(user: any): string {
  const parts: string[] = [];

  // Basic info
  if (user.name) parts.push(`Name: ${user.name}`);
  if (user.gender) parts.push(`Gender: ${user.gender}`);
  if (user.dateOfBirth) parts.push(`Date of Birth: ${user.dateOfBirth}`);
  if (user.bodyType) parts.push(`Body Type: ${user.bodyType}`);
  if (user.ethnicity?.length) parts.push(`Ethnicity: ${user.ethnicity.join(", ")}`);

  // Bio
  if (user.bio) parts.push(`Bio: ${user.bio}`);

  // Personality
  if (user.personality) {
    parts.push(
      `Personality - Spectrum: ${user.personality.spectrum}, Balance: ${user.personality.balance}, Focus: ${user.personality.focus}`
    );
  }

  // Interests
  if (user.interests?.length) {
    parts.push(`Interests: ${user.interests.join(", ")}`);
  }

  // Location
  if (user.location?.place) {
    parts.push(`Location: ${user.location.place}`);
  }

  // Compatibility answers (MOST IMPORTANT for matching)
  if (user.compatibility?.length) {
    parts.push(`Compatibility Answers: ${user.compatibility.join(" | ")}`);
  }

  return parts.join(". ");
}

/**
 * Converts ONLY user's preferences (WHAT they WANT) to semantic text
 * Used for: Preference vector in bidirectional matching
 */
export function userPreferencesToText(user: any): string {
  const parts: string[] = [];

  if (user.preferences) {
    const pref = user.preferences;
    
    if (pref.gender?.length) {
      parts.push(`Looking for: ${pref.gender.join(", ")}`);
    }
    
    if (pref.age) {
      parts.push(`Age preference: ${pref.age.min}-${pref.age.max} years old`);
    }
    
    if (pref.bodyType?.length) {
      parts.push(`Preferred body type: ${pref.bodyType.join(", ")}`);
    }
    
    if (pref.ethnicity?.length) {
      parts.push(`Preferred ethnicity: ${pref.ethnicity.join(", ")}`);
    }
    
    if (pref.distance) {
      parts.push(`Preferred distance: within ${pref.distance} km`);
    }
  }

  return parts.length > 0 ? parts.join(". ") : "No specific preferences";
}

/**
 * Condensed version of user profile for faster embedding generation
 * Used for: Quick updates, testing
 */
export function userProfileToTextConcise(user: any): string {
  const parts: string[] = [];

  if (user.gender) parts.push(user.gender);
  if (user.bodyType) parts.push(user.bodyType);
  if (user.ethnicity?.length) parts.push(user.ethnicity.join(","));
  if (user.bio) parts.push(user.bio.substring(0, 100)); // Truncate bio
  if (user.interests?.length) parts.push(user.interests.slice(0, 3).join(",")); // Top 3 interests

  // Compatibility (condensed)
  if (user.compatibility?.length) {
    parts.push(user.compatibility.slice(0, 5).join("|")); // First 5 answers
  }

  return parts.join(" ");
}
