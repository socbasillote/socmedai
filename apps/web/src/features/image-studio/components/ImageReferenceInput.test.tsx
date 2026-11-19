import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { uploadWorkspaceImageReference } from "@/lib/imageGeneration";
import { ImageReferenceInput } from "./ImageReferenceInput";
import { useImageReference } from "../hooks/useImageReference";
vi.mock("@/lib/imageGeneration", async (original) => ({
  ...await original<typeof import("@/lib/imageGeneration")>(), uploadWorkspaceImageReference: vi.fn(),
}));
const workspace = "507f1f77bcf86cd799439011";
const id = "507f1f77bcf86cd799439022";
beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => "blob:photo-preview");
  URL.revokeObjectURL = vi.fn();
  vi.mocked(uploadWorkspaceImageReference).mockResolvedValue({ referenceId: id, width: 80, height: 60 });
});
afterEach(cleanup);
it("uploads a photo, previews it, and offers inspiration, editing, and design modes", async () => {
  const user = userEvent.setup();
  const onSelection = vi.fn();
  render(<ImageReferenceInput workspaceId={workspace} disabled={false} onSelection={onSelection} />);
  const file = new File(["photo"], "coffee.jpg", { type: "image/jpeg" });
  await user.upload(screen.getByLabelText("Upload reference photo"), file);
  await waitFor(() => expect(onSelection).toHaveBeenLastCalledWith({ id, usage: "inspiration" }, false));
  expect(screen.getByAltText("Selected reference photo")).toHaveAttribute("src", "blob:photo-preview");
  expect(screen.getByRole("radio", { name: /Use as inspiration/ })).toBeChecked();
  await user.click(screen.getByRole("radio", { name: /Edit this photo/ }));
  expect(onSelection).toHaveBeenLastCalledWith({ id, usage: "edit" }, false);
  await user.click(screen.getByRole("radio", { name: /Design around this photo/ }));
  expect(onSelection).toHaveBeenLastCalledWith({ id, usage: "design" }, false);
  await user.click(screen.getByRole("button", { name: "Remove reference photo" }));
  expect(onSelection).toHaveBeenLastCalledWith(undefined, false);
  expect(screen.queryByAltText("Selected reference photo")).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:photo-preview");
});
it("blocks generation during upload and ignores a response after the photo was removed", async () => {
  let resolve!: (value: { referenceId: string; width: number; height: number }) => void;
  vi.mocked(uploadWorkspaceImageReference).mockReturnValue(new Promise((done) => { resolve = done; }));
  const user = userEvent.setup();
  const onSelection = vi.fn();
  render(<ImageReferenceInput workspaceId={workspace} disabled={false} onSelection={onSelection} />);
  await user.upload(screen.getByLabelText("Upload reference photo"), new File(["photo"], "photo.png", { type: "image/png" }));
  expect(onSelection).toHaveBeenLastCalledWith(undefined, true);
  expect(screen.getByRole("status")).toHaveTextContent("Uploading photo");
  await user.click(screen.getByRole("button", { name: "Remove reference photo" }));
  await act(async () => { resolve({ referenceId: id, width: 80, height: 60 }); });
  expect(onSelection).toHaveBeenLastCalledWith(undefined, false);
});
it("rejects unsupported files before uploading", async () => {
  const onSelection = vi.fn();
  render(<ImageReferenceInput workspaceId={workspace} disabled={false} onSelection={onSelection} />);
  fireEvent.change(screen.getByLabelText("Upload reference photo"), { target: { files: [new File(["svg"], "picture.svg", { type: "image/svg+xml" })] } });
  expect(await screen.findByRole("alert")).toHaveTextContent("JPG, PNG, or WebP");
  expect(uploadWorkspaceImageReference).not.toHaveBeenCalled();
  expect(onSelection).toHaveBeenLastCalledWith(undefined, true);
});
it("clears references when workspace changes, including switching back", async () => {
  function Harness({ workspaceId }: { workspaceId: string }) {
    const image = useImageReference(workspaceId, "owner");
    return <><ImageReferenceInput key={image.scope} {...image.fieldProps} /><p data-testid="selection">{image.reference?.id ?? "none"}</p></>;
  }
  const user = userEvent.setup();
  const { rerender } = render(<Harness workspaceId={workspace} />);
  await user.upload(screen.getByLabelText("Upload reference photo"), new File(["photo"], "photo.png", { type: "image/png" }));
  await waitFor(() => expect(screen.getByTestId("selection")).toHaveTextContent(id));
  rerender(<Harness workspaceId="507f1f77bcf86cd799439099" />);
  expect(screen.getByTestId("selection")).toHaveTextContent("none");
  rerender(<Harness workspaceId={workspace} />);
  expect(screen.getByTestId("selection")).toHaveTextContent("none");
});
