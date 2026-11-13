import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

// Run from the apps/api workspace.
// Load the root Storm development environment.
config({ path: "../../.env", quiet: true });

const BUCKET_NAME = "storm-media";

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase storage credentials are not configured.");
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await supabase.storage.getBucket(BUCKET_NAME);

  if (error || !data) {
    throw new Error("Unable to verify the Storm media bucket.");
  }

  if (data.name !== BUCKET_NAME) {
    throw new Error(
      "The returned bucket does not match Storm's configuration.",
    );
  }

  if (data.public !== false) {
    throw new Error("SECURITY CHECK FAILED: Storm media bucket is public.");
  }

  console.log("Storm private storage verification");
  console.log("----------------------------------");
  console.log("Bucket:", data.name);
  console.log("Private:", true);
  console.log("File size limit:", data.file_size_limit ?? "Project default");
  console.log(
    "Allowed MIME types:",
    data.allowed_mime_types ?? "Project default",
  );
  console.log("----------------------------------");
  console.log("PASS: Bucket exists and is private.");
  console.log("No objects were uploaded, modified, or deleted.");
}

main().catch(() => {
  console.error("FAIL: Private bucket verification did not pass.");

  process.exitCode = 1;
});
