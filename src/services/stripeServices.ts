import Stripe from "stripe";
import { Request, Response, NextFunction } from "express";
import createError from "http-errors";
import { SubscriptionStatus } from "@shared/enums";
import { StatusCodes } from "http-status-codes";
import User from "@models/userModel";
import mongoose, { Types } from "mongoose";
import Notification from "@models/notificationModel";
import { ageToDOB } from "@utils/ageUtils";
import { calculateDistance } from "@utils/calculateDistanceUtils";
import Podcast from "@models/podcastModel";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = "gpt-4o";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/* ---------------- Compatibility Score ---------------- */
const getCompatibilityScore = async (
  userOneAnswers: string[],
  userTwoAnswers: string[]
): Promise<number | null> => {
  if (!userOneAnswers.length || !userTwoAnswers.length) return 0;

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
  userContent += "Please produce a single numeric compatibility score between 0 and 100.\n\n";

  for (let i = 0; i < questions.length; i++) {
    userContent += `Question ${i + 1}: ${questions[i]}\n`;
    userContent += `User1: ${userOneAnswers[i] || ""}\n`;
    userContent += `User2: ${userTwoAnswers[i] || ""}\n\n`;
  }

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.3,
      max_tokens: 50,
      messages: [
        { role: "system", content: "You are a dating compatibility algorithm. Output ONLY a number (0-100)." },
        { role: "user", content: userContent },
      ],
    });

    const raw = response.choices[0].message?.content?.trim() || "";
    if (!/^\d+(\.\d+)?$/.test(raw)) throw new Error("Invalid score");
    return parseFloat(raw);
  } catch (err) {
    console.error("OpenAI error:", err);
    return 0;
  }
};

/* ---------------- Match Finder ---------------- */
async function findMatches(
  userId: string,
  answers: string[],
  limitCount: number,
  session?: mongoose.ClientSession
): Promise<any[]> {
  const user = await User.findById(userId, {}, session ? { session } : {});
  if (!user) throw new Error("User not found");

  answers = answers?.length ? answers : user.compatibility || [];
  if (!answers.length) return [];

  await User.findByIdAndUpdate(userId, { compatibility: answers }, session ? { session } : {});

  const pref = user.preferences;

  let candidates = await User.find(
    {
      _id: { $ne: user._id },
      dateOfBirth: { $gte: ageToDOB(pref.age.max), $lte: ageToDOB(pref.age.min) },
      gender: { $in: pref.gender },
      bodyType: { $in: pref.bodyType },
      ethnicity: { $in: pref.ethnicity },
      isMatch: false,
      "location.latitude": { $exists: true },
      "location.longitude": { $exists: true },
    },
    null,
    session ? { session } : {}
  ).lean();

  candidates = candidates.filter((c) => {
    const dist = calculateDistance(
      user.location.latitude,
      user.location.longitude,
      c.location.latitude,
      c.location.longitude
    );
    return dist <= pref.distance;
  });

  // Limit OpenAI scoring to top 5 candidates to avoid timeout
  const limitedCandidates = candidates.slice(0, 5);

  const scored = await Promise.all(
    limitedCandidates.map(async (c) => ({
      user: c,
      score: await getCompatibilityScore(answers, c.compatibility || []),
    }))
  );

  return scored
    .map((item) => ({
      user: item.user._id,
      score: item.score ?? 0, // <- make sure score is never null
    }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0)) // <- coerce null to 0
    .slice(0, limitCount);
}

/* ---------------- STRIPE WEBHOOK ---------------- */
const webhook = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;
  const sig = req.headers["stripe-signature"] as string | undefined;

  if (!sig) {
    next(createError(StatusCodes.FORBIDDEN, "Missing Stripe signature"));
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err: any) {
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  try {
    switch (event.type) {
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
          const { userId, plan, fee, subscription_id } = subscription.metadata;

          if (!userId || !Types.ObjectId.isValid(userId)) throw new Error("Invalid user ID");

          const updatedUser = await User.findByIdAndUpdate(
            userId,
            {
              $set: {
                "subscription.id": subscription.id,
                "subscription.subscription_id": subscription_id,
                "subscription.plan": plan,
                "subscription.fee": fee,
                "subscription.startedAt": new Date(),
                "subscription.status": SubscriptionStatus.PAID,
              },
            },
            { new: true, session }
          );

          if (!updatedUser) throw new Error("User not found");

          // Determine limit
          // let limitCount = 2;
          // if (fee === "14.99") limitCount = 3;
          // if (fee === "29.99") limitCount = 4;

          // Find matches
          // const topMatches = await findMatches(userId, updatedUser.compatibility || [], limitCount, session);

          // if (!topMatches.length) {
          //   await session.commitTransaction();
          //   session.endSession();
          //   res.status(200).send("No matches found");
          //   return;
          // }

          // Prepare participants
          // let newParticipants = [
          //   { user: userId, score: 100, isQuestionAnswer: "" },
          //   ...topMatches.map((m) => ({ user: m.user, score: m.score, isQuestionAnswer: "" })),
          // ];

          // const seen = new Set<string>();
          // newParticipants = newParticipants.filter((p) => {
          //   if (seen.has(String(p.user))) return false;
          //   seen.add(String(p.user));
          //   return true;
          // });

          // Check existing podcast
          // let podcast = await Podcast.findOne({ "participants.user": userId }, {}, { session }) as any;

          // if (podcast) {
          //   const existingIds = new Set(podcast.participants.map((p: any) => String(p.user)));
          //   const additional = newParticipants.filter((p) => !existingIds.has(String(p.user)));
          //   const merged = [...podcast.participants, ...additional.slice(0, limitCount - podcast.participants.length)];
          //   podcast.participants = Array.from(new Map(merged.map((p) => [String(p.user), p])).values()).slice(0, limitCount);
          //   await podcast.save({ session });
          // } else {
          //   podcast = await Podcast.create(
          //     { primaryUser: userId, participants: newParticipants.slice(0, limitCount), status: "NotScheduled" },
          //     { session }
          //   );
          // }

          // const participantIds = podcast?.participants?.map((p: any) => p.user) || [];
          // if (participantIds.length) {
          //   await User.updateMany({ _id: { $in: participantIds } }, { $set: { isMatch: true } }, { session });
          // }

          await session.commitTransaction();
          session.endSession();
          res.status(200).send("Match processing completed");
          return;
        } catch (err) {
          await session.abortTransaction();
          session.endSession();
          console.error("Webhook error:", err);
          next(err);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
        const { userId, plan } = subscription.metadata;

        if (userId) {
          await User.findByIdAndUpdate(userId, { "subscription.status": SubscriptionStatus.FAILED });
          await Notification.create({
            type: "payment_failed",
            user: userId,
            message: [{ title: "Payment failed", description: `Your ${plan} subscription payment failed.` }],
            read: false,
            section: "user",
          });
        }

        res.status(200).send("Payment failure processed");
        return;
      }

      default:
        res.status(200).send("Event ignored");
        return;
    }
  } catch (err) {
    next(err);
  }
};

export default { webhook };
