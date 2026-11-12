export type TextLabelLayoutInput = {
  text: string;
  imageWidth: number;
  imageHeight: number;
  sizePercent: number;
};

export type TextLabelLayout = {
  lines: string[];
  fontSize: number;
  overlayWidth: number;
  overlayHeight: number;
};

const MIN_FONT_SIZE = 12;
const MAX_LINES = 5;
const LINE_HEIGHT_MULTIPLIER = 1.5;

/**
 * Conservative character-width estimate.
 *
 * The final Sharp renderer will need actual
 * font-metric verification before release.
 */
const CHAR_WIDTH_FACTOR = 0.75;

export function planTextLabelLayout(
  input: TextLabelLayoutInput,
): TextLabelLayout {
  const { imageWidth, imageHeight, sizePercent } = input;

  const text = input.text.trim();

  if (!text || text.length > 80) {
    throw new Error("Invalid text-label content.");
  }

  if (
    !Number.isInteger(imageWidth) ||
    !Number.isInteger(imageHeight) ||
    imageWidth < 1 ||
    imageHeight < 1 ||
    !Number.isInteger(sizePercent) ||
    sizePercent < 5 ||
    sizePercent > 30
  ) {
    throw new Error("Invalid text-label dimensions.");
  }

  const margin = Math.max(
    4,
    Math.round(Math.min(imageWidth, imageHeight) * 0.025),
  );

  const overlayWidth = Math.min(
    imageWidth - margin * 2,
    Math.round((imageWidth * sizePercent) / 100),
  );

  const availableHeight = imageHeight - margin * 2;

  const padding = Math.max(2, Math.round(overlayWidth * 0.025));

  const availableWidth = overlayWidth - padding * 2;

  const maxCharactersPerLine = Math.floor(
    availableWidth / (MIN_FONT_SIZE * CHAR_WIDTH_FACTOR),
  );

  if (maxCharactersPerLine < 1) {
    throw new Error("Text label is too small to display readably.");
  }

  // This is an initial code-point-based layout
  // estimate, not a measured font layout.
  const characters = Array.from(text);

  const lines: string[] = [];

  for (
    let index = 0;
    index < characters.length;
    index += maxCharactersPerLine
  ) {
    lines.push(characters.slice(index, index + maxCharactersPerLine).join(""));
  }

  if (lines.length > MAX_LINES) {
    throw new Error("Text label is too long for the selected size.");
  }

  const fontSize = MIN_FONT_SIZE;

  const overlayHeight = Math.ceil(
    lines.length * fontSize * LINE_HEIGHT_MULTIPLIER,
  );

  if (overlayHeight > availableHeight) {
    throw new Error("Text label does not fit within the image.");
  }

  return {
    lines,
    fontSize,
    overlayWidth,
    overlayHeight,
  };
}
