vi.mock("@/hooks/usePublishingCapabilities", () => ({ usePublishingCapabilities: () => ({
  facebook: { publishNow: true, schedule: true },
  linkedin: { publishNow: true, schedule: true },
  instagram: { publishNow: true, schedule: true },
}) }));
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Post } from "@/lib/posts";

import {
  createPost,
  getPostById,
  publishPostNow,
  updateDraftPost,
} from "@/lib/posts";

import { PostEditorRoute } from "./PostEditorRoute";

const WORKSPACE_A = "507f1f77bcf86cd799439011";
const WORKSPACE_B = "507f1f77bcf86cd799439012";
const POST_A = "507f1f77bcf86cd799439013";
const POST_B = "507f1f77bcf86cd799439014";
const LINKEDIN_ID = "507f1f77bcf86cd799439015";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  workspace: {
    current: "507f1f77bcf86cd799439011",
  },
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mocks.navigate,
  useLocation: () => ({
    search: "",
  }),
}));

vi.mock("@/hooks/useWorkspaces", () => ({
  useWorkspaces: () => ({
    workspaces: [
      { _id: WORKSPACE_A, name: "Workspace A" },
      { _id: WORKSPACE_B, name: "Workspace B" },
    ],
    selectedWorkspaceId: mocks.workspace.current,
    workspacesLoading: false,
    workspaceError: "",
  }),
}));

vi.mock("@/auth/useAuth", () => ({
  useAuth: () => ({
    user: {
      id: "11111111-2222-4333-8444-555555555555",
    },
    loading: false,
  }),
}));

vi.mock("@/hooks/useInstagramConnections", () => ({
  useInstagramConnections: () => ({ connections: [{ id: "instagram-connection", username: "studio", instagramUserId: "123", status: "connected", canPublish: true }], loading: false, error: "", connect: vi.fn() }),
}));

vi.mock("@/hooks/useLinkedInConnection", () => ({
  useLinkedInConnection: () => ({
    status: "connected",
    displayName: "Test LinkedIn Account",
    connectionId: LINKEDIN_ID,
    statusError: "",
  }),
}));

vi.mock("@/lib/facebookConnections", () => ({
  getFacebookPageConnections: vi.fn(async () => []),
}));

vi.mock("@/lib/posts", () => ({
  createPost: vi.fn(),
  getPostById: vi.fn(),
  updateDraftPost: vi.fn(),
  publishPostNow: vi.fn(),
}));

vi.mock("@/components/PostEditorPage", () => ({
  PostEditorPage: ({
    children,
    sidebar,
  }: {
    children: React.ReactNode;
    sidebar?: React.ReactNode;
  }) => (
    <div>
      <div data-testid="sidebar">{sidebar}</div>
      <div data-testid="editor">{children}</div>
    </div>
  ),
}));

vi.mock("@/components/PostPreview", () => ({
  PostPreview: () => null,
}));

vi.mock("@/features/publishing/components/PublishingChecklistPanel", () => ({
  PublishingChecklistPanel: () => null,
}));

vi.mock("@/features/publishing/components/PublishingControls", () => ({
  PublishingControls: ({
    onPostModeChange,
  }: {
    onPostModeChange: (mode: "draft" | "scheduled" | "immediate") => void;
  }) => (
    <button type="button" onClick={() => onPostModeChange("immediate")}>
      Choose Publish Now
    </button>
  ),
}));

vi.mock("@/components/PostEditorForm", () => ({
  PostEditorForm: ({
    caption,
    saving,
    locked,
    error,
    onSave,
    onCaptionChange,
    onPlatformsChange,
    onMediaSelect,
    onInstagramConnectionChange,
  }: {
    caption: string;
    saving: boolean;
    locked: boolean;
    error: string;
    onSave: () => void | Promise<void>;
    onCaptionChange: (value: string) => void;
    onMediaSelect: (assetId: string) => void;
    onInstagramConnectionChange: (id: string | null) => void;
    onPlatformsChange: (
      platforms: Array<"facebook" | "instagram" | "linkedin">,
    ) => void;
  }) => (
    <div>
      <div data-testid="caption-value">{caption}</div>

      {error && <div role="alert">{error}</div>}

      <button type="button" onClick={() => onCaptionChange("New caption")}>
        Set caption
      </button>

      <button type="button" onClick={() => onPlatformsChange(["linkedin"])}>
        Use LinkedIn
      </button>

      <button type="button" onClick={() => { onPlatformsChange(["instagram"]); onInstagramConnectionChange("instagram-connection"); }}>Use Instagram</button>
      <button type="button" onClick={() => onMediaSelect("507f1f77bcf86cd799439099")}>Attach image</button>
      <button type="button" disabled={saving || locked} onClick={() => void onSave()}>
        Save draft
      </button>
    </div>
  ),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function makePost(
  id: string,
  workspaceId: string,
  caption = "Existing caption",
): Post {
  return {
    _id: id,
    workspaceId,
    createdByUserId: "507f1f77bcf86cd799439016",
    title: "Test draft",
    caption,
    mediaIds: [],
    platforms: ["linkedin"],
    status: "draft",
    platformConnections: {
      linkedin: LINKEDIN_ID,
    },
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  };
}

function prepareNewPost() {
  fireEvent.click(
    screen.getByRole("button", {
      name: "Set caption",
    }),
  );

  fireEvent.click(
    screen.getByRole("button", {
      name: "Use LinkedIn",
    }),
  );
}

describe("PostEditorRoute async safety", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.workspace.current = WORKSPACE_A;
  });

  afterEach(() => {
    cleanup();
  });


  it("saves the verified LinkedIn connection when changing a draft platform", async () => {
    vi.mocked(getPostById).mockResolvedValue({ ...makePost(POST_A, WORKSPACE_A), platforms: ["facebook"], platformConnections: {} });
    vi.mocked(updateDraftPost).mockResolvedValue(makePost(POST_A, WORKSPACE_A));
    render(<PostEditorRoute mode="edit" postId={POST_A} />);
    await screen.findByText("Existing caption");
    fireEvent.click(screen.getByRole("button", { name: "Use LinkedIn" }));
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(updateDraftPost).toHaveBeenCalledWith(POST_A, expect.objectContaining({ platforms: ["linkedin"], platformConnections: { linkedin: LINKEDIN_ID } })));
  });

  it("keeps the attempted post locked but unlocks a different workspace", async () => {
    const pendingPublish = deferred<Awaited<ReturnType<typeof publishPostNow>>>();
    vi.mocked(createPost).mockResolvedValue(makePost(POST_A, WORKSPACE_A));
    vi.mocked(publishPostNow).mockReturnValue(pendingPublish.promise);
    const { rerender } = render(<PostEditorRoute mode="create" />);
    prepareNewPost();
    fireEvent.click(screen.getByRole("button", { name: "Choose Publish Now" }));
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Confirm Publish" }));
    await waitFor(() => expect(publishPostNow).toHaveBeenCalledTimes(1));
    expect((screen.getByRole("button", { name: "Save draft" }) as HTMLButtonElement).disabled).toBe(true);
    mocks.workspace.current = WORKSPACE_B;
    rerender(<PostEditorRoute mode="create" />);
    expect((screen.getByRole("button", { name: "Save draft" }) as HTMLButtonElement).disabled).toBe(false);
    await act(async () => {
      pendingPublish.reject(new Error("Late network failure"));
      await pendingPublish.promise.catch(() => {});
    });
    expect(screen.queryByText(/Late network failure/)).toBeNull();
    expect((screen.getByRole("button", { name: "Save draft" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("rejects saving an existing draft under another workspace", async () => {
    vi.mocked(getPostById).mockResolvedValue(makePost(POST_B, WORKSPACE_B));

    render(<PostEditorRoute mode="edit" postId={POST_B} />);

    await screen.findByText(/workspace verification required/i);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Save draft",
      }),
    );

    expect(updateDraftPost).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Save draft" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("ignores stale draft loading after switching workspaces", async () => {
    const oldLoad = deferred<Post>();

    vi.mocked(getPostById)
      .mockImplementationOnce(() => oldLoad.promise)
      .mockResolvedValue(makePost(POST_A, WORKSPACE_A, "Latest draft content"));

    const { rerender } = render(
      <PostEditorRoute mode="edit" postId={POST_A} />,
    );

    await waitFor(() => {
      expect(getPostById).toHaveBeenCalledTimes(1);
    });

    mocks.workspace.current = WORKSPACE_B;

    rerender(<PostEditorRoute mode="edit" postId={POST_A} />);

    await waitFor(() => {
      expect(getPostById).toHaveBeenCalledTimes(2);
    });

    await screen.findByText("Latest draft content");

    await act(async () => {
      oldLoad.resolve(makePost(POST_A, WORKSPACE_A, "Stale draft content"));

      await oldLoad.promise;
    });

    expect(screen.getByTestId("caption-value").textContent).toBe(
      "Latest draft content",
    );

    expect(screen.queryByText("Stale draft content")).toBeNull();
  });

  it("does not navigate after a stale create response", async () => {
    const pendingCreate = deferred<Post>();

    vi.mocked(createPost).mockReturnValue(pendingCreate.promise);

    const { rerender } = render(<PostEditorRoute mode="create" />);

    prepareNewPost();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Save draft",
      }),
    );

    await waitFor(() => {
      expect(createPost).toHaveBeenCalledTimes(1);
    });

    expect(createPost).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_A,
        caption: "New caption",
      }),
    );

    mocks.workspace.current = WORKSPACE_B;

    rerender(<PostEditorRoute mode="create" />);
    expect((screen.getByRole("button", { name: "Save draft" }) as HTMLButtonElement).disabled).toBe(false);

    await act(async () => {
      pendingCreate.resolve(makePost(POST_A, WORKSPACE_A));

      await pendingCreate.promise;
    });

    expect(mocks.navigate).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Save draft" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not navigate after a stale draft update", async () => {
    vi.mocked(getPostById).mockResolvedValue(makePost(POST_A, WORKSPACE_A));

    const pendingUpdate = deferred<Post>();

    vi.mocked(updateDraftPost).mockReturnValue(pendingUpdate.promise);

    const { rerender } = render(
      <PostEditorRoute mode="edit" postId={POST_A} />,
    );

    await screen.findByText("Existing caption");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Save draft",
      }),
    );

    await waitFor(() => {
      expect(updateDraftPost).toHaveBeenCalledTimes(1);
    });

    mocks.workspace.current = WORKSPACE_B;

    rerender(<PostEditorRoute mode="edit" postId={POST_A} />);
    expect((await screen.findByRole("button", { name: "Save draft" }) as HTMLButtonElement).disabled).toBe(false);

    await act(async () => {
      pendingUpdate.resolve(makePost(POST_A, WORKSPACE_A));

      await pendingUpdate.promise;
    });

    expect(mocks.navigate).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Save draft" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("never starts publishing after a workspace switch during draft creation", async () => {
    const pendingCreate = deferred<Post>();

    vi.mocked(createPost).mockReturnValue(pendingCreate.promise);

    const { rerender } = render(<PostEditorRoute mode="create" />);

    prepareNewPost();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Choose Publish Now",
      }),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Save draft",
      }),
    );

    await screen.findByRole("dialog");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Confirm Publish",
      }),
    );

    await waitFor(() => {
      expect(createPost).toHaveBeenCalledTimes(1);
    });

    mocks.workspace.current = WORKSPACE_B;

    rerender(<PostEditorRoute mode="create" />);
    expect((screen.getByRole("button", { name: "Save draft" }) as HTMLButtonElement).disabled).toBe(false);

    await act(async () => {
      pendingCreate.resolve(makePost(POST_A, WORKSPACE_A));

      await pendingCreate.promise;
    });

    expect(publishPostNow).not.toHaveBeenCalled();

    expect((screen.getByRole("button", { name: "Save draft" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText(/publishing request was not started/i)).toBeNull();
  });
  it("saves selected media before submitting a new image post for publishing", async () => {
    vi.mocked(createPost).mockResolvedValue(makePost(POST_A, WORKSPACE_A));
    vi.mocked(publishPostNow).mockResolvedValue({ message: "Published", post: { ...makePost(POST_A, WORKSPACE_A), status: "published" }, result: { postId: POST_A, results: [{ postId: POST_A, platform: "linkedin", outcome: "published" }] } });
    render(<PostEditorRoute mode="create" />);
    prepareNewPost();
    fireEvent.click(screen.getByRole("button", { name: "Attach image" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose Publish Now" }));
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Confirm Publish" }));
    await waitFor(() => expect(publishPostNow).toHaveBeenCalledTimes(1));
    expect(createPost).toHaveBeenCalledWith(expect.objectContaining({ caption: "New caption", mediaIds: ["507f1f77bcf86cd799439099"] }));
  });

});

it("publishes an Instagram image to the explicitly selected account after confirmation", async () => {
 vi.mocked(createPost).mockResolvedValue(makePost(POST_A, WORKSPACE_A));
 vi.mocked(publishPostNow).mockResolvedValue({ message: "Published", post: { ...makePost(POST_A, WORKSPACE_A), status: "published" }, result: { postId: POST_A, results: [{ postId: POST_A, platform: "instagram", outcome: "published" }] } });
 render(<PostEditorRoute mode="create" />);
 fireEvent.click(screen.getByRole("button", { name: "Set caption" }));
 fireEvent.click(screen.getByRole("button", { name: "Use Instagram" }));
 fireEvent.click(screen.getByRole("button", { name: "Attach image" }));
 fireEvent.click(screen.getByRole("button", { name: "Choose Publish Now" }));
 fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
 await screen.findByRole("dialog");
 expect(screen.getByRole("heading", { name: "Publish to Instagram?" })).toBeTruthy();
 expect(screen.getByText("@studio")).toBeTruthy();
 fireEvent.click(screen.getByRole("button", { name: "Confirm Publish" }));
 await waitFor(() => expect(publishPostNow).toHaveBeenCalledWith(POST_A));
 expect(createPost).toHaveBeenCalledWith(expect.objectContaining({ platforms: ["instagram"], platformConnections: { instagram: "instagram-connection" }, mediaIds: ["507f1f77bcf86cd799439099"] }));
 cleanup();
});
