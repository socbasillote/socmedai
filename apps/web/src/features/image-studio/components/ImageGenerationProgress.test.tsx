import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ImageGenerationProgress } from "./ImageGenerationProgress";
it("shows the real active stage without an invented percentage", () => {
  const { container, rerender } = render(<ImageGenerationProgress progress={{ stage: "generating", label: "Generating your image" }} />);
  expect(screen.getByRole("status")).toHaveTextContent("Generating your image");
  expect(container.querySelector('[aria-current="step"]')).toHaveTextContent("Generating");
  expect(screen.queryByRole("progressbar")).toBeNull();
  rerender(<ImageGenerationProgress progress={{ stage: "saving", label: "Saving your image" }} />);
  expect(container.querySelector('[aria-current="step"]')).toHaveTextContent("Saving");
});
