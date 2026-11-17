import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PostPreview } from "./PostPreview";
vi.mock("@/features/publishing/components/SelectedMediaPreview", () => ({
  SelectedMediaPreview: ({ assetId, variant }: { assetId: string; variant: string }) => <img alt="Selected image" data-asset={assetId} data-variant={variant} />,
}));
afterEach(cleanup);
it("previews the selected image and actual caption, keeping the internal title private", () => {
  render(<PostPreview title="Internal campaign name" caption="Our coffee is here" platforms={["facebook"]} accountName="Coffee Shop" selectedMediaAssetId="image-a" />);
  expect(screen.getByText("Coffee Shop")).toBeInTheDocument();
  expect(screen.getByText("Our coffee is here")).toBeInTheDocument();
  expect(screen.queryByText("Internal campaign name")).not.toBeInTheDocument();
  expect(screen.getByAltText("Selected image")).toHaveAttribute("data-asset", "image-a");
  expect(screen.getByAltText("Selected image")).toHaveAttribute("data-variant", "post");
  expect(screen.queryByText("Text-only post")).not.toBeInTheDocument();
});
it("clears the image when it is removed from the editor", () => {
  const view = render(<PostPreview title="" caption="Caption" platforms={["linkedin"]} selectedMediaAssetId="image-a" />);
  view.rerender(<PostPreview title="" caption="Caption" platforms={["linkedin"]} />);
  expect(screen.queryByAltText("Selected image")).not.toBeInTheDocument();
  expect(screen.getByText("Text-only post")).toBeInTheDocument();
});
