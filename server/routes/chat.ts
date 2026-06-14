import { Router } from "express";
import { eq } from "drizzle-orm";
import { storage } from "../storage";
import { z } from "zod";
import { insertChatRoomSchema, insertRoomMemberSchema } from "@shared/schema";
import { walletProfiles } from "../../drizzle/schema";
import { db } from "../db";
import { isAuthenticated } from "../middleware/session";
import { resolveApiPrincipal } from "../lib/api-auth";
import { trackUsageFromRequest } from "../lib/usage";

const router = Router();

// Create a new chat room
router.post("/rooms", isAuthenticated, async (req, res) => {
  try {
    const result = insertChatRoomSchema.safeParse(req.body);
    
    if (!result.success) {
      return res.status(400).json({ 
        error: "Invalid request data", 
        details: result.error.format() 
      });
    }
    
    const room = await storage.createChatRoom(result.data);
    
    // Add creator as a room member and admin
    await storage.addRoomMember({
      roomId: room.id,
      walletAddress: room.createdBy,
      displayName: req.body.displayName || "Admin",
      isAdmin: true
    });
    trackUsageFromRequest(req, {
      walletAddress: room.createdBy,
      eventType: "chat_session",
      productArea: "chat",
      route: "/api/chat/rooms",
      units: 1,
      metadata: { roomId: room.id, name: room.name, tokenAddress: room.tokenAddress },
    });
    
    res.status(201).json(room);
  } catch (error) {
    console.error("Error creating chat room:", error);
    res.status(500).json({ error: "Failed to create chat room" });
  }
});

// Get all chat rooms
router.get("/rooms", async (req, res) => {
  try {
    const rooms = await storage.getChatRooms();
    res.json(rooms);
  } catch (error) {
    console.error("Error fetching chat rooms:", error);
    res.status(500).json({ error: "Failed to fetch chat rooms" });
  }
});

// Get a specific chat room
router.get("/rooms/:id", async (req, res) => {
  try {
    const roomId = parseInt(req.params.id);
    if (isNaN(roomId)) {
      return res.status(400).json({ error: "Invalid room ID" });
    }
    
    const room = await storage.getChatRoom(roomId);
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }
    
    res.json(room);
  } catch (error) {
    console.error("Error fetching chat room:", error);
    res.status(500).json({ error: "Failed to fetch chat room" });
  }
});

// Get a chat room for a specific token
router.get("/rooms/token/:tokenAddress", async (req, res) => {
  try {
    const { tokenAddress } = req.params;
    
    const room = await storage.getChatRoomByToken(tokenAddress);
    if (!room) {
      return res.status(404).json({ error: "No room found for this token" });
    }
    
    res.json(room);
  } catch (error) {
    console.error("Error fetching token chat room:", error);
    res.status(500).json({ error: "Failed to fetch token chat room" });
  }
});

// Update a chat room (name, description, privacy settings)
router.patch("/rooms/:id", isAuthenticated, async (req, res) => {
  try {
    const roomId = parseInt(req.params.id);
    if (isNaN(roomId)) {
      return res.status(400).json({ error: "Invalid room ID" });
    }
    
    const room = await storage.getChatRoom(roomId);
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }
    
    // Check if user is admin
    const walletAddress = req.session.walletAddress;
    if (!walletAddress) {
      return res.status(401).json({ error: "Unauthorized: No wallet address found" });
    }
    const member = await storage.getRoomMember(roomId, walletAddress);
    
    if (!member?.isAdmin) {
      return res.status(403).json({ error: "You don't have permission to update this room" });
    }
    
    // Validate update fields
    const updateSchema = z.object({
      name: z.string().min(3).max(100).optional(),
      description: z.string().optional().nullable(),
      isPrivate: z.boolean().optional()
    });
    
    const result = updateSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ 
        error: "Invalid update data", 
        details: result.error.format() 
      });
    }
    
    const updatedRoom = await storage.updateChatRoom(roomId, result.data);
    res.json(updatedRoom);
    
  } catch (error) {
    console.error("Error updating chat room:", error);
    res.status(500).json({ error: "Failed to update chat room" });
  }
});

// Get messages for a chat room
router.get("/rooms/:id/messages", async (req, res) => {
  try {
    const roomId = parseInt(req.params.id);
    if (isNaN(roomId)) {
      return res.status(400).json({ error: "Invalid room ID" });
    }
    
    const room = await storage.getChatRoom(roomId);
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }
    
    // Parse query parameters
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const before = req.query.before ? parseInt(req.query.before as string) : undefined;
    
    const messages = await storage.getChatMessages(roomId, limit, before);
    res.json(messages);
    
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// Post a message to a chat room (supports Bearer API key auth for agent-arena skill)
router.post("/rooms/:id/messages", async (req, res) => {
  try {
    const roomId = parseInt(req.params.id);
    if (isNaN(roomId)) return res.status(400).json({ error: "Invalid room ID" });

    const principal = await resolveApiPrincipal(req);
    if (!principal) return res.status(401).json({ error: "Unauthorized" });

    const room = await storage.getChatRoom(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });

    // Resolve sender wallet — prefer body.sender, then session wallet, then DB lookup
    let senderWallet: string | null = null;
    if (principal.type === "wallet-session") {
      senderWallet = principal.walletAddress;
    } else if (typeof req.body.sender === "string" && req.body.sender.length >= 32) {
      senderWallet = req.body.sender;
    } else if (principal.type === "api-key" || principal.type === "clerk-user") {
      const [profile] = await db
        .select({ walletAddress: walletProfiles.walletAddress })
        .from(walletProfiles)
        .where(eq(walletProfiles.userId, principal.userId))
        .limit(1);
      senderWallet = profile?.walletAddress ?? null;
    }
    if (!senderWallet) {
      return res.status(400).json({ error: "Cannot determine sender wallet — include sender in body or link a wallet to your API key." });
    }

    const schema = z.object({
      content: z.string().min(1).max(2000),
      displayName: z.string().min(1).max(50).optional(),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: "Invalid message data", details: result.error.format() });

    if (room.isPrivate) {
      const member = await storage.getRoomMember(roomId, senderWallet);
      if (!member || member.isBanned) {
        return res.status(403).json({ error: "Not a member of this private room" });
      }
    }

    const message = await storage.createChatMessage({
      roomId,
      sender: senderWallet,
      senderName: result.data.displayName || "Agent",
      content: result.data.content,
      isSystem: false,
      clientType: "agent-arena",
    });

    res.status(201).json(message);
  } catch (error) {
    console.error("Error creating message:", error);
    res.status(500).json({ error: "Failed to create message" });
  }
});

// Get members of a chat room
router.get("/rooms/:id/members", async (req, res) => {
  try {
    const roomId = parseInt(req.params.id);
    if (isNaN(roomId)) {
      return res.status(400).json({ error: "Invalid room ID" });
    }
    
    const room = await storage.getChatRoom(roomId);
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }
    
    const members = await storage.getRoomMembers(roomId);
    res.json(members);
    
  } catch (error) {
    console.error("Error fetching room members:", error);
    res.status(500).json({ error: "Failed to fetch room members" });
  }
});

// Add a member to a room (for private rooms)
router.post("/rooms/:id/members", isAuthenticated, async (req, res) => {
  try {
    const roomId = parseInt(req.params.id);
    if (isNaN(roomId)) {
      return res.status(400).json({ error: "Invalid room ID" });
    }
    
    const room = await storage.getChatRoom(roomId);
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }
    
    // Check if user is admin (only admins can add members to private rooms)
    if (room.isPrivate) {
      const walletAddress = req.session.walletAddress;
      if (!walletAddress) {
        return res.status(401).json({ error: "Unauthorized: No wallet address found" });
      }
      const adminMember = await storage.getRoomMember(roomId, walletAddress);
      
      if (!adminMember?.isAdmin) {
        return res.status(403).json({ 
          error: "You don't have permission to add members to this private room" 
        });
      }
    }
    
    // Validate new member data
    const result = insertRoomMemberSchema.safeParse({
      ...req.body,
      roomId
    });
    
    if (!result.success) {
      return res.status(400).json({ 
        error: "Invalid member data", 
        details: result.error.format() 
      });
    }
    
    // Check if member already exists
    const existingMember = await storage.getRoomMember(roomId, result.data.walletAddress);
    if (existingMember) {
      return res.status(409).json({ error: "Member already exists in this room" });
    }
    
    const member = await storage.addRoomMember(result.data);
    res.status(201).json(member);
    
  } catch (error) {
    console.error("Error adding room member:", error);
    res.status(500).json({ error: "Failed to add member to room" });
  }
});

// Remove a member from a room
router.delete("/rooms/:roomId/members/:walletAddress", isAuthenticated, async (req, res) => {
  try {
    const roomId = parseInt(req.params.roomId);
    if (isNaN(roomId)) {
      return res.status(400).json({ error: "Invalid room ID" });
    }
    
    const { walletAddress } = req.params;
    
    const room = await storage.getChatRoom(roomId);
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }
    
    // Check permissions
    const requestingUser = req.session.walletAddress;
    if (!requestingUser) {
      return res.status(401).json({ error: "Unauthorized: No wallet address found" });
    }
    const requestingMember = await storage.getRoomMember(roomId, requestingUser);
    
    // User can remove themselves or admin can remove others
    if (requestingUser !== walletAddress && !requestingMember?.isAdmin) {
      return res.status(403).json({ 
        error: "You don't have permission to remove this member" 
      });
    }
    
    const result = await storage.removeRoomMember(roomId, walletAddress);
    if (!result) {
      return res.status(404).json({ error: "Member not found" });
    }
    
    res.status(204).send();
    
  } catch (error) {
    console.error("Error removing room member:", error);
    res.status(500).json({ error: "Failed to remove member from room" });
  }
});

// Set admin status for a member
router.patch("/rooms/:roomId/members/:walletAddress/admin", isAuthenticated, async (req, res) => {
  try {
    const roomId = parseInt(req.params.roomId);
    if (isNaN(roomId)) {
      return res.status(400).json({ error: "Invalid room ID" });
    }
    
    const { walletAddress } = req.params;
    
    // Validate request body
    const schema = z.object({
      isAdmin: z.boolean()
    });
    
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ 
        error: "Invalid request data", 
        details: result.error.format() 
      });
    }
    
    // Check if room exists
    const room = await storage.getChatRoom(roomId);
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }
    
    // Check if requester is an admin
    const requestingUser = req.session.walletAddress;
    if (!requestingUser) {
      return res.status(401).json({ error: "Unauthorized: No wallet address found" });
    }
    const requestingMember = await storage.getRoomMember(roomId, requestingUser);
    
    if (!requestingMember?.isAdmin) {
      return res.status(403).json({ 
        error: "You don't have permission to change admin status" 
      });
    }
    
    // Check if target member exists
    const targetMember = await storage.getRoomMember(roomId, walletAddress);
    if (!targetMember) {
      return res.status(404).json({ error: "Member not found" });
    }
    
    // Update admin status
    const updated = await storage.setRoomMemberAdmin(roomId, walletAddress, result.data.isAdmin);
    if (!updated) {
      return res.status(500).json({ error: "Failed to update admin status" });
    }
    
    const updatedMember = await storage.getRoomMember(roomId, walletAddress);
    res.json(updatedMember);
    
  } catch (error) {
    console.error("Error setting admin status:", error);
    res.status(500).json({ error: "Failed to set admin status" });
  }
});

// Ban or unban a member
router.patch("/rooms/:roomId/members/:walletAddress/ban", isAuthenticated, async (req, res) => {
  try {
    const roomId = parseInt(req.params.roomId);
    if (isNaN(roomId)) {
      return res.status(400).json({ error: "Invalid room ID" });
    }
    
    const { walletAddress } = req.params;
    
    // Validate request body
    const schema = z.object({
      isBanned: z.boolean()
    });
    
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ 
        error: "Invalid request data", 
        details: result.error.format() 
      });
    }
    
    // Check if room exists
    const room = await storage.getChatRoom(roomId);
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }
    
    // Check if requester is an admin
    const requestingUser = req.session.walletAddress;
    if (!requestingUser) {
      return res.status(401).json({ error: "Unauthorized: No wallet address found" });
    }
    const requestingMember = await storage.getRoomMember(roomId, requestingUser);
    
    if (!requestingMember?.isAdmin) {
      return res.status(403).json({ 
        error: "You don't have permission to ban members" 
      });
    }
    
    // Check if target member exists
    const targetMember = await storage.getRoomMember(roomId, walletAddress);
    if (!targetMember) {
      return res.status(404).json({ error: "Member not found" });
    }
    
    // Can't ban other admins
    if (targetMember.isAdmin && requestingUser !== walletAddress) {
      return res.status(403).json({ error: "Cannot ban an admin" });
    }
    
    // Update ban status
    const updated = await storage.banRoomMember(roomId, walletAddress, result.data.isBanned);
    if (!updated) {
      return res.status(500).json({ error: "Failed to update ban status" });
    }
    
    const updatedMember = await storage.getRoomMember(roomId, walletAddress);
    res.json(updatedMember);
    
  } catch (error) {
    console.error("Error setting ban status:", error);
    res.status(500).json({ error: "Failed to set ban status" });
  }
});

export default router;
