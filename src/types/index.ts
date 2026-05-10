import { User, Group, Relint, RelintTemplate, ReceivedRelint, ChatMessage, AuditLog, Debriefing } from '@prisma/client';

export type { User, Group, Relint, RelintTemplate, ReceivedRelint, ChatMessage, AuditLog, Debriefing };

export interface UserWithGroup extends User {
  group?: Group | null;
}

export interface RelintWithRelations extends Relint {
  author: User;
  group: Group;
  template?: RelintTemplate | null;
  attachments?: any[];
}

export interface DebriefingWithRelations extends Debriefing {
  author: User;
  group: Group;
}

export interface ChatMessageWithSender extends ChatMessage {
  sender: User;
  receiver?: User | null;
  group?: Group | null;
}

export interface DashboardStats {
  totalRelints: number;
  publishedRelints: number;
  draftRelints: number;
  totalUsers: number;
  activeUsers: number;
  totalGroups: number;
  recentRelints: RelintWithRelations[];
  recentMessages: ChatMessageWithSender[];
  relintsPerMonth: { month: string; count: number }[];
  receivedRelints: number;
}

export interface RelintContent {
  introduction: string;
  body: string;
  conclusion?: string;
  recommendations?: string;
  sections?: RelintSection[];
}

export interface RelintSection {
  id: string;
  title: string;
  content: string;
  order: number;
}

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'OPERATOR';

export interface SessionUser {
  id: string;
  name?: string | null;
  email?: string | null;
  role: UserRole;
  groupId?: string | null;
  groupName?: string | null;
  phone?: string | null;
}

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SystemTheme {
  mode: 'cover' | 'sigma' | 'hybrid';
  coverName: string;
  primaryColor?: string;
}

export interface AIConfig {
  provider: 'openai' | 'gemini';
  model: string;
}
