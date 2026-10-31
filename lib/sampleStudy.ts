import type { Panels } from "@/lib/study";
import data from "./sample-study.json";

/**
 * A ready-made study, so the app can be tried without using any Gemini quota.
 * It is real model output for docs/sample/eigenvalues-lecture.txt. Imported on
 * demand, to keep it out of the main bundle.
 */
export const sampleStudy = data as unknown as Panels;
