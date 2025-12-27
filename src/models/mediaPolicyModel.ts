import { Schema, Document, model, Model } from "mongoose";
import { logger } from "@shared/logger";

type MediaPolicySchema = Document & {
  text: string;
};

const mediaPolicySchema = new Schema<MediaPolicySchema>({
  text: {
    type: String,
  },
});

mediaPolicySchema.statics.findOrCreate = async function (): Promise<void> {
  const mediaPolicy = await this.findOne();
  if (!mediaPolicy) {
    await this.create({ text: "Media Policy" });
    logger.info(" ✅ Media Policy added Successfully!");
  } else {
    logger.info("Media Policy exists!");
  }
};

type MediaPolicyModel = Model<MediaPolicySchema> & {
  findOrCreate(): Promise<void>;
};

const MediaPolicy = model<MediaPolicySchema, MediaPolicyModel>("MediaPolicy", mediaPolicySchema);
export default MediaPolicy;
