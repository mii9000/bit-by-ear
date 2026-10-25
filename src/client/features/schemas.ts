import { z } from 'zod';

export const knowledgeBaseSchema = z.object({
  title: z.string().trim().min(2, 'Give your learning space a name.').max(80),
  topic: z.string().trim().min(2, 'Add the topic you want to learn.').max(120),
  goal: z.string().trim().min(8, 'Describe one thing you would like to understand.').max(500),
  currentKnowledge: z.string().trim().min(4, 'Let us know a little about what you already know.').max(800),
});

export type KnowledgeBaseInput = z.infer<typeof knowledgeBaseSchema>;
