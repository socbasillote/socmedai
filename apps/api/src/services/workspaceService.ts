import mongoose from "mongoose";

import UserProfile from "../models/UserProfile.js";
import Workspace from "../models/Workspace.js";
import {
  findOrCreateUserProfile,
  type AuthenticatedUser,
} from "./userProfileService.js";

export async function listUserWorkspaces(authUser: AuthenticatedUser) {
  const profile = await UserProfile.findOne({
    supabaseUserId: authUser.id,
  }).select("_id");

  if (!profile) {
    return [];
  }

  return Workspace.find({
    ownerUserId: profile._id,
  })
    .select("_id name ownerUserId settings createdAt updatedAt")
    .sort({ updatedAt: -1 })
    .lean();
}

export async function createUserWorkspace(
  authUser: AuthenticatedUser,
  name: string,
) {
  const profile = await findOrCreateUserProfile(authUser);

  const workspace = await Workspace.create({
    name,
    ownerUserId: profile._id,
    settings: {},
  });

  return workspace.toObject();
}

export function isValidWorkspaceId(id: string): boolean {
  return mongoose.isValidObjectId(id);
}

export async function getUserWorkspaceById(
  authUser: AuthenticatedUser,
  workspaceId: string,
) {
  const profile = await UserProfile.findOne({
    supabaseUserId: authUser.id,
  }).select("_id");

  if (!profile) {
    return null;
  }

  if (!mongoose.isValidObjectId(workspaceId)) {
    return null;
  }

  return Workspace.findOne({
    _id: workspaceId,
    ownerUserId: profile._id,
  })
    .select("_id name ownerUserId settings createdAt updatedAt")
    .lean();
}
