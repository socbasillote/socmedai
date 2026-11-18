import { expect, it, vi } from "vitest";
import { ScheduledLeaseSignal } from "./scheduledPublishingHeartbeat.js";
import { publishLinkedInTextPost } from "../linkedin/linkedinPostService.js";
import { createScheduledPostWorkerRuntime } from "../../workers/scheduledPostWorkerRuntime.js";
it("refuses an external request after ownership is lost", async () => {
 const lease = new ScheduledLeaseSignal(); lease.markLost("ownership-rejected"); const transport = vi.fn();
 await expect(publishLinkedInTextPost({ accessToken: "token", linkedinMemberId: "member", caption: "Caption", beforeRequest: () => lease.assertOwnership() }, transport)).rejects.toThrow("ownership lost");
 expect(transport).not.toHaveBeenCalled();
});
it("drains a bounded concurrent batch without duplicate claims", async () => {
 let next = 0; let active = 0; let maxActive = 0; const seen = new Set<string>();
 const runtime = createScheduledPostWorkerRuntime({ recoverStalePublishingPosts: async () => ({ modifiedCount: 0 }), claimNextDuePost: async () => next < 8 ? { _id: String(next++), scheduledClaimId: "claim" } : null,
 withHeartbeat: async (_opts, operation) => operation(new ScheduledLeaseSignal()), dispatchScheduledPost: async (id) => { expect(seen.has(id)).toBe(false); seen.add(id); active++; maxActive = Math.max(maxActive, active); await new Promise((resolve) => setTimeout(resolve, 5)); active--; } }, { automaticPublishingEnabled: true, concurrency: 4, batchSize: 10 });
 await runtime.poll(); await runtime.stop(); expect(seen.size).toBe(8); expect(maxActive).toBe(4);
});
it("releases a claim when shutdown begins before dispatch", async () => {
 let resolve!: (post: { _id: string; scheduledClaimId: string }) => void;
 const release = vi.fn(async () => {}), dispatch = vi.fn();
 const runtime = createScheduledPostWorkerRuntime({ recoverStalePublishingPosts: async () => ({ modifiedCount: 0 }), claimNextDuePost: () => new Promise((done) => { resolve = done; }), releaseUnsubmittedClaim: release, dispatchScheduledPost: dispatch,
 withHeartbeat: async (_opts, operation) => operation(new ScheduledLeaseSignal()) }, { automaticPublishingEnabled: true });
 const poll = runtime.poll(); await Promise.resolve(); const stopped = runtime.stop(); resolve({ _id: "post", scheduledClaimId: "claim" }); await poll; await stopped;
 expect(release).toHaveBeenCalledWith("post", "claim"); expect(dispatch).not.toHaveBeenCalled();
});
