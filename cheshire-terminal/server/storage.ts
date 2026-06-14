import { 
  Token, InsertToken, 
  Vote, InsertVote, VoteStats, 
  TokenVote, InsertTokenVote, 
  InsertBurn, Burn,
  ChatRoom, InsertChatRoom,
  ChatMessage, InsertChatMessage,
  RoomMember, InsertRoomMember,
  tokens,
  votes,
  tokenVotes,
  burns,
  chatRooms,
  chatMessages,
  roomMembers
} from "@shared/schema";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { db, hasDatabase } from "./db";

export interface IStorage {
  // Existing token methods
  createToken(token: InsertToken): Promise<Token>;
  getTokens(): Promise<Token[]>;
  getToken(mintAddress: string): Promise<Token | undefined>;

  // New voting methods
  createVote(vote: InsertVote): Promise<Vote>;
  updateVote(vote: InsertVote): Promise<Vote>;
  getVote(tokenId: number, walletAddress: string): Promise<Vote | null>;
  getTokenVoteCounts(tokenId: number): Promise<VoteStats>;
  updateTokenVoteCounts(tokenId: number): Promise<void>;

  // Token votes (by address) methods
  addVote(vote: TokenVote): Promise<void>;
  getVotesByToken(tokenAddress: string): Promise<TokenVote[]>;
  hasVoted(tokenAddress: string, walletAddress: string): Promise<boolean>;
  
  // Burn operations
  createBurn(burn: InsertBurn): Promise<Burn>;
  getBurns(): Promise<Burn[]>;
  getBurnsByOwner(ownerAddress: string): Promise<Burn[]>;
  getBurn(assetId: string): Promise<Burn | undefined>;
  
  // Chat room operations
  createChatRoom(room: InsertChatRoom): Promise<ChatRoom>;
  getChatRooms(): Promise<ChatRoom[]>;
  getChatRoom(roomId: number): Promise<ChatRoom | undefined>;
  getChatRoomByToken(tokenAddress: string): Promise<ChatRoom | undefined>;
  updateChatRoom(roomId: number, updates: Partial<ChatRoom>): Promise<ChatRoom | undefined>;
  incrementRoomMemberCount(roomId: number): Promise<number>;
  decrementRoomMemberCount(roomId: number): Promise<number>;
  updateRoomLastActivity(roomId: number): Promise<void>;
  
  // Chat message operations
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
  getChatMessages(roomId: number, limit?: number, before?: number): Promise<ChatMessage[]>;
  getChatMessage(messageId: number): Promise<ChatMessage | undefined>;
  
  // Room membership operations
  addRoomMember(member: InsertRoomMember): Promise<RoomMember>;
  getRoomMembers(roomId: number): Promise<RoomMember[]>;
  getRoomMember(roomId: number, walletAddress: string): Promise<RoomMember | undefined>;
  removeRoomMember(roomId: number, walletAddress: string): Promise<boolean>;
  updateRoomMemberLastActive(roomId: number, walletAddress: string): Promise<void>;
  setRoomMemberAdmin(roomId: number, walletAddress: string, isAdmin: boolean): Promise<boolean>;
  banRoomMember(roomId: number, walletAddress: string, isBanned: boolean): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private tokens: Map<string, Token>;
  private votes: Map<string, Vote>;
  private tokenVotes: Map<string, TokenVote>; // Store token votes by ID (tokenAddress-walletAddress)
  private burns: Map<string, Burn>; // Store burn records by asset ID
  private chatRooms: Map<number, ChatRoom>; // Store chat rooms by ID
  private chatMessages: Map<number, ChatMessage>; // Store chat messages by ID
  private roomMembers: Map<string, RoomMember>; // Store room members by roomId-walletAddress
  
  private currentId: number;
  private currentVoteId: number;
  private currentBurnId: number;
  private currentRoomId: number;
  private currentMessageId: number;
  private currentMemberId: number;

  constructor() {
    this.tokens = new Map();
    this.votes = new Map();
    this.tokenVotes = new Map();
    this.burns = new Map();
    this.chatRooms = new Map();
    this.chatMessages = new Map();
    this.roomMembers = new Map();
    
    this.currentId = 1;
    this.currentVoteId = 1;
    this.currentBurnId = 1;
    this.currentRoomId = 1;
    this.currentMessageId = 1;
    this.currentMemberId = 1;
  }

  // Existing token methods remain unchanged
  async createToken(insertToken: InsertToken): Promise<Token> {
    const token: Token = {
      ...insertToken,
      id: this.currentId++,
      createdAt: new Date(),
      upvotes: 0,
      downvotes: 0,
      metadata: insertToken.metadata || {}
    };
    this.tokens.set(token.mintAddress, token);
    return token;
  }

  async getTokens(): Promise<Token[]> {
    return Array.from(this.tokens.values());
  }

  async getToken(mintAddress: string): Promise<Token | undefined> {
    return this.tokens.get(mintAddress);
  }

  // New voting methods
  async createVote(vote: InsertVote): Promise<Vote> {
    const newVote: Vote = {
      ...vote,
      id: this.currentVoteId++,
      createdAt: new Date(),
      reason: vote.reason || null
    };
    const voteKey = `${vote.tokenId}-${vote.walletAddress}`;
    this.votes.set(voteKey, newVote);
    return newVote;
  }

  async updateVote(vote: InsertVote): Promise<Vote> {
    const voteKey = `${vote.tokenId}-${vote.walletAddress}`;
    const existingVote = this.votes.get(voteKey);
    if (!existingVote) {
      throw new Error('Vote not found');
    }
    const updatedVote: Vote = {
      ...existingVote,
      ...vote,
    };
    this.votes.set(voteKey, updatedVote);
    return updatedVote;
  }

  async getVote(tokenId: number, walletAddress: string): Promise<Vote | null> {
    const voteKey = `${tokenId}-${walletAddress}`;
    return this.votes.get(voteKey) || null;
  }

  async getTokenVoteCounts(tokenId: number): Promise<VoteStats> {
    const votes = Array.from(this.votes.values())
      .filter(vote => vote.tokenId === tokenId);

    return {
      upvotes: votes.filter(v => v.isUpvote).length,
      downvotes: votes.filter(v => !v.isUpvote).length,
      totalVotes: votes.length
    };
  }

  async updateTokenVoteCounts(tokenId: number): Promise<void> {
    const token = Array.from(this.tokens.values())
      .find(t => t.id === tokenId);

    if (token) {
      const stats = await this.getTokenVoteCounts(tokenId);
      token.upvotes = stats.upvotes;
      token.downvotes = stats.downvotes;
      this.tokens.set(token.mintAddress, token);
    }
  }

  // Token votes by address methods
  async addVote(vote: TokenVote): Promise<void> {
    this.tokenVotes.set(vote.id, vote);
  }

  async getVotesByToken(tokenAddress: string): Promise<TokenVote[]> {
    return Array.from(this.tokenVotes.values())
      .filter(vote => vote.tokenAddress === tokenAddress);
  }

  async hasVoted(tokenAddress: string, walletAddress: string): Promise<boolean> {
    const voteId = `${tokenAddress}-${walletAddress}`;
    return this.tokenVotes.has(voteId);
  }

  // Burn operations
  async createBurn(insertBurn: InsertBurn): Promise<Burn> {
    const burn: Burn = {
      ...insertBurn,
      id: this.currentBurnId++,
      timestamp: insertBurn.timestamp ? new Date(insertBurn.timestamp) : new Date(),
      assetType: insertBurn.assetType || "token",
      metadata: insertBurn.metadata || {},
      signature: insertBurn.signature || ""
    };
    this.burns.set(burn.assetId, burn);
    return burn;
  }

  async getBurns(): Promise<Burn[]> {
    return Array.from(this.burns.values());
  }

  async getBurnsByOwner(ownerAddress: string): Promise<Burn[]> {
    return Array.from(this.burns.values())
      .filter(burn => burn.ownerAddress === ownerAddress);
  }

  async getBurn(assetId: string): Promise<Burn | undefined> {
    return this.burns.get(assetId);
  }

  // Chat room operations
  async createChatRoom(insertRoom: InsertChatRoom): Promise<ChatRoom> {
    const currentTime = new Date();
    const room: ChatRoom = {
      ...insertRoom,
      id: this.currentRoomId++,
      createdAt: currentTime,
      lastActivity: currentTime,
      memberCount: 0,
      isPrivate: insertRoom.isPrivate ?? false,
      description: insertRoom.description || null,
      tokenAddress: insertRoom.tokenAddress || null,
      metadata: insertRoom.metadata || {},
    };
    this.chatRooms.set(room.id, room);
    return room;
  }

  async getChatRooms(): Promise<ChatRoom[]> {
    return Array.from(this.chatRooms.values());
  }

  async getChatRoom(roomId: number): Promise<ChatRoom | undefined> {
    return this.chatRooms.get(roomId);
  }

  async getChatRoomByToken(tokenAddress: string): Promise<ChatRoom | undefined> {
    return Array.from(this.chatRooms.values())
      .find(room => room.tokenAddress === tokenAddress);
  }

  async updateChatRoom(roomId: number, updates: Partial<ChatRoom>): Promise<ChatRoom | undefined> {
    const room = this.chatRooms.get(roomId);
    if (!room) return undefined;

    const updatedRoom = { ...room, ...updates };
    this.chatRooms.set(roomId, updatedRoom);
    return updatedRoom;
  }

  async incrementRoomMemberCount(roomId: number): Promise<number> {
    const room = this.chatRooms.get(roomId);
    if (!room) throw new Error('Room not found');
    
    room.memberCount += 1;
    this.chatRooms.set(roomId, room);
    return room.memberCount;
  }

  async decrementRoomMemberCount(roomId: number): Promise<number> {
    const room = this.chatRooms.get(roomId);
    if (!room) throw new Error('Room not found');
    
    room.memberCount = Math.max(0, room.memberCount - 1);
    this.chatRooms.set(roomId, room);
    return room.memberCount;
  }

  async updateRoomLastActivity(roomId: number): Promise<void> {
    const room = this.chatRooms.get(roomId);
    if (!room) return;
    
    room.lastActivity = new Date();
    this.chatRooms.set(roomId, room);
  }

  // Chat message operations
  async createChatMessage(insertMessage: InsertChatMessage): Promise<ChatMessage> {
    const message: ChatMessage = {
      ...insertMessage,
      id: this.currentMessageId++,
      timestamp: new Date(),
      isSystem: insertMessage.isSystem ?? false,
      replyTo: insertMessage.replyTo || null,
      clientType: insertMessage.clientType ?? null,
      metadata: insertMessage.metadata || {},
    };
    this.chatMessages.set(message.id, message);
    
    // Update the room's last activity timestamp
    await this.updateRoomLastActivity(message.roomId);
    
    return message;
  }

  async getChatMessages(roomId: number, limit = 50, before?: number): Promise<ChatMessage[]> {
    const roomMessages = Array.from(this.chatMessages.values())
      .filter(msg => msg.roomId === roomId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    if (before !== undefined) {
      return roomMessages
        .filter(msg => msg.id < before)
        .slice(0, limit);
    }
    
    return roomMessages.slice(0, limit);
  }

  async getChatMessage(messageId: number): Promise<ChatMessage | undefined> {
    return this.chatMessages.get(messageId);
  }

  // Room membership operations
  async addRoomMember(insertMember: InsertRoomMember): Promise<RoomMember> {
    const memberKey = `${insertMember.roomId}-${insertMember.walletAddress}`;
    
    // Check if the member already exists
    const existingMember = this.roomMembers.get(memberKey);
    if (existingMember) {
      // Update the last active time and return
      existingMember.lastActive = new Date();
      this.roomMembers.set(memberKey, existingMember);
      return existingMember;
    }
    
    const currentTime = new Date();
    const member: RoomMember = {
      ...insertMember,
      id: this.currentMemberId++,
      joinedAt: currentTime,
      lastActive: currentTime,
      isAdmin: insertMember.isAdmin ?? false,
      isBanned: false,
    };
    
    this.roomMembers.set(memberKey, member);
    
    // Increment the room's member count
    await this.incrementRoomMemberCount(insertMember.roomId);
    
    return member;
  }

  async getRoomMembers(roomId: number): Promise<RoomMember[]> {
    return Array.from(this.roomMembers.values())
      .filter(member => member.roomId === roomId);
  }

  async getRoomMember(roomId: number, walletAddress: string): Promise<RoomMember | undefined> {
    const memberKey = `${roomId}-${walletAddress}`;
    return this.roomMembers.get(memberKey);
  }

  async removeRoomMember(roomId: number, walletAddress: string): Promise<boolean> {
    const memberKey = `${roomId}-${walletAddress}`;
    const success = this.roomMembers.delete(memberKey);
    
    if (success) {
      // Decrement the room's member count
      await this.decrementRoomMemberCount(roomId);
    }
    
    return success;
  }

  async updateRoomMemberLastActive(roomId: number, walletAddress: string): Promise<void> {
    const memberKey = `${roomId}-${walletAddress}`;
    const member = this.roomMembers.get(memberKey);
    if (!member) return;
    
    member.lastActive = new Date();
    this.roomMembers.set(memberKey, member);
  }

  async setRoomMemberAdmin(roomId: number, walletAddress: string, isAdmin: boolean): Promise<boolean> {
    const memberKey = `${roomId}-${walletAddress}`;
    const member = this.roomMembers.get(memberKey);
    if (!member) return false;
    
    member.isAdmin = isAdmin;
    this.roomMembers.set(memberKey, member);
    return true;
  }

  async banRoomMember(roomId: number, walletAddress: string, isBanned: boolean): Promise<boolean> {
    const memberKey = `${roomId}-${walletAddress}`;
    const member = this.roomMembers.get(memberKey);
    if (!member) return false;
    
    member.isBanned = isBanned;
    this.roomMembers.set(memberKey, member);
    return true;
  }
}

export class PgStorage implements IStorage {
  async createToken(insertToken: InsertToken): Promise<Token> {
    const [token] = await db.insert(tokens).values({
      ...insertToken,
      metadata: insertToken.metadata ?? {},
    }).returning();
    return token;
  }

  async getTokens(): Promise<Token[]> {
    return db.select().from(tokens).orderBy(desc(tokens.createdAt));
  }

  async getToken(mintAddress: string): Promise<Token | undefined> {
    const [token] = await db.select().from(tokens).where(eq(tokens.mintAddress, mintAddress)).limit(1);
    return token;
  }

  async createVote(vote: InsertVote): Promise<Vote> {
    const [created] = await db.insert(votes).values({
      ...vote,
      reason: vote.reason ?? null,
    }).returning();
    return created;
  }

  async updateVote(vote: InsertVote): Promise<Vote> {
    const [updated] = await db.update(votes)
      .set({
        isUpvote: vote.isUpvote,
        reason: vote.reason ?? null,
        signature: vote.signature,
      })
      .where(and(eq(votes.tokenId, vote.tokenId), eq(votes.walletAddress, vote.walletAddress)))
      .returning();

    if (!updated) throw new Error("Vote not found");
    return updated;
  }

  async getVote(tokenId: number, walletAddress: string): Promise<Vote | null> {
    const [vote] = await db.select().from(votes)
      .where(and(eq(votes.tokenId, tokenId), eq(votes.walletAddress, walletAddress)))
      .limit(1);
    return vote ?? null;
  }

  async getTokenVoteCounts(tokenId: number): Promise<VoteStats> {
    const rows = await db.select().from(votes).where(eq(votes.tokenId, tokenId));
    return {
      upvotes: rows.filter((vote: Vote) => vote.isUpvote).length,
      downvotes: rows.filter((vote: Vote) => !vote.isUpvote).length,
      totalVotes: rows.length,
    };
  }

  async updateTokenVoteCounts(tokenId: number): Promise<void> {
    const stats = await this.getTokenVoteCounts(tokenId);
    await db.update(tokens)
      .set({ upvotes: stats.upvotes, downvotes: stats.downvotes })
      .where(eq(tokens.id, tokenId));
  }

  async addVote(vote: TokenVote): Promise<void> {
    await db.insert(tokenVotes).values(vote).onConflictDoNothing();
  }

  async getVotesByToken(tokenAddress: string): Promise<TokenVote[]> {
    return db.select().from(tokenVotes).where(eq(tokenVotes.tokenAddress, tokenAddress));
  }

  async hasVoted(tokenAddress: string, walletAddress: string): Promise<boolean> {
    const [vote] = await db.select().from(tokenVotes)
      .where(and(eq(tokenVotes.tokenAddress, tokenAddress), eq(tokenVotes.walletAddress, walletAddress)))
      .limit(1);
    return !!vote;
  }

  async createBurn(insertBurn: InsertBurn): Promise<Burn> {
    const [burn] = await db.insert(burns).values({
      ...insertBurn,
      timestamp: insertBurn.timestamp ? new Date(insertBurn.timestamp) : new Date(),
      assetType: insertBurn.assetType ?? "token",
      metadata: insertBurn.metadata ?? {},
      signature: insertBurn.signature ?? "",
    }).returning();
    return burn;
  }

  async getBurns(): Promise<Burn[]> {
    return db.select().from(burns).orderBy(desc(burns.timestamp));
  }

  async getBurnsByOwner(ownerAddress: string): Promise<Burn[]> {
    return db.select().from(burns)
      .where(eq(burns.ownerAddress, ownerAddress))
      .orderBy(desc(burns.timestamp));
  }

  async getBurn(assetId: string): Promise<Burn | undefined> {
    const [burn] = await db.select().from(burns).where(eq(burns.assetId, assetId)).limit(1);
    return burn;
  }

  async createChatRoom(insertRoom: InsertChatRoom): Promise<ChatRoom> {
    const [room] = await db.insert(chatRooms).values({
      ...insertRoom,
      description: insertRoom.description ?? null,
      tokenAddress: insertRoom.tokenAddress ?? null,
      isPrivate: insertRoom.isPrivate ?? false,
      metadata: insertRoom.metadata ?? {},
    }).returning();
    return room;
  }

  async getChatRooms(): Promise<ChatRoom[]> {
    return db.select().from(chatRooms).orderBy(desc(chatRooms.lastActivity));
  }

  async getChatRoom(roomId: number): Promise<ChatRoom | undefined> {
    const [room] = await db.select().from(chatRooms).where(eq(chatRooms.id, roomId)).limit(1);
    return room;
  }

  async getChatRoomByToken(tokenAddress: string): Promise<ChatRoom | undefined> {
    const [room] = await db.select().from(chatRooms).where(eq(chatRooms.tokenAddress, tokenAddress)).limit(1);
    return room;
  }

  async updateChatRoom(roomId: number, updates: Partial<ChatRoom>): Promise<ChatRoom | undefined> {
    const [room] = await db.update(chatRooms).set(updates).where(eq(chatRooms.id, roomId)).returning();
    return room;
  }

  async incrementRoomMemberCount(roomId: number): Promise<number> {
    const [room] = await db.update(chatRooms)
      .set({ memberCount: sql`${chatRooms.memberCount} + 1`, lastActivity: new Date() })
      .where(eq(chatRooms.id, roomId))
      .returning({ memberCount: chatRooms.memberCount });
    if (!room) throw new Error("Room not found");
    return room.memberCount;
  }

  async decrementRoomMemberCount(roomId: number): Promise<number> {
    const [room] = await db.update(chatRooms)
      .set({ memberCount: sql`greatest(${chatRooms.memberCount} - 1, 0)`, lastActivity: new Date() })
      .where(eq(chatRooms.id, roomId))
      .returning({ memberCount: chatRooms.memberCount });
    if (!room) throw new Error("Room not found");
    return room.memberCount;
  }

  async updateRoomLastActivity(roomId: number): Promise<void> {
    await db.update(chatRooms).set({ lastActivity: new Date() }).where(eq(chatRooms.id, roomId));
  }

  async createChatMessage(insertMessage: InsertChatMessage): Promise<ChatMessage> {
    const [message] = await db.insert(chatMessages).values({
      ...insertMessage,
      isSystem: insertMessage.isSystem ?? false,
      replyTo: insertMessage.replyTo ?? null,
      clientType: insertMessage.clientType ?? null,
      metadata: insertMessage.metadata ?? {},
    }).returning();
    await this.updateRoomLastActivity(message.roomId);
    return message;
  }

  async getChatMessages(roomId: number, limit = 50, before?: number): Promise<ChatMessage[]> {
    if (before !== undefined) {
      return db.select().from(chatMessages)
        .where(and(eq(chatMessages.roomId, roomId), lt(chatMessages.id, before)))
        .orderBy(desc(chatMessages.timestamp))
        .limit(limit);
    }

    return db.select().from(chatMessages)
      .where(eq(chatMessages.roomId, roomId))
      .orderBy(desc(chatMessages.timestamp))
      .limit(limit);
  }

  async getChatMessage(messageId: number): Promise<ChatMessage | undefined> {
    const [message] = await db.select().from(chatMessages).where(eq(chatMessages.id, messageId)).limit(1);
    return message;
  }

  async addRoomMember(insertMember: InsertRoomMember): Promise<RoomMember> {
    const existing = await this.getRoomMember(insertMember.roomId, insertMember.walletAddress);
    if (existing) {
      const [updated] = await db.update(roomMembers)
        .set({ lastActive: new Date() })
        .where(eq(roomMembers.id, existing.id))
        .returning();
      return updated;
    }

    const [member] = await db.insert(roomMembers).values({
      ...insertMember,
      isAdmin: insertMember.isAdmin ?? false,
    }).returning();
    await this.incrementRoomMemberCount(insertMember.roomId);
    return member;
  }

  async getRoomMembers(roomId: number): Promise<RoomMember[]> {
    return db.select().from(roomMembers).where(eq(roomMembers.roomId, roomId));
  }

  async getRoomMember(roomId: number, walletAddress: string): Promise<RoomMember | undefined> {
    const [member] = await db.select().from(roomMembers)
      .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.walletAddress, walletAddress)))
      .limit(1);
    return member;
  }

  async removeRoomMember(roomId: number, walletAddress: string): Promise<boolean> {
    const removed = await db.delete(roomMembers)
      .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.walletAddress, walletAddress)))
      .returning({ id: roomMembers.id });
    if (removed.length > 0) {
      await this.decrementRoomMemberCount(roomId);
      return true;
    }
    return false;
  }

  async updateRoomMemberLastActive(roomId: number, walletAddress: string): Promise<void> {
    await db.update(roomMembers)
      .set({ lastActive: new Date() })
      .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.walletAddress, walletAddress)));
  }

  async setRoomMemberAdmin(roomId: number, walletAddress: string, isAdmin: boolean): Promise<boolean> {
    const updated = await db.update(roomMembers)
      .set({ isAdmin })
      .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.walletAddress, walletAddress)))
      .returning({ id: roomMembers.id });
    return updated.length > 0;
  }

  async banRoomMember(roomId: number, walletAddress: string, isBanned: boolean): Promise<boolean> {
    const updated = await db.update(roomMembers)
      .set({ isBanned })
      .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.walletAddress, walletAddress)))
      .returning({ id: roomMembers.id });
    return updated.length > 0;
  }
}

export const storage = hasDatabase ? new PgStorage() : new MemStorage();
