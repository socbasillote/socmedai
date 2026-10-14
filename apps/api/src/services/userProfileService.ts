import UserProfile from "../models/UserProfile.js";

export type AuthenticatedUser = {
  id: string;
  email: string | null;
};

export async function findOrCreateUserProfile(authUser: AuthenticatedUser) {
  const profile = await UserProfile.findOneAndUpdate(
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

  return profile;
}
