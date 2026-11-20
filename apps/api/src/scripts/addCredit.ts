import dotenv from "dotenv";
import mongoose from "mongoose";
import { grantUserCredits } from "../services/creditGrantService.js";

dotenv.config({
  path: new URL("../../../../.env", import.meta.url),
});

async function main() {
  const [userId, grantKey] = process.argv.slice(2);
  const uri = process.env.MONGODB_URI;

  if (!uri || !userId || !grantKey) {
    throw new Error(
      "Set MONGODB_URI and provide: <userProfileId> <uniqueGrantKey>",
    );
  }

  try {
    await mongoose.connect(uri);

    const result = await grantUserCredits({
      userId,
      grantKey,
      amount: 1,
      reason: "support_adjustment",
    });

    console.log(result);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
