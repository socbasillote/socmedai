import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BrandKitFields } from "./BrandKitFields";
import { defaultBrandKit } from "@/lib/brandKit";
import { getWorkspaceLogoPreview } from "@/lib/workspaceLogo";
import { ApiError } from "@/lib/api";

vi.mock("@/lib/workspaceLogo", () => ({ getWorkspaceLogoPreview: vi.fn() }));
vi.mock("@/features/image-studio/components/WorkspaceLogoUploader", () => ({
  WorkspaceLogoUploader: ({ variant }: { variant?: string }) => <output aria-label={`${variant ?? "primary"} logo uploader`}>Existing logo uploader</output>,
}));
const workspaceId = "507f1f77bcf86cd799439011";
function Harness({ archived = false }: { archived?: boolean }) {
  const [kit, setKit] = useState(() => structuredClone(defaultBrandKit));
  return <fieldset disabled={archived}><BrandKitFields workspaceId={workspaceId} name="Coffee" value={kit} onChange={setKit} disabled={archived} archived={archived} /></fieldset>;
}
beforeEach(() => { vi.mocked(getWorkspaceLogoPreview).mockResolvedValue({ url: "https://example.test/logo.png", expiresIn: 60 }); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("applies each color role, typography, and layout to the live template preview", async () => {
  render(<Harness />);
  await screen.findByAltText("Coffee brand logo");
  fireEvent.change(screen.getByLabelText("Primary color"), { target: { value: "#123456" } });
  fireEvent.change(screen.getByLabelText("Background color"), { target: { value: "#EEEEEE" } });
  fireEvent.change(screen.getByLabelText("Heading font"), { target: { value: "Verdana" } });
  fireEvent.change(screen.getByLabelText("Body font"), { target: { value: "Georgia" } });
  fireEvent.change(screen.getByLabelText("Text alignment"), { target: { value: "right" } });
  fireEvent.change(screen.getByLabelText("Spacing"), { target: { value: "spacious" } });
  expect(screen.getByTestId("brand-kit-preview")).toHaveStyle({ backgroundColor: "#EEEEEE", textAlign: "right", fontFamily: '"Georgia", serif', paddingLeft: "44px" });
  expect(screen.getByRole("heading", { name: "Small moments. Lasting impressions." })).toHaveStyle({ color: "#123456", fontFamily: '"Verdana", sans-serif' });
  fireEvent.change(screen.getByLabelText("Preview template"), { target: { value: "sale" } });
  expect(screen.getByText("JUST FOR YOU")).toHaveStyle({ backgroundColor: "#F59E0B" });
});
it("reuses all three logo upload slots and falls back from an unavailable variant", async () => {
  render(<Harness />);
  expect(screen.getByLabelText("primary logo uploader")).toBeInTheDocument();
  expect(screen.getByLabelText("light logo uploader")).toBeInTheDocument();
  expect(screen.getByLabelText("dark logo uploader")).toBeInTheDocument();
  await screen.findByAltText("Coffee brand logo");
  vi.mocked(getWorkspaceLogoPreview).mockRejectedValueOnce(new ApiError("Not found", 404));
  fireEvent.change(screen.getByLabelText("Preferred logo"), { target: { value: "light" } });
  await screen.findByAltText("Coffee brand logo");
  expect(getWorkspaceLogoPreview).toHaveBeenCalledWith(workspaceId, "light");
  expect(getWorkspaceLogoPreview).toHaveBeenLastCalledWith(workspaceId);
});
it("disables archived kit editing and does not load private logos", () => {
  render(<Harness archived />);
  expect(screen.getByLabelText("Heading font")).toBeDisabled();
  expect(screen.getByText("Restore the workspace to manage logos.")).toBeInTheDocument();
  expect(getWorkspaceLogoPreview).not.toHaveBeenCalled();
});
