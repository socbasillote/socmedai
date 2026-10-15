import UserProfile from "../models/UserProfile.js";

export type AuthenticatedUser = {
  id: string;
  email: string | null;
};

export async function findOrCreateUserProfile(authUser: AuthenticatedUser) {
  try {
    return await UserProfile.findOneAndUpdate(
      { supabaseUserId: authUser.id },
      {
        $set: {
          email: authUser.email ?? undefined,
        },
        $setOnInsert: {
          supabaseUserId: authUser.id,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    );
  } catch (error) {
    const isDuplicateKeyError =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000;

    if (!isDuplicateKeyError) {
      throw error;
    }

    const existingProfile = await UserProfile.findOne({
      supabaseUserId: authUser.id,
    });

    if (!existingProfile) {
      throw error;
    }

    return existingProfile;
  }
}
