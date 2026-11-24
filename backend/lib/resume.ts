import { ApiError } from "@backend/lib/api";
import { extractSkillsFromText } from "@backend/lib/skills";

export const MAX_RESUME_BYTES = 8 * 1024 * 1024;

export type ResumeParseResult = {
  text: string;
  skills: string[];
  status: "processed" | "ocr_required" | "unsupported";
  note: string;
};

async function extractPdfText(buffer: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const result = await extractText(pdf, { mergePages: true });
  return Array.isArray(result.text) ? result.text.join("\n") : result.text;
}

export async function parseResumeFile(file: File): Promise<ResumeParseResult> {
  if (file.size === 0) {
    throw new ApiError(400, "That file is empty. Please upload a valid resume.", { code: "empty_file" });
  }
  if (file.size > MAX_RESUME_BYTES) {
    throw new ApiError(413, "Resume must be 8 MB or smaller.", { code: "file_too_large" });
  }

  const name = file.name.toLowerCase();
  const isPdf = file.type === "application/pdf" || name.endsWith(".pdf");
  const isText = file.type === "text/plain" || name.endsWith(".txt") || name.endsWith(".md");

  if (!isPdf && !isText) {
    throw new ApiError(415, "Only PDF or plain-text resumes are supported.", {
      code: "unsupported_type",
    });
  }

  let text = "";
  try {
    text = isPdf
      ? await extractPdfText(Buffer.from(await file.arrayBuffer()))
      : await file.text();
  } catch {
    throw new ApiError(422, "We could not read that file. It may be corrupted or password protected.", {
      code: "unreadable_file",
    });
  }

  const cleaned = text.replace(/\u0000/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

  if (!cleaned) {
    throw new ApiError(
      422,
      "This PDF looks like a scanned image and no text layer was found. OCR is not available in this environment — please upload a text-based PDF.",
      { code: "ocr_required" },
    );
  }

  const skills = extractSkillsFromText(cleaned);
  return {
    text: cleaned,
    skills,
    status: "processed",
    note:
      skills.length === 0
        ? "Resume text extracted, but no known technical skills were detected. Add skills manually in My Profile."
        : `Extracted ${skills.length} skills from ${isPdf ? "PDF" : "text"} resume.`,
  };
}
