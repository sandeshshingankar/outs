/** Provider boundary for a future live-session integration. No provider is configured yet. */
export type VideoRoom = {
  provider: string;
  roomId: string;
  joinUrl: string;
  startsAt: string;
  expiresAt: string;
};

export type VideoParticipant = {
  userId: string;
  displayName: string;
  role: 'host' | 'participant';
};

export type CreateVideoRoomInput = {
  sessionRequestId: string;
  host: VideoParticipant;
  participants: VideoParticipant[];
  startsAt: string;
  durationMinutes: number;
};

/** Implement with a server-side provider SDK; never expose provider secrets to the browser. */
export interface VideoProvider {
  createRoom(input: CreateVideoRoomInput): Promise<VideoRoom>;
  revokeRoom(roomId: string): Promise<void>;
}
