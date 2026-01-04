import User, { UserSchema } from "@models/userModel";
import { Request, Response, NextFunction } from "express";
import { ageToDOB } from "@utils/ageUtils";
import OpenAI from "openai";
import process from "node:process";
import { StatusCodes } from "http-status-codes";
import createError from "http-errors";
import mongoose, { Types } from "mongoose";
import Podcast from "@models/podcastModel";
import { calculateDistance } from "@utils/calculateDistanceUtils";
import { SubscriptionPlanName } from "@shared/enums";
import { searchSimilarUsers, upsertUserVector } from "./vectorService";
import matchingConfig from "@config/matchingConfig";
const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });
const MODEL = "gpt-4o";

export interface Preferences {
  gender: string[];
  age: { min: number; max: number };
  bodyType: string[];
  ethnicity: string[];
  distance: number;
}
interface MatchRequestBody {
  compatibility: string[];
}

// const matchUser = async (
//   req: Request<{ id: string }, {}, MatchRequestBody>,
//   res: Response,
//   next: NextFunction
// ): Promise<any> => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const userId = req.params.id;
//     const { compatibility } = req.body;

//     const podcastExists = await Podcast.exists({ primaryUser: userId, status: "NotScheduled" });
//     if (podcastExists) {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(StatusCodes.CONFLICT).json({
//         success: false,
//         message: "User already has a podcast not scheduled",
//         data: {},
//       });
//     }

//     // Find top matches
//     const topMatches = await findMatches(userId, compatibility || [], 2, session);

//     if (!topMatches.length) {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(StatusCodes.OK).json({
//         success: false,
//         message: "No suitable matches found at this time",
//         data: {},
//       });
//     }

//     let participants = [
//       {
//         user: userId,
//         score: 100,
//         isQuestionAnswer: "",
//       },
//       ...topMatches.map((m) => ({
//         user: m.user,
//         score: m.score,
//         isQuestionAnswer: ""
//       })),
//     ];

//     const uniqueUsers = new Set();

//     participants = participants.filter(p => {
//       if (uniqueUsers.has(String(p.user))) return false;
//       uniqueUsers.add(String(p.user));
//       return true;
//     });

//     // Create podcast with participants
//     const podcast = await Podcast.create(
//       [
//         {
//           primaryUser: userId,
//           participants,
//           status: "NotScheduled",
//         },
//       ],
//       { session }
//     );

//     // Mark users as matched
//     const matchedUserIds = [userId, ...participants.map((p) => p.user)];

//     if (topMatches?.length) {
//       await User.updateMany(
//         { _id: { $in: matchedUserIds } },
//         { $set: { isPodcastActive: true } },
//         { session }
//       );
//     }

//     await session.commitTransaction();
//     session.endSession();

//     console.log("====================✅ User successfully scheduled for the podcast=============================");

//     return res.status(StatusCodes.OK).json({
//       success: true,
//       message: "Matched users successfully",
//       data: podcast,
//     });
//   } catch (err) {
//     await session.abortTransaction();
//     session.endSession();
//     next(err);
//   }
// };

// ==================================


/**
 * Enhanced compatibility scoring with AI reasoning
 * Returns score (0-100) and reasoning
 */
const getCompatibilityScoreWithReasoning = async (
  userOne: any,
  userTwo: any
): Promise<{ score: number; reasoning: string }> => {
  try {
    const prompt = `You are a professional matchmaking consultant. Analyze these two dating profiles and provide:
1. A compatibility score (0-100)
2. Brief reasoning (2-3 sentences) covering values, communication style, and lifestyle compatibility.

User 1:
- Bio: ${userOne.bio || "Not provided"}
- Interests: ${userOne.interests?.join(", ") || "Not provided"}
- Personality: Spectrum ${userOne.personality?.spectrum}, Balance ${userOne.personality?.balance}, Focus ${userOne.personality?.focus}
- Compatibility Answers: ${userOne.compatibility?.slice(0, 10).join("; ") || "Not provided"}

User 2:
- Bio: ${userTwo.bio || "Not provided"}
- Interests: ${userTwo.interests?.join(", ") || "Not provided"}
- Personality: Spectrum ${userTwo.personality?.spectrum}, Balance ${userTwo.personality?.balance}, Focus ${userTwo.personality?.focus}
- Compatibility Answers: ${userTwo.compatibility?.slice(0, 10).join("; ") || "Not provided"}

Format your response as:
Score: [number]
Reasoning: [text]`;

    const response = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.3,
      max_tokens: 200,
      messages: [
        { role: "system", content: "You are a dating compatibility expert." },
        { role: "user", content: prompt },
      ],
    });

    const content = response.choices[0].message?.content?.trim() || "";

    // Parse score and reasoning
    const scoreMatch = content.match(/Score:\s*(\d+)/i);
    const reasoningMatch = content.match(/Reasoning:\s*(.+)/is);

    const score = scoreMatch ? parseInt(scoreMatch[1]) : 0;
    const reasoning = reasoningMatch ? reasoningMatch[1].trim() : "No reasoning provided";

    return { score, reasoning };
  } catch (error: any) {
    console.error("Error getting compatibility score:", error.message);
    return { score: 0, reasoning: "Error calculating compatibility" };
  }
};

const getCompatibilityScore = async (userOneAnswers: string[], userTwoAnswers: string[]) => {

  const questions = [
    "Do you prefer spending your weekends socializing in larger gatherings or relaxing at home with a few close friends?",
    "When faced with a major life decision, do you usually follow your head (logic) or your heart (feelings)?",
    "Which of these activities sounds most appealing to you?",
    "How important is personal growth in your life?",
    "How do you like to show affection?",
    "How do you envision your ideal future?",
    "Do you have kids?",
    "Do you want kids in the future?",
    "Will you date a person who has kids?",
    "Do you smoke?",
    "Will you date a smoker?",
    "How would you describe your drinking habits?",
    "Do you consider yourself religious or spiritual?",
    "How important is religion/spirituality in your life?",
    "Would you date someone with different religious or spiritual beliefs?",
    "How would you describe your level of political engagement?",
    "Would you date someone with different political beliefs?",
    "Do you have pets?",
    "If yes, which pet do you have?",
    "How important is spontaneity to you in a relationship?",
    "How would you describe your communication style?",
    "How do you recharge after a busy day?",
    "What kind of vacation do you enjoy most?",
    "Do you enjoy trying new hobbies or sticking to the ones you know and love?",
    "When it comes to resolving conflicts, do you prefer to address them right away or take time to reflect?",
    "How do you feel about sharing responsibilities in a relationship?",
    "What role does family play in your life?",
    "How important is it for your partner to share your core values and beliefs?",
    "When it comes to emotional expression, are you more open or reserved?",
    "In a relationship, what is more important: emotional, intellectual, shared interests, or physical chemistry?",
    "How do you handle stress or challenges in life?",
    "What is your approach to financial planning in a relationship?",
    "How do you feel about taking risks in life?",
    "How important is maintaining a healthy lifestyle?",
    "How do you feel about pets in a relationship?",
    "How do you prefer your partner to handle disagreements?",
    "How do you feel about physical intimacy early in a relationship?",
    "How do you handle showing love and affection in public?",
    "Are you more of a morning person or a night owl?",
    "How organized and tidy do you like your living space to be?"
  ];

  let userContent = "Below are 40 questions, followed by each user's responses.\n";
  userContent += "Please produce a single compatibility score between 0 and 100.\n\n";

  for (let i = 0; i < questions.length; i++) {
    userContent += `Question ${i + 1}: ${questions[i]}\n`;
    userContent += `User1: ${userOneAnswers[i]}\n`;
    userContent += `User2: ${userTwoAnswers[i]}\n\n`;
  }

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.3,
      max_tokens: 50,
      messages: [
        {
          role: "system",
          content: `
      You are a dating compatibility algorithm.
      Given the questions and each user's responses, produce a single numeric compatibility score (0-100).
      Your answer must be strictly a number with no extra text or punctuation.
    `,
        },
        {
          role: "user",
          content: userContent,
        },
      ],
    });
    const rawOutput = response.choices[0].message!.content!.trim();
    const numericRegex = /^\d+(\.\d+)?$/;
    if (!numericRegex.test(rawOutput)) {
      throw new Error(`Output is not strictly a number: "${rawOutput}"`);
    }
    return parseFloat(rawOutput);
  } catch (error: any) {
    console.error("Error during API call:", error.response?.data || error.message);
    return null;
  }
};

const match = async (userId: string, matchCount: number = 3): Promise<string[]> => {
  const matchedUsers = await User.aggregate([
    { $match: { _id: { $ne: new Types.ObjectId(userId) } } },
    { $sample: { size: matchCount } },
    { $project: { _id: 1 } },
  ]);
  return matchedUsers.map((u: { _id: Types.ObjectId }) => u._id.toString());
};

const getMatchedUsers = async (req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<any> => {
  const userId = req.user.userId;
  if (!userId) {
    return next(createError(StatusCodes.UNAUTHORIZED, "User not authenticated"));
  }
  if (!Types.ObjectId.isValid(userId)) {
    return next(createError(StatusCodes.BAD_REQUEST, "Invalid user ID"));
  }

  const session = await mongoose.startSession();
  session.startTransaction({ readConcern: { level: "snapshot" } });

  try {
    // 1) Load the podcast and populate participants.user
    const findUserMatch = await Podcast.findOne({ primaryUser: userId }, null, { session })
      .populate({
        path: "participants.user",
        select: "name avatar compatibility",
        options: { session },
      })
      .lean()
      .exec();

    if (!findUserMatch) {
      throw createError(StatusCodes.NOT_FOUND, "No podcast found for this user");
    }

    // 2) Extract all participant user IDs
    const userIds: Types.ObjectId[] = findUserMatch.participants.map((p) => p.user as Types.ObjectId);

    // 3) Load full user docs
    const users = await User.find(
      { _id: { $in: userIds } },
      "name avatar bio interests personality phoneNumber dateOfBirth isProfileComplete location preferences",
      { session }
    ).lean();

    // 4) Merge user data with scores and reasoning from the podcast participants
    const enrichedUsers = users.map((userDoc) => {
      const participant = findUserMatch.participants.find(
        (p: any) => String(p.user) === String(userDoc._id)
      ) as any;
      return {
        ...userDoc,
        score: participant?.score,
        vectorScore: participant?.vectorScore,
        aiScore: participant?.aiScore,
        reasoning: participant?.reasoning,
      };
    });

    if (!enrichedUsers.length) {
      throw createError(StatusCodes.NOT_FOUND, "Matched users not found");
    }

    // 🔍 NEW: Apply matchingConfig limits to display only the configured amount of matches
    const userDoc = await User.findById(userId).select("subscription").lean();
    const allowedMatchCount = matchingConfig.getMatchCount(userDoc?.subscription?.plan || "SAMPLER");
    const finalUsers = enrichedUsers.slice(0, allowedMatchCount);

    // 5) Commit transaction
    await session.commitTransaction();
    session.endSession();

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Matched users retrieved successfully",
      //data: { users: enrichedUsers },
      data: { users: finalUsers },
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    return next(err);
  }
};
// ==================================

/**
 * NEW: Vector-based matching with AI scoring
 * Combines Pinecone similarity search with OpenAI compatibility assessment
 */
async function findMatchesWithVectors(
  userId: string,
  answers: string[],
  limitCount: number,
  session: mongoose.ClientSession
): Promise<any[]> {
  try {
    // 1) Load user with full profile data
    const user = await User.findById(userId, {}, { session });
    if (!user) throw new Error("User not found");

    // 2) Update user's compatibility answers if provided
    if (answers?.length) {
      await User.findByIdAndUpdate(
        userId,
        { compatibility: answers },
        { session }
      ).exec();
      user.compatibility = answers;
    }

    // 3) Ensure user has vector in Pinecone (upsert if profile is complete)
    if (user.isProfileComplete) {
      try {
        await upsertUserVector(user);
      } catch (error) {
        console.error("Failed to upsert user vector:", error);
      }
    }

    // 4) Perform vector similarity search
    // Uses config for topK and minSimilarityScore
    const vectorResults = await searchSimilarUsers({
      user,
      topK: matchingConfig.VECTOR_SEARCH_TOP_K || 20,
      minSimilarityScore: matchingConfig.MIN_SIMILARITY_SCORE || 0.5,
    });

    if (!vectorResults.length) {
      if (matchingConfig.ENABLE_MATCH_LOGGING) {
        console.log("No vector matches found, falling back to traditional matching");
      }
      if (matchingConfig.ENABLE_VECTOR_FALLBACK) {
        return await findMatchesTraditional(userId, answers, limitCount, session);
      }
      return [];
    }

    // 5) Load full user documents for further processing
    // Filter out invalid IDs to prevent BSON errors
    const validCandidateIds: Types.ObjectId[] = [];
    for (const r of vectorResults) {
      if (mongoose.Types.ObjectId.isValid(r.userId)) {
        validCandidateIds.push(new Types.ObjectId(r.userId));
      } else {
        console.warn(`⚠️ Skipping invalid potential match ID: ${r.userId}`);
      }
    }

    if (validCandidateIds.length === 0) {
      if (matchingConfig.ENABLE_MATCH_LOGGING) {
        console.log("No valid candidate IDs found in vector results.");
      }
      if (matchingConfig.ENABLE_VECTOR_FALLBACK) {
        return await findMatchesTraditional(userId, answers, limitCount, session);
      }
      return [];
    }

    const candidates = await User.find(
      { _id: { $in: validCandidateIds } },
      null,
      { session }
    ).lean();

    // 6) Compatibility scoring (AI or simple)
    const scoredCandidates = await Promise.all(
      candidates.map(async (candidate) => {
        const vectorResult = vectorResults.find((r) => r.userId === candidate._id.toString());
        const vectorScore = vectorResult?.similarityScore || 0;

        let aiScore = 0;
        let reasoning = "Semantic match based on profile and preferences.";

        // Deep AI assessment if enabled in config
        if (matchingConfig.ENABLE_AI_COMPATIBILITY) {
          const aiResult = await getCompatibilityScoreWithReasoning(user, candidate);
          aiScore = aiResult.score;
          reasoning = aiResult.reasoning;
        } else {
          // Fallback to simple compatibility score or vector score only
          aiScore = vectorScore * 100; // Use vector score as base if AI is off
        }

        // Weighted combination from config: VECTOR vs AI
        const vWeight = matchingConfig.SCORE_WEIGHTS?.VECTOR || 0.5;
        const aWeight = matchingConfig.SCORE_WEIGHTS?.AI || 0.5;

        const finalScore = (vectorScore * vWeight) + ((aiScore / 100) * aWeight);

        return {
          user: candidate._id,
          score: Math.round(finalScore * 100),
          vectorScore: Math.round(vectorScore * 100),
          aiScore: Math.round(aiScore),
          reasoning: reasoning,
        };
      })
    );

    // 7) Sort by final score and return top matches
    return scoredCandidates
      .sort((a, b) => b.score - a.score)
      .slice(0, limitCount);

  } catch (error) {
    console.error("Error in vector-based matching:", error);
    // Fallback if enabled
    if (matchingConfig.ENABLE_VECTOR_FALLBACK) {
      return await findMatchesTraditional(userId, answers, limitCount, session);
    }
    throw error;
  }
}

/**
 * TRADITIONAL: Conditional + AI matching (fallback)
 * Used when vector search fails or returns no results
 */
async function findMatchesTraditional(
  userId: string,
  answers: string[],
  limitCount: number,
  session: mongoose.ClientSession
): Promise<any[]> {
  // 1) Load user
  const user = await User.findById(userId, {}, { session });
  if (!user) throw new Error("User not found");

  // 2) Ensure answers array
  answers = answers?.length ? answers : user.compatibility || [];

  // 3) Save/update user's compatibility answers
  await User.findByIdAndUpdate(userId, { compatibility: answers }, { session }).exec();

  const pref = user.preferences;

  // 4) Build query filter based on configuration
  const query: any = {};

  // Always exclude self (critical)
  if (matchingConfig.PREFERENCE_FILTERS.EXCLUDE_SELF) {
    query._id = { $ne: user._id };
  }

  // Filter out users in active podcasts (highly recommended)
  if (matchingConfig.PREFERENCE_FILTERS.IS_PODCAST_ACTIVE) {
    query.isPodcastActive = false;
  }

  // Apply preference-based filters if enabled
  if (matchingConfig.ENABLE_PREFERENCE_FILTERS) {
    // Age filter
    if (matchingConfig.PREFERENCE_FILTERS.AGE && pref.age?.min && pref.age?.max) {
      query.dateOfBirth = {
        $gte: ageToDOB(pref.age.max),
        $lte: ageToDOB(pref.age.min)
      };
      if (matchingConfig.ENABLE_MATCH_LOGGING) {
        console.log(`🔍 Filtering by age: ${pref.age.min}-${pref.age.max}`);
      }
    }

    // Gender filter
    if (matchingConfig.PREFERENCE_FILTERS.GENDER && pref.gender?.length) {
      query.gender = { $in: pref.gender };
      if (matchingConfig.ENABLE_MATCH_LOGGING) {
        console.log(`🔍 Filtering by gender: ${pref.gender.join(', ')}`);
      }
    }

    // Body type filter
    if (matchingConfig.PREFERENCE_FILTERS.BODY_TYPE && pref.bodyType?.length) {
      query.bodyType = { $in: pref.bodyType };
      if (matchingConfig.ENABLE_MATCH_LOGGING) {
        console.log(`🔍 Filtering by body type: ${pref.bodyType.join(', ')}`);
      }
    }

    // Ethnicity filter
    const ethnicityArray = Array.isArray(pref.ethnicity) ? pref.ethnicity : [];
    if (matchingConfig.PREFERENCE_FILTERS.ETHNICITY && ethnicityArray.length) {
      query.ethnicity = { $in: ethnicityArray };
      if (matchingConfig.ENABLE_MATCH_LOGGING) {
        console.log(`🔍 Filtering by ethnicity: ${ethnicityArray.join(', ')}`);
      }
    }
  }

  // Location existence (required for distance calculation)
  query["location.latitude"] = { $exists: true };
  query["location.longitude"] = { $exists: true };

  if (matchingConfig.ENABLE_MATCH_LOGGING) {
    console.log(`🔍 Query filters:`, JSON.stringify(query, null, 2));
  }

  // Fetch candidates matching query
  let candidates = await User.find(query, null, { session }).lean();

  if (matchingConfig.ENABLE_MATCH_LOGGING) {
    console.log(`📊 Found ${candidates.length} candidates before distance filtering`);
  }

  // 5) Distance filtering (if enabled)
  let nearby = candidates;
  if (matchingConfig.ENABLE_PREFERENCE_FILTERS && matchingConfig.PREFERENCE_FILTERS.DISTANCE) {
    const maxDistance = pref.distance || matchingConfig.DEFAULT_MAX_DISTANCE;

    nearby = candidates.filter((c) => {
      const dist = calculateDistance(
        user.location.latitude,
        user.location.longitude,
        c.location.latitude,
        c.location.longitude
      );
      return dist <= maxDistance;
    });

    if (matchingConfig.ENABLE_MATCH_LOGGING) {
      console.log(`🔍 Distance filter (${maxDistance} miles): ${nearby.length} candidates remaining`);
    }
  } else {
    if (matchingConfig.ENABLE_MATCH_LOGGING) {
      console.log(`🔍 Distance filtering disabled: keeping all ${candidates.length} candidates`);
    }
  }

  // 6) Fallback if not enough users (when enabled)
  let finalCandidates = nearby;

  if (matchingConfig.FALLBACK_STRATEGY === 'relax_filters' && nearby.length < matchingConfig.FALLBACK_THRESHOLD) {
    if (matchingConfig.ENABLE_MATCH_LOGGING) {
      console.log(`⚠️ Only ${nearby.length} candidates found, applying fallback strategy...`);
    }

    // Relaxed query - only keep essential filters
    const fallbackQuery: any = {
      _id: { $ne: user._id },
      isPodcastActive: false,
      "location.latitude": { $exists: true },
      "location.longitude": { $exists: true },
    };

    // Keep gender filter if it's not being relaxed
    if (matchingConfig.PREFERENCE_FILTERS.GENDER && pref.gender?.length) {
      fallbackQuery.gender = { $in: pref.gender };
    }

    const fallback = await User.find(fallbackQuery, null, { session }).lean();

    const fallbackNearby = fallback.filter((c) => {
      const dist = calculateDistance(
        user.location.latitude,
        user.location.longitude,
        c.location.latitude,
        c.location.longitude
      );
      return dist <= (matchingConfig.FALLBACK_MAX_DISTANCE || 100);
    });

    finalCandidates = [...nearby, ...fallbackNearby];

    if (matchingConfig.ENABLE_MATCH_LOGGING) {
      console.log(`📊 Fallback found ${fallbackNearby.length} additional candidates`);
    }
  }

  // 7) Compute compatibility scores
  const scored = await Promise.all(
    finalCandidates.map(async (c) => {
      const aiResult = await getCompatibilityScoreWithReasoning(user, c);
      return {
        user: c,
        score: aiResult.score,
        reasoning: aiResult.reasoning
      };
    })
  );

  // 8) Sort & return top
  return scored
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, limitCount)
    .map((item) => ({
      user: item.user._id,
      score: Math.round(item.score || 0),
      aiScore: Math.round(item.score || 0),
      vectorScore: 0,
      reasoning: item.reasoning,
    }));
}


/**
 * Get match count based on subscription tier.
 * Respects configuration settings from matchingConfig.ts
 * 
 * @param subscription - User's subscription object
 * @returns Number of matches allowed
 * @throws Error if subscription requirements not met (when enforcement is enabled)
 */
export const subscriptionMatchCount = (subscription: { plan: string; isSpotlight: number }) => {
  // Check spotlight quota if enforcement is enabled
  if (matchingConfig.ENABLE_SPOTLIGHT_QUOTA) {
    if (!subscription.plan) {
      throw new Error("No active subscription found. Please subscribe to find matches.");
    }

    if (subscription.isSpotlight === 0) {
      throw new Error("Your Spotlight subscription has expired. Please renew to find matches.");
    }
  }

  // Return configured match count based on subscription tier
  if (matchingConfig.ENABLE_SUBSCRIPTION_LIMITS) {
    const matchCount = matchingConfig.SUBSCRIPTION_MATCH_COUNTS[
      subscription.plan as keyof typeof matchingConfig.SUBSCRIPTION_MATCH_COUNTS
    ];

    if (matchCount) {
      if (matchingConfig.ENABLE_MATCH_LOGGING) {
        console.log(`📊 Subscription ${subscription.plan}: ${matchCount} matches allowed`);
      }
      return matchCount;
    }

    // Fallback to SAMPLER count if plan not recognized
    return matchingConfig.SUBSCRIPTION_MATCH_COUNTS.SAMPLER;
  }

  // Return default match count when subscription limits are disabled
  if (matchingConfig.ENABLE_MATCH_LOGGING) {
    console.log(`📊 Subscription limits disabled: ${matchingConfig.DEFAULT_MATCH_COUNT} matches for all users`);
  }
  return matchingConfig.DEFAULT_MATCH_COUNT;
};

const findMatch = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const user = await User.findById(req.user.userId, null, { session });
    if (!user) {
      throw createError(StatusCodes.NOT_FOUND, "User not found");
    }

    if (matchingConfig.ENABLE_MATCH_LOGGING) {
      console.log(`🚀 Starting AI Matchmaking for user: ${user._id} (${user.name})`);
    }

    const matchCount = subscriptionMatchCount(user.subscription);

    // Use vector-based matching (with automatic fallback to traditional)
    const participants = await findMatchesWithVectors(
      req.user.userId,
      user.compatibility,
      matchCount,
      session
    );

    const podcastUpdate = await Podcast.findOneAndUpdate(
      { primaryUser: user._id },
      { $set: { participants } },
      { new: true, upsert: true, session }
    ).populate('participants.user', 'name avatar');

    if (matchingConfig.ENABLE_SPOTLIGHT_QUOTA) {
      user.subscription.isSpotlight -= 1;
      await user.save({ session });
    }

    await session.commitTransaction();

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "User successfully updated matches for the podcast",
      data: podcastUpdate,
    });

  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
};

const MatchedServices = {
  match,
  // matchUser,
  getMatchedUsers,
  findMatch
};

export default MatchedServices;