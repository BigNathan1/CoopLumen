export interface Community {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  tokenCount: number;
  isJoined?: boolean;
}