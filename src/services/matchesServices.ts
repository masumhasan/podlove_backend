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
import { findSimilarUsers } from "./vectorService";
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
    "If 'Never', would you be comfortable dating someone who drinks?",
    "Do you consider yourself religious or spiritual?",
    "If 'Religious', what is your religion or denomination?",
    "If 'Spiritual', would you like to describe your spiritual beliefs?",
    "How important is religion or spirituality in your life?",
    "Would you date someone with different religious or spiritual beliefs?",
    "How would you describe your level of political engagement?",
    "Would you date someone with different political beliefs?",
    "Do you have pets?",
    "If yes, which pet do you have?",
  ];

  let userContent = "Below are 22 questions, followed by each user's responses.\n";
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

    // 3) Load full user docs in one query
    const users = await User.find(
      { _id: { $in: userIds } },
      "name avatar bio interests personality phoneNumber dateOfBirth isProfileComplete location preferences",
      { session }
    )
      .lean()
      .exec();

    if (!users.length) {
      throw createError(StatusCodes.NOT_FOUND, "Matched users not found");
    }

    // 4) Commit transaction (snapshot read only, no writes needed)
    await session.commitTransaction();
    session.endSession();

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Matched users retrieved successfully",
      data: { users },
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    return next(err);
  }
};
// ==================================

async function findMatches(userId: string, answers: string[], limitCount: number, session: mongoose.ClientSession): Promise<any[]> {
  // 1) Load user
  const user = await User.findById(userId, {}, { session });
  if (!user) throw new Error("User not found");

  // 2) Ensure answers array
  answers = answers?.length ? answers : user.compatibility || [];

  // 3) Save/update user's compatibility answers
  await User.findByIdAndUpdate(userId, { compatibility: answers }, { session }).exec();

  const pref = user.preferences;

  // 4) Fetch candidates matching preferences - ONLY COMPLETE PROFILES
  let candidates = await User.find({
    _id: { $ne: user._id },
    dateOfBirth: { $gte: ageToDOB(pref.age.max), $lte: ageToDOB(pref.age.min) },
    gender: { $in: pref.gender },
    bodyType: { $in: pref.bodyType },
    isMatch: false,
    isProfileComplete: true, // ONLY complete profiles
    ethnicity: { $in: pref.ethnicity },
    "location.latitude": { $exists: true },
    "location.longitude": { $exists: true },
  }, null, { session }
  ).lean();

  if (candidates.length === 0) {
    console.log("No candidates found matching criteria");
    return [];
  }

  // 5) Try bidirectional vector matching
  let scoredCandidates: { user: any; score: number }[];
  
  try {
    const candidateIds = candidates.map((c) => c._id.toString());
    const vectorScores = await findSimilarUsers(user, candidateIds, candidates.length);
    
    console.log(`✅ Using vector similarity scores for ${vectorScores.length} candidates`);
    
    // Map scores back to candidates
    const scoreMap = new Map(vectorScores.map((v) => [v.userId, v.score]));
    scoredCandidates = candidates.map((c) => ({
      user: c,
      score: (scoreMap.get(c._id.toString()) || 0) * 100, // Convert to 0-100 scale
    }));
  } catch (error: any) {
    console.warn("⚠️  Vector search failed, falling back to OpenAI compatibility");
    
    // Fallback to OpenAI compatibility scoring
    scoredCandidates = await Promise.all(
      candidates.map(async (c) => ({
        user: c,
        score: (await getCompatibilityScore(answers, c.compatibility || [])) ?? 0,
      }))
    );
    
    console.log(`✅ Using OpenAI compatibility scores for ${scoredCandidates.length} candidates`);
  }

  // 6) Apply STRICT distance filtering AFTER scoring
  const withinDistance = scoredCandidates.filter((item) => {
    const dist = calculateDistance(
      user.location.latitude,
      user.location.longitude,
      item.user.location.latitude,
      item.user.location.longitude
    );
    const isWithin = dist <= pref.distance;
    
    if (!isWithin) {
      console.log(
        `📍 Filtering out user ${item.user._id}: ${dist.toFixed(1)}km exceeds ${pref.distance}km preference`
      );
    }
    
    return isWithin;
  });

  console.log(`📍 ${withinDistance.length} matches within ${pref.distance}km distance preference`);

  // 7) Sort by score and return top N
  const topMatches = withinDistance
    .sort((a, b) => b.score - a.score)
    .slice(0, limitCount)
    .map((item) => ({
      user: item.user._id,
      score: item.score,
    }));

  console.log(`✅ Returning ${topMatches.length} matches (all within ${pref.distance}km)`);

  return topMatches;
}

const matchUser = async (
  req: Request<{ id: string }, {}, MatchRequestBody>,
  res: Response,
  next: NextFunction
): Promise<any> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = req.params.id;
    const { compatibility } = req.body;

    const podcastExists = await Podcast.exists({ primaryUser: userId, status: "NotScheduled" });
    if (podcastExists) {
      await session.abortTransaction();
      session.endSession();
      return res.status(StatusCodes.CONFLICT).json({
        success: false,
        message: "User already has a podcast not scheduled",
        data: {},
      });
    }

    // Find top matches
    const topMatches = await findMatches(userId, compatibility || [], 2, session);

    if (!topMatches.length) {
      await session.abortTransaction();
      session.endSession();
      return res.status(StatusCodes.OK).json({
        success: false,
        message: "No suitable matches found at this time",
        data: {},
      });
    }

    let participants = [
      {
        user: userId,
        score: 100,
        isQuestionAnswer: "",
      },
      ...topMatches.map((m) => ({
        user: m.user,
        score: m.score,
        isQuestionAnswer: ""
      })),
    ];

    const uniqueUsers = new Set();

    participants = participants.filter(p => {
      if (uniqueUsers.has(String(p.user))) return false;
      uniqueUsers.add(String(p.user));
      return true;
    });

    // Create podcast with participants
    const podcast = await Podcast.create(
      [
        {
          primaryUser: userId,
          participants,
          status: "NotScheduled",
        },
      ],
      { session }
    );

    // Mark users as matched
    const matchedUserIds = [userId, ...participants.map((p) => p.user)];

    if (topMatches?.length) {
      await User.updateMany(
        { _id: { $in: matchedUserIds } },
        { $set: { isMatch: true } },
        { session }
      );
    }

    await session.commitTransaction();
    session.endSession();

    console.log("====================✅ User successfully scheduled for the podcast=============================");

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Matched users successfully",
      data: podcast,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

// =================================

const findMatch = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    // 1) Load user
    const user = await User.findById(req.user.userId, null, { session });
    if (!user) {
      throw createError(StatusCodes.NOT_FOUND, "User not found");
    }

    // 2) Determine matchCount based on plan
    let matchCount: number;
    switch (user.subscription.plan) {
      case SubscriptionPlanName.LISTENER:
        matchCount = 2;
        break;
      case SubscriptionPlanName.SPEAKER:
        matchCount = 4;
        break;
      default:
        matchCount = 3;
    }

    // 3) Compute AI-based matches (this will update user's compatibility inside)
    const topMatches = await findMatches(req.user.userId, user.compatibility, matchCount, session);

    // 4) Format participants with primary user and matched users
    const participants = [
      {
        user: user._id,
        score: 100,
        isQuestionAnswer: "",
      },
      ...topMatches.map((m) => ({
        user: m.user,
        score: m.score,
        isQuestionAnswer: ""
      })),
    ];

    // 5) Update or create the podcast document
    const podcastUpdate = await Podcast.findOneAndUpdate(
      { primaryUser: user._id },
      { $set: { participants } },
      { new: true, session }
    );

    // 5) Commit and respond
    await session.commitTransaction();
    session.endSession();

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "User successfully updated matches for the podcast",
      data: podcastUpdate,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

const MatchedServices = {
  match,
  matchUser,
  getMatchedUsers,
  findMatch
};

export default MatchedServices;
