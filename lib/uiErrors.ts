import { humanSize } from "@/lib/study";

export type UiError = { title: string; description: string };

export const NOT_PDF_ERROR: UiError = {
  title: "This file is not a PDF",
  description: "Choose a PDF file. Other file types are not supported.",
};

const GENERIC_ERROR: UiError = {
  title: "Generation failed",
  description: "Something went wrong while generating the material. Try again shortly.",
};

const NO_TEXT_ERROR: UiError = {
  title: "This PDF has no selectable text",
  description:
    "The file looks scanned, so it cannot be read. Use a PDF with selectable text, or run it through text recognition (OCR) first.",
};

const OVERLOADED_ERROR: UiError = {
  title: "The model is temporarily overloaded",
  description:
    "The service is receiving many requests right now. Try again in a few minutes.",
};

/**
 * For a response that didn't come from our route, such as the hosting platform
 * rejecting the request before the app runs. These bodies aren't JSON.
 */
export function errorFromStatus(status: number): UiError {
  switch (status) {
    case 403:
    case 429:
      return {
        title: "The request was blocked",
        description: `The hosting platform's security check stopped this request (HTTP ${status}). Reload the page and try again.`,
      };
    case 413:
      return {
        title: "This document is too large",
        description: "The hosting platform rejected the request (HTTP 413). Try a shorter PDF.",
      };
    case 504:
      return {
        title: "The request took too long",
        description: "The server timed out (HTTP 504). Try again, or try a shorter PDF.",
      };
    default:
      return {
        title: GENERIC_ERROR.title,
        description: `The server could not complete the request (HTTP ${status}). Try again shortly.`,
      };
  }
}

/**
 * Turn an /api/generate failure into the UI's title + text. The server's
 * `error` string stays the source for the one case its code can't distinguish:
 * PROVIDER_ERROR covers both an overloaded model and any other provider failure.
 */
export function errorFromApi(
  code: string | undefined,
  serverMessage: string | undefined,
  fileSize: number,
): UiError {
  switch (code) {
    case "EMPTY_FILE":
      return {
        title: "This file is empty",
        description: "The file has no content. Check it and try again.",
      };
    case "TOO_LARGE":
      return {
        title: "This file is larger than 20 MB",
        description: `The file is ${humanSize(fileSize)}. Compress it or split the lecture into smaller files.`,
      };
    case "TEXT_TOO_LARGE":
      return {
        title: "This document has too much text",
        description: "It's more than the server accepts in one request. Split it into smaller PDFs.",
      };
    case "CORRUPT_PDF":
      return {
        title: "The PDF could not be opened",
        description:
          "The file is corrupt or password protected. Remove the protection or save it again as a PDF, then upload it.",
      };
    case "NO_TEXT":
    case "EMPTY_DOCUMENT":
      return NO_TEXT_ERROR;
    case "RATE_LIMITED":
      return {
        title: "Too many requests",
        description:
          "The per-minute request limit was reached. Try again in about a minute.",
      };
    case "QUOTA_EXHAUSTED":
      return {
        title: "Daily limit reached",
        description:
          "All of today's Gemini requests have been used. The limit resets at midnight Pacific time.",
      };
    case "INVALID_RESPONSE":
      return {
        title: "The model's response was not valid",
        description: "The material was not generated correctly. Try generating it again.",
      };
    case "MISSING_API_KEY":
      return {
        title: "API key problem",
        description:
          "The Gemini key is missing or invalid. Check the GEMINI_API_KEY setting on the server.",
      };
    case "PROVIDER_ERROR":
      return serverMessage?.includes("overloaded")
        ? OVERLOADED_ERROR
        : GENERIC_ERROR;
    default:
      return GENERIC_ERROR;
  }
}

export { GENERIC_ERROR };
