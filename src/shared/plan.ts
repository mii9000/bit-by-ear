import { z } from 'zod';

const sourceRefSchema = z.object({
  resourceId: z.string().uuid(),
  page: z.number().int().positive().nullable(),
  excerpt: z.string().min(8).max(300),
});

const lessonSchema = z.object({
  title: z.string().trim().min(3).max(100),
  objective: z.string().trim().min(12).max(400).refine((value) => !/[?？]\s*$/.test(value), 'Objectives cannot be questions.'),
  sourceRefs: z.array(sourceRefSchema).min(1),
});

export const planDraftSchema = z.object({
  title: z.string().trim().min(3).max(120),
  rationale: z.string().trim().min(20).max(800),
  materialGaps: z.array(z.string().trim().min(5).max(300)).max(20),
  lessons: z.array(lessonSchema).min(3).max(30),
});

export type PlanDraft = z.infer<typeof planDraftSchema>;
export type PlanValidation =
  | { success: true; data: PlanDraft }
  | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } };

export function validatePlanDraft(
  value: unknown,
  excerptsByResource: ReadonlyMap<string, readonly string[]>,
): PlanValidation {
  const parsed = planDraftSchema.safeParse(value);
  if (!parsed.success) return parsed;

  for (const lesson of parsed.data.lessons) {
    for (const reference of lesson.sourceRefs) {
      const excerpts = excerptsByResource.get(reference.resourceId);
      if (!excerpts?.some((source) => source.includes(reference.excerpt))) {
        return {
          success: false,
          error: { issues: [{ path: ['lessons'], message: `A source reference in “${lesson.title}” does not match its uploaded resource.` }] },
        };
      }
    }
  }

  return parsed;
}
