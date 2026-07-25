import { z } from 'zod';

export const createDirectConversationSchema = z.object({
  participantId: z.string().trim().min(1)
}).strict();

export const createGroupConversationSchema = z.object({
  name: z.string().trim().min(1).max(100),
  memberIds: z.array(z.string().trim().min(1)).min(1).max(99),
  description: z.string().trim().max(500).optional(),
  avatarUrl: z.string().trim().max(500).optional()
}).strict();

export const updateGroupConversationSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  avatarUrl: z.string().trim().max(500).nullable().optional()
}).strict().refine((data) => Object.keys(data).length > 0, 'At least one field is required.');

export const updateMembersSchema = z.object({
  memberIds: z.array(z.string().trim().min(1)).min(1).max(99)
}).strict();

export const sendMessageSchema = z.object({
  kind: z.enum(['text', 'image']).optional(),
  content: z.string().trim().max(4_000).optional(),
  imageUrl: z.string().trim().max(500).optional(),
  clientMessageId: z.string().trim().min(1).max(100).optional()
}).strict().superRefine((data, context) => {
  const kind = data.kind ?? (data.imageUrl ? 'image' : 'text');
  if (kind === 'text' && !data.content) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Text messages require content.', path: ['content'] });
  }
  if (kind === 'image' && !data.imageUrl) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Image messages require imageUrl.', path: ['imageUrl'] });
  }
});

export const seenMessageSchema = z.object({
  messageId: z.string().trim().min(1).optional()
}).strict();
