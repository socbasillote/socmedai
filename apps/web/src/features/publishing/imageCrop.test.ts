import { describe, expect, it, vi } from "vitest";
import { cropRectangle, defaultCrop, drawImageCrop } from "./imageCrop";
describe("image crop geometry", () => {
  it("keeps the whole square image in a square crop", () => {
    expect(cropRectangle(1024, 1024, defaultCrop("facebook"))).toEqual({ x: 0, y: 0, width: 1024, height: 1024 });
  });
  it("crops the sides for portrait and honors horizontal positioning", () => {
    const crop = defaultCrop("instagram");
    expect(cropRectangle(1000, 1000, crop)).toEqual({ x: 100, y: 0, width: 800, height: 1000 });
    expect(cropRectangle(1000, 1000, { ...crop, x: 100 }).x).toBe(200);
    expect(cropRectangle(1000, 1000, { ...crop, x: 0 }).x).toBe(0);
  });
  it("crops top and bottom for landscape and honors vertical positioning", () => {
    const rect = cropRectangle(1000, 1000, { ...defaultCrop("linkedin"), y: 100 });
    expect(rect.width).toBe(1000);
    expect(rect.height).toBe(525);
    expect(rect.y).toBe(475);
  });
  it("keeps zoomed crops inside non-square originals without distortion", () => {
    const rect = cropRectangle(1600, 900, { format: "portrait", x: 100, y: 100, zoom: 2 });
    expect(rect.width).toBe(360);
    expect(rect.height).toBe(450);
    expect(rect.x + rect.width).toBe(1600);
    expect(rect.y + rect.height).toBe(900);
  });
  it.each([0, -1, NaN, Infinity])("rejects invalid source width %s", width => {
    expect(() => cropRectangle(width, 1024, defaultCrop("facebook"))).toThrow();
  });
  it("draws the selected source rectangle into the exact output dimensions", () => {
    const drawImage = vi.fn();
    const context = { drawImage, imageSmoothingEnabled: false, imageSmoothingQuality: "low" };
    const canvas = { width: 0, height: 0, getContext: () => context } as unknown as HTMLCanvasElement;
    const bitmap = { width: 1000, height: 1000 } as ImageBitmap;
    drawImageCrop(canvas, bitmap, defaultCrop("instagram"));
    expect(canvas.width).toBe(1080); expect(canvas.height).toBe(1350);
    expect(drawImage).toHaveBeenCalledWith(bitmap, 100, 0, 800, 1000, 0, 0, 1080, 1350);
  });
});
