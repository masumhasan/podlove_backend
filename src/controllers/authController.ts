import createError from "http-errors";
import { StatusCodes } from "http-status-codes";
import { Request, Response, NextFunction } from "express";
import Auth from "@models/authModel";
import User from "@models/userModel";
import Administrator from "@models/adminModel";
import { Method } from "@shared/enums";
import sendEmail from "@utils/sendEmail";
import sendSMS from "@utils/sendSMS";
import { sendPhoneVerificationMessage } from "./phone-verify/twilio.verify";
import VerifyPhone from "@models/phoneModel";
import { upsertUserVector } from "@services/vectorService";

const register = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  const {
    name,
    email,
    phoneNumber,
    password,
    confirmPassword,
    role,
    contact,
    address,
    dateOfBirth
  } = req.body;

  if (password !== confirmPassword) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json({ success: false, message: "Password does not match." });
  }

  // Check existing auth
  let auth = await Auth.findOne({ email });
  if (auth) {
    const message = auth.isVerified
      ? "Email already exists! Please login."
      : "Email already exists! Please verify your account";

    auth.generateVerificationOTP();
    await auth.save();

    return res.status(StatusCodes.CONFLICT).json({
      success: false,
      message,
      data: { isVerified: auth.isVerified, otp: auth.verificationOTP }
    });
  }

  // Create Auth account with OTP
  auth = new Auth({ email, password, phoneNumber });
  auth.generateVerificationOTP();
  await auth.save();

  // ================================
  // IF ROLE IS ADMIN → CREATE ADMIN
  // ================================
  if (role === "ADMIN") {

    const admin = new Administrator({
      name,
      email,
      contact,
      address,
      dateOfBirth,
      password,
      access: "ALL"
    });

    await admin.save();
    await sendEmail(email, auth.verificationOTP);

    return res.status(StatusCodes.CREATED).json({
      success: true,
      message: "Admin registered, please verify OTP.",
      data: {
        isVerified: auth.isVerified,
        otp: auth.verificationOTP
      }
    });

  } else {
    // =================================
    // OTHERWISE → NORMAL USER REGISTER
    // =================================
    const user = new User({
      auth: auth._id,
      name,
      phoneNumber,
    });

    await user.save();

    // Sync new user to Pinecone (non-blocking)
    upsertUserVector(user).catch((err) =>
      console.error("Failed to sync new user to Pinecone:", err)
    );

    await sendEmail(email, auth.verificationOTP);
  }




  return res.status(StatusCodes.CREATED).json({
    success: true,
    message: "Please check your email for OTP.",
    data: {
      isVerified: auth.isVerified,
      otp: auth.verificationOTP
    }
  });
};

const activate = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  const { email, otp } = req.body;
  const auth = await Auth.findByEmailWithOutPassword(email);
  if (!auth) throw createError(StatusCodes.NOT_FOUND, "User not found");

  if (!auth.isCorrectVerificationOTP(otp))
    throw createError(StatusCodes.UNAUTHORIZED, "Wrong OTP. Please enter the correct code");

  if (auth.isVerificationOTPExpired()) throw createError(StatusCodes.UNAUTHORIZED, "Verification OTP has expired.");

  auth.clearVerificationOTP();
  auth.isVerified = true;
  await auth.save();
  const accessToken = Auth.generateAccessToken(auth._id!.toString());
  const user = await User.findOne({ auth: auth._id }).populate({ path: "auth", select: "email" });

  return res.status(StatusCodes.OK).json({
    success: true,
    message: "Account successfully verified.",
    data: { accessToken, auth, user },
  });
};

const login = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  const { email, password } = req.body;

  let auth = await Auth.findOne({ email });

  if (!auth) {
    return next(createError(StatusCodes.NOT_FOUND, "No account found with the given email"));
  }


  if (!auth.isVerified) {
    await User.deleteOne({ auth: auth._id });
    await Administrator.deleteOne({ email: auth.email });

    await Auth.deleteOne({ _id: auth._id });

    return next(createError(StatusCodes.NOT_FOUND, "No registered account exists"));
  }

  if (auth.googleId) {
    return next(
      createError(StatusCodes.BAD_GATEWAY, "Your account is connected to Google. Please sign in with Google.")
    );
  }

  // If account blocked
  if (auth.isBlocked) {
    return next(
      createError(StatusCodes.FORBIDDEN,
        "Your account has been blocked by an administrator. Please reach out to the admin for help."
      )
    );
  }

  // Password check
  if (!(await auth.comparePassword(password))) {
    return next(createError(StatusCodes.UNAUTHORIZED, "Wrong password. Please try again"));
  }

  // Generate Token
  const accessToken = Auth.generateAccessToken(auth._id!.toString());

  const user = await User.findOne({ auth: auth._id })
    .populate({ path: "auth", select: "email" });

  return res.status(StatusCodes.OK).json({
    success: true,
    message: "Login successful",
    data: { accessToken, auth, user }
  });
};


const signInWithGoogle = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const { googleId, name, email, avatar } = req.body;

    let auth = await Auth.findOne({ $or: [{ googleId }, { email }] });
    let user;

    if (!auth) {
      auth = await Auth.create({ googleId, email });
      user = await User.create({ auth: auth._id, name, avatar });
    } else {
      if (!auth.googleId) {
        auth.googleId = googleId;
        await auth.save();
      }
      user = await User.findOne({ auth: auth._id });
    }

    const accessToken = Auth.generateAccessToken(auth._id!.toString());

    user = await User.findOne({ auth: auth._id }).populate({
      path: "auth",
      select: "email",
    });

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Login successful",
      data: { accessToken, auth, user },
    });
  } catch (error) {
    console.error("Google sign-in error:", error);
    return next(error);
  }
};

const signInWithApple = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const { appleId, name, email } = req.body;

    // Check required fields
    if (!appleId || !email) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Apple ID and email are required to log in.",
      });
    }

    let auth = await Auth.findOne({ $or: [{ appleId }, { email }] });
    let user;

    if (!auth) {
      auth = await Auth.create({ appleId, email });
      user = await User.create({ auth: auth._id, name });
    } else {
      if (!auth.appleId) {
        auth.appleId = appleId;
        await auth.save();
      }
      user = await User.findOne({ auth: auth._id });
    }

    if (!user) {
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: "Something went wrong while creating your account. Please try again.",
      });
    }

    const accessToken = Auth.generateAccessToken(auth._id!.toString());

    user = await User.findOne({ auth: auth._id }).populate({
      path: "auth",
      select: "email",
    });

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "You have successfully logged in!",
      data: { accessToken, auth, user },
    });
  } catch (error: any) {
    console.error("Apple sign-in error:", error);

    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Oops! Something went wrong. Please try again later.",
    });
  }
};

// const signInWithApple = async (req: Request, res: Response, next: NextFunction) => {
//   try {
//     const { id_token } = req.body;

//     if (!id_token) return res.status(StatusCodes.BAD_REQUEST).json({ message: "Missing Apple ID token" });

//     const decodedHeader = jwt.decode(id_token, { complete: true }) as { header: { kid: string } };
//     const kid = decodedHeader.header.kid;
//     const applePublicKey = await getApplePublicKey(kid);

//     const verified = jwt.verify(id_token, applePublicKey, { algorithms: ["RS256"] }) as any;

//     const appleId = verified.sub;
//     const email = verified.email;
//     const name = verified.name || "Apple User";

//     // Check if user exists
//     let user = await User.findOne({ appleId });
//     if (!user) {
//       user = await User.create({ appleId, email, name, isProfileComplete: false });
//     }

//     const userEmail = (user as any).email || (user.auth as any)?.email;

//     const accessToken = jwt.sign({ id: user._id, email: userEmail }, process.env.JWT_SECRET!, {
//       expiresIn: "7d",
//     });

//     return res.status(StatusCodes.OK).json({
//       success: true,
//       message: "Signed in with Apple successfully",
//       data: { accessToken, user },
//     });
//   } catch (err) {
//     console.error("Apple login error:", err);
//     return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
//       success: false,
//       message: (err as Error).message || "Apple login failed",
//     });
//   }
// };

const recovery = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  const { email } = req.body;

  console.log("email", email);

  let auth = await Auth.findOne({ email });
  if (!auth) return next(createError(StatusCodes.NOT_FOUND, "No accounts found with the given email!"));
  auth.generateRecoveryOTP();
  await auth.save();
  await sendEmail(email, auth.recoveryOTP);
  return res
    .status(StatusCodes.OK)
    .json({ success: true, message: "Success", data: { recoveryOTP: auth.recoveryOTP } });
};

const recoveryVerification = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  const { email, otp } = req.body;
  let auth = await Auth.findOne({ email });
  if (!auth) throw createError(StatusCodes.NOT_FOUND, "User not found");

  if (auth.isRecoveryOTPExpired()) return next(createError(StatusCodes.UNAUTHORIZED, "Recovery OTP has expired."));
  if (!auth.isCorrectRecoveryOTP(otp))
    return next(createError(StatusCodes.UNAUTHORIZED, "Wrong OTP. Please try again"));
  auth.clearRecoveryOTP();

  await auth.save();
  return res.status(StatusCodes.OK).json({
    success: true,
    message: "Email successfully verified.",
    data: {},
  });
};

const resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  const { email, password, confirmPassword } = req.body;

  let auth = await Auth.findOne({ email });
  if (!auth) throw createError(StatusCodes.NOT_FOUND, "User Not Found");
  if (password !== confirmPassword) return next(createError(StatusCodes.BAD_REQUEST, "Passwords don't match"));

  auth.password = password;
  await auth.save();
  return res.status(StatusCodes.OK).json({ success: true, message: "Password reset successful", data: {} });
};

type resendOTPPayload = {
  method: Method;
  email: string;
};

const resendOTP = async (req: Request<{}, {}, resendOTPPayload>, res: Response, next: NextFunction): Promise<any> => {
  const { method, email } = req.body;
  // // console.log("resend otp: ", req.body);

  const auth = await Auth.findOne({ email });
  // // console.log("auth: ", auth);
  if (!auth) throw createError(StatusCodes.NOT_FOUND, "Account not found");

  if ((method === Method.emailActivation || method === Method.phoneActivation) && auth.isVerified)
    return res.status(StatusCodes.CONFLICT).json({
      success: true,
      message: "Your account is already verified. Please login.",
      data: { isVerified: auth.isVerified },
    });
  if (method === Method.emailActivation && !auth.isVerified) {
    auth.generateVerificationOTP();
    await auth.save();
    await sendEmail(email, auth.verificationOTP);
    return res.status(StatusCodes.OK).json({
      success: true,
      message: "OTP resend successful",
      data: { isVerified: auth.isVerified, verificationOTP: auth.verificationOTP },
    });
  } else if (method === Method.phoneActivation && !auth.isVerified) {
    auth.generateVerificationOTP();
    await auth.save();

    let user = await User.findOne({ auth: auth._id });
    await sendSMS(user!.phoneNumber, auth.verificationOTP);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "OTP resend successful",
      data: { isVerified: auth.isVerified, verificationOTP: auth.verificationOTP },
    });
  } else if (method === Method.emailRecovery) {
    auth.generateRecoveryOTP();
    await auth.save();
    await sendEmail(email, auth.recoveryOTP);

    return res
      .status(StatusCodes.OK)
      .json({ success: true, message: "OTP resend successful", data: { recoveryOTP: auth.recoveryOTP } });
  }
};

const changePassword = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  const user = req.user;
  const { password, newPassword, confirmPassword } = req.body;

  console.log("req.user: ", req.user, password, newPassword, confirmPassword);

  let auth = await Auth.findOne({ email: user.email });
  if (!auth) throw createError(StatusCodes.NOT_FOUND, "User Not Found");
  if (!(await auth.comparePassword(password)))
    return next(createError(StatusCodes.UNAUTHORIZED, "Wrong Password. Please try again."));

  auth.password = newPassword;
  await auth.save();
  return res.status(StatusCodes.OK).json({ success: true, message: "Password changed successfully", data: {} });
};

const remove = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  const userId = req.user.userId;
  const authId = req.user.authId;
  await Promise.all([Auth.findByIdAndDelete(authId), User.findByIdAndDelete(userId)]);
  return res.status(StatusCodes.OK).json({ success: true, message: "User Removed successfully", data: {} });
};

const sendPhoneVerificationsOPT = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  const phone = req.body.phone;
  const phoneNumber = phone;

  const result = await sendPhoneVerificationMessage(phoneNumber)

  return res.status(StatusCodes.OK).json({ success: true, message: "Message sent successfully", data: result });
};

const verifyPhoneOtp = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const phone = req.body.phone;
    const submittedOtp = req.body.otp;

    if (!phone || !submittedOtp) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        invalid: true,
        message: "Phone number and OTP are required.",
      });
    }

    const record = await VerifyPhone.findOne({ number: phone });

    if (!record) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        invalid: true,
        message: "No OTP found for this phone number.",
      });
    }

    if (record.used) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        invalid: true,
        message: "OTP already used.",
      });
    }

    if (!record.otpExpiredAt || record.otpExpiredAt < new Date()) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        invalid: true,
        message: "OTP expired.",
      });
    }

    if (record.otp !== submittedOtp) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        invalid: true,
        message: "Incorrect OTP.",
      });
    }

    // Mark OTP as used
    record.used = true;
    await record.save();

    return res.status(StatusCodes.OK).json({
      success: true,
      invalid: false,
      message: "Phone verification successful.",
    });

  } catch (error: any) {
    console.error("OTP verification error:", error);

    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      invalid: true,
      message: "Something went wrong during OTP verification.",
      errorDetails: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

const AuthController = {
  verifyPhoneOtp,
  register,
  activate,
  login,
  signInWithGoogle,
  signInWithApple,
  recovery,
  recoveryVerification,
  resendOTP,
  resetPassword,
  changePassword,
  remove,
  sendPhoneVerificationsOPT
};

export default AuthController;
