import OpenAI from "openai";
import "dotenv/config";
import * as process from "node:process";
import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import createError from "http-errors";
import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
  GenerateContentRequest,
  GenerationConfig,
  SafetySetting,
} from "@google/generative-ai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error(
    "Error: GEMINI_API_KEY environment variable not set." +
    " Get a key from Google AI Studio: https://aistudio.google.com/"
  );
  // Decide how to handle this - throw, exit, or make analyzeBioGemini always return false
  // For this example, we'll proceed, but the API call will fail later if key is missing.
}

// const user1Responses = [
//   "Larger gatherings",
//   "Head (logic)",
//   "A weekend hiking trip in nature",
//   "Extremely important – I am always working on bettering myself",
//   "Quality time (spending focused time together)",
//   "Building a family with a partner",
//   "No",
//   "Yes",
//   "No",
//   "No",
//   "No",
//   "Socially – I drink occasionally in social settings",
//   "Depends",
//   "Yes, I'm religious",
//   "Christianity",
//   "",
//   "Very important",
//   "Yes, I'm open to dating someone with different beliefs",
//   "Somewhat political – I stay informed about politics and discuss it occasionally",
//   "Yes, I'm open to dating someone with different political views",
//   "No",
//   ""
// ];

// const user2Responses = [
//   "Relaxing with close friends",
//   "Heart (feelings)",
//   "A cozy movie night at home",
//   "Moderately important – I like to grow but not obsessively",
//   "Words of affirmation (compliments, verbal expressions of love)",
//   "Living a simple, peaceful life surrounded by loved ones",
//   "Yes",
//   "Maybe",
//   "Maybe",
//   "Yes",
//   "Maybe",
//   "Rarely – I drink only on special occasions (e.g., holidays, celebrations)",
//   "No",
//   "No, I'm not religious or spiritual",
//   "",
//   "",
//   "Not important at all",
//   "No, I prefer someone who shares my beliefs",
//   "Not at all political – I don't follow politics and prefer to avoid political discussions",
//   "No",
//   ""
// ];

async function getCompatibilityScore(user1: string[], user2: string[]) {
  const prompt = `
Below are responses from two individuals answering dating questions.
Calculate their compatibility as a number between 0 and 100.
**IMPORTANT:** Your output MUST be a single numeric value only, with no additional text, spaces, or punctuation.

User 1 responses:
1. Do you prefer spending your weekends socializing in larger gatherings or relaxing at home with a few close friends? ${user1[0]}
2. When faced with a major life decision, do you usually follow your head (logic) or your heart (feelings)? ${user1[1]}
3. Which of these activities sounds most appealing to you? ${user1[2]}
4. How important is personal growth in your life? ${user1[3]}
5. How do you like to show affection? ${user1[4]}
6. How do you envision your ideal future? ${user1[5]}
7. Do you have kids? ${user1[6]}
8. Do you want kids in the future? ${user1[7]}
9. Will you date a person who has kids? ${user1[8]}
10. Do you smoke? ${user1[9]}
11. Will you date a smoker? ${user1[10]}
12. How would you describe your drinking habits? ${user1[11]}
13. If "Never", would you be comfortable dating someone who drinks? ${user1[12]}
14. Do you consider yourself religious or spiritual? ${user1[13]}
15. If "Religious", what is your religion or denomination? ${user1[14]}
16. If "Spiritual", would you like to describe your spiritual beliefs? ${user1[15]}
17. How important is religion or spirituality in your life? ${user1[16]}
18. Would you date someone with different religious or spiritual beliefs? ${user1[17]}
19. How would you describe your level of political engagement? ${user1[18]}
20. Would you date someone with different political beliefs? ${user1[19]}
21. Do you have pets? ${user1[20]}
22. If yes, which pet do you have? ${user1[21]}

User 2 responses:
1. Do you prefer spending your weekends socializing in larger gatherings or relaxing at home with a few close friends? ${user2[0]}
2. When faced with a major life decision, do you usually follow your head (logic) or your heart (feelings)? ${user2[1]}
3. Which of these activities sounds most appealing to you? ${user2[2]}
4. How important is personal growth in your life? ${user2[3]}
5. How do you like to show affection? ${user2[4]}
6. How do you envision your ideal future? ${user2[5]}
7. Do you have kids? ${user2[6]}
8. Do you want kids in the future? ${user2[7]}
9. Will you date a person who has kids? ${user2[8]}
10. Do you smoke? ${user2[9]}
11. Will you date a smoker? ${user2[10]}
12. How would you describe your drinking habits? ${user2[11]}
13. If "Never", would you be comfortable dating someone who drinks? ${user2[12]}
14. Do you consider yourself religious or spiritual? ${user2[13]}
15. If "Religious", what is your religion or denomination? ${user2[14]}
16. If "Spiritual", would you like to describe your spiritual beliefs? ${user2[15]}
17. How important is religion or spirituality in your life? ${user2[16]}
18. Would you date someone with different religious or spiritual beliefs? ${user2[17]}
19. How would you describe your level of political engagement? ${user2[18]}
20. Would you date someone with different political beliefs? ${user2[19]}
21. Do you have pets? ${user2[20]}
22. If yes, which pet do you have? ${user2[21]}

Now, output ONLY a single numeric value (for example, 75) representing the compatibility score between these two individuals.
`;
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.3,
      max_tokens: 50,
      messages: [
        {
          role: "system",
          content:
            "You are a dating compatibility algorithm. Your job is to compute a compatibility score between 0 and 100 from two sets of responses. Your answer must be only a number, with no extra text, punctuation, or explanation.",
        },
        { role: "user", content: prompt },
      ],
    });

    const rawOutput = response.choices[0].message!.content!.trim();
    const compatibilityScore = parseFloat(rawOutput);
    if (isNaN(compatibilityScore)) {
      throw new Error(`Received output is not a valid number: "${rawOutput}"`);
    }
    // console.log(compatibilityScore);
    return compatibilityScore;
  } catch (error: any) {
    console.error("Error during API call:", error.response ? error.response.data : error.message);
  }
}

const questions = [
  {
    question: "Do you believe in mutual respect and understanding in a relationship?",
    options: ["Strongly Disagree", "Disagree", "Neutral", "Agree", "Strongly Agree"],
  },
  { question: "Are you open to discussing personal values and beliefs with your partner?", options: ["Yes", "No"] },
  { question: "Do you prefer long-term commitment over casual dating?", options: ["Yes", "No", "Not sure yet"] },
  { question: "What qualities do you value most in a partner?", options: [] },
  { question: "Do you think emotional intelligence is important in a relationship?", options: ["Strongly Disagree", "Disagree", "Neutral", "Agree", "Strongly Agree"] },
  { question: "Have you worked on personal growth and self-improvement for a better relationship?", options: ["Yes", "No"] },
  { question: "Do you believe trust is the foundation of a healthy relationship?", options: ["Strongly Disagree", "Disagree", "Neutral", "Agree", "Strongly Agree"] },
  { question: "Are you willing to compromise and adapt in a relationship?", options: ["Yes", "No", "Not sure yet"] },
  { question: "Do you think communication plays a crucial role in maintaining a relationship?", options: ["Yes", "No"] },
  { question: "Are you ready to invest time and effort into building a meaningful relationship?", options: ["Strongly Disagree", "Disagree", "Neutral", "Agree", "Strongly Agree"] },
];

async function isUserSuitable(req: Request, res: Response, next: NextFunction): Promise<any> {

  const userResponses: string[] = Array.isArray(req.body.userResponses) ? req.body.userResponses : [];

  if (!userResponses.length) {
    console.error(`userResponses are required and must be an array.`);
    return next(createError(StatusCodes.BAD_REQUEST, "userResponses are required and must be an array."));
  }

  // Build prompt safely
  let prompt = "Below are responses from a user answering the following dating suitability questions:\n\n";
  questions?.forEach((q, index) => {
    const answer = userResponses[index] ?? "No response";
    prompt += `${index + 1}. ${q.question} ${answer}\n`;
  });

  prompt += "\nBased on the user's responses, determine if the user is suitable for the app. ";
  prompt += "Output only 'true' if the user is suitable and 'false' if not. ";
  prompt += "Do not include any additional text, punctuation, spaces, or explanation.";

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      max_tokens: 10,
      messages: [
        {
          role: "system",
          content: "You are a dating suitability algorithm. Evaluate the user's responses and determine if the user is suitable for the app. Output only 'true' or 'false' with no extra text.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const rawOutput = response.choices[0].message?.content?.trim();

    if (rawOutput !== "true" && rawOutput !== "false") {
      throw new Error(`Invalid output from AI: "${rawOutput}"`);
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Success",
      data: { isSuitable: rawOutput === "true" },
    });
  } catch (error: any) {
    console.error("Error during AI call:", error.response?.data || error.message);
    return next(error);
  }
}

const analyzeBio = async (bio: string) => {
  const prompt = `
Review the following bio for inappropriate content or garbage:
1. Inappropriate: profanity, hate speech, or explicit content
2. Garbage: spam, random characters, or nonsensical phrases
3: Identifiable Personali detailes: name, age, location, gender any information that can be used to identify the person. But Allow non-identifiable personal details (e.g., "I like soccer").

Bio:
"${bio}"

Return a boolean: true if no issues, false if inappropriate or garbage content is found.
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.3,
      max_tokens: 50,
      messages: [
        {
          role: "system",
          content:
            "Content moderation tool. Check bios for inappropriate or garbage content, allow non-identifiable personal preferences.",
        },
        { role: "user", content: prompt },
      ],
    });
    const rawOutput = response.choices[0]?.message?.content?.trim().toLowerCase();
    if (!rawOutput) return false;

    if (rawOutput.includes("true")) return true;
    if (rawOutput.includes("false")) return false;

    return false;
  } catch (error: any) {
    console.error("Error during API call:", error?.response?.data || error.message);
    return false;
  }
};

const OpenaiServices = {
  getCompatibilityScore,
  isUserSuitable,
  analyzeBio,
};

// getCompatibilityScore(user1Responses, user2Responses);

export default OpenaiServices;
