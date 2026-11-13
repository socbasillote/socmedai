import "dotenv/config";

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";

config({ path: "../../.env", quiet: true });

const BUCKET = "storm-media";
const EXPIRY_SECONDS = 60;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Smoke test must not run in production.");
  }

  if (process.env.STORM_STORAGE_SMOKE_TEST !== "true") {
    throw new Error(
      "Set STORM_STORAGE_SMOKE_TEST=true to authorize the disposable upload.",
    );
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase credentials are missing.");
  }

  const supabase = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: bucket, error: bucketError } =
    await supabase.storage.getBucket(BUCKET);

  if (bucketError || !bucket || bucket.public !== false) {
    throw new Error("Storm storage bucket must exist and be private.");
  }

  // Unique key: never reuse or overwrite an
  // existing application asset.
  const objectKey = `smoke-tests/${randomUUID()}.png`;

  const bytes = await sharp({
    create: {
      width: 64,
      height: 64,
      channels: 4,
      background: {
        r: 40,
        g: 100,
        b: 180,
        alpha: 1,
      },
    },
  })
    .png()
    .toBuffer();

  const expectedHash = sha256(bytes);

  let uploaded = false;
  let uploadAttempted = false;
  let completed = false;

  try {
    console.log("1. Uploading disposable PNG");

    uploadAttempted = true;

    const upload = await supabase.storage
      .from(BUCKET)
      .upload(objectKey, Uint8Array.from(bytes), {
        contentType: "image/png",
        upsert: false,
      });

    if (upload.error) {
      throw new Error("Disposable image upload was not confirmed.");
    }

    uploaded = true;

    console.log("2. Verifying stored image");

    const download = await supabase.storage.from(BUCKET).download(objectKey);

    if (download.error || !download.data) {
      throw new Error("Stored image could not be downloaded.");
    }

    const downloaded = Buffer.from(await download.data.arrayBuffer());

    if (
      downloaded.length !== bytes.length ||
      sha256(downloaded) !== expectedHash
    ) {
      throw new Error("Stored image checksum mismatch.");
    }

    console.log("3. Checking anonymous public access");

    const baseUrl = new URL(url);
    const encodedPath = objectKey.split("/").map(encodeURIComponent).join("/");

    const publicUrl = new URL(
      `/storage/v1/object/public/${BUCKET}/${encodedPath}`,
      baseUrl,
    );

    const publicResponse = await fetch(publicUrl);

    if (publicResponse.ok) {
      throw new Error(
        "SECURITY FAILURE: Private image is publicly accessible.",
      );
    }

    if (![400, 401, 403, 404].includes(publicResponse.status)) {
      throw new Error("Public access check was inconclusive.");
    }

    console.log("4. Verifying signed URL access");

    const signed = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(objectKey, EXPIRY_SECONDS);

    if (signed.error || !signed.data?.signedUrl) {
      throw new Error("Signed URL creation failed.");
    }

    const signedResponse = await fetch(signed.data.signedUrl);

    if (!signedResponse.ok) {
      throw new Error("Signed URL download failed.");
    }

    const signedBytes = Buffer.from(await signedResponse.arrayBuffer());

    if (
      signedBytes.length !== bytes.length ||
      sha256(signedBytes) !== expectedHash
    ) {
      throw new Error("Signed URL returned unexpected image bytes.");
    }

    completed = true;
  } finally {
    // Only remove the unique key created for this
    // invocation. Never delete application images.
    //
    // If upload was attempted but not confirmed,
    // leave the key for investigation instead of
    // assuming the remote outcome.
    if (uploaded) {
      console.log("5. Removing disposable object");

      try {
        const cleanup = await supabase.storage.from(BUCKET).remove([objectKey]);

        if (cleanup.error) {
          console.error("Delete error:", cleanup.error);
          throw new Error("Cleanup failed.");
        }

        // Verify that the exact object is absent.
        const filename = objectKey.split("/").pop()!;

        const verification = await supabase.storage
          .from(BUCKET)
          .list("smoke-tests", {
            search: filename,
            limit: 100,
          });

        if (verification.error) {
          console.error("Verification error:", verification.error);
          throw new Error("Could not verify object deletion.");
        }

        const stillExists = verification.data.some(
          (item) => item.name === filename,
        );

        if (stillExists) {
          throw new Error("Disposable object still exists.");
        }

        console.log("Cleanup confirmed");
      } catch (error) {
        console.error("Cleanup failure:", error);

        completed = false;
        process.exitCode = 1;
      }
    } else if (uploadAttempted) {
      console.error(
        "Upload outcome uncertain. Inspect the smoke-tests prefix.",
      );

      process.exitCode = 1;
    }
  }

  if (!completed || process.exitCode) {
    throw new Error("Storage smoke test did not complete safely.");
  }

  console.log("--------------------------------");
  console.log("PASS: Upload verified");
  console.log("PASS: SHA-256 integrity verified");
  console.log("PASS: Public object access blocked");
  console.log("PASS: Signed URL verified");
  console.log("PASS: Disposable object removed");
  console.log("--------------------------------");
}

main().catch(() => {
  console.error(
    "FAIL: Private storage smoke test. Check the smoke-tests folder for any remaining object.",
  );

  process.exitCode = 1;
});
