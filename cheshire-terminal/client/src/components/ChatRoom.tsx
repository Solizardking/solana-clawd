import { useState, useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { wsClient } from '@/lib/websocket';
import { ChatEventType, ChatRoom as ChatRoomType, ChatMessage } from '@shared/schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Card, 
  CardHeader, 
  CardContent, 
  CardFooter, 
  CardTitle, 
  CardDescription 
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  MessageSquare, 
  Send, 
  Users, 
  LogOut, 
  MoreVertical,
  Clock,
  ArrowRight,
  Check,
  Ban,
  Settings,
  ShieldAlert
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface RoomMember {
  id: number;
  roomId: number;
  walletAddress: string;
  displayName: string;
  isAdmin: boolean;
  isBanned: boolean;
}

interface ChatRoomProps {
  roomId: number;
  walletAddress: string | undefined;
  displayName: string;
  onClose?: () => void;
  className?: string;
}

export function ChatRoom({ roomId, walletAddress, displayName, onClose, className }: ChatRoomProps) {
  const [room, setRoom] = useState<ChatRoomType | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showMembers, setShowMembers] = useState(false);
  const { publicKey } = useWallet();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Check if current user is an admin
  const isAdmin = members.find(m => 
    m.walletAddress === walletAddress && m.isAdmin
  ) !== undefined;

  // Auto-scroll to bottom when new messages come in
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Fetch room details on load
  useEffect(() => {
    async function fetchRoom() {
      try {
        const response = await fetch(`/api/chat/rooms/${roomId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch room');
        }
        const roomData = await response.json();
        setRoom(roomData);
      } catch (error) {
        console.error('Error fetching room:', error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to fetch chat room details'
        });
      }
    }

    fetchRoom();
  }, [roomId]);

  // Fetch members on load
  useEffect(() => {
    async function fetchMembers() {
      try {
        const response = await fetch(`/api/chat/rooms/${roomId}/members`);
        if (!response.ok) {
          throw new Error('Failed to fetch members');
        }
        const membersData = await response.json();
        setMembers(membersData);
      } catch (error) {
        console.error('Error fetching members:', error);
      }
    }

    if (isJoined) {
      fetchMembers();
    }
  }, [roomId, isJoined]);

  // Connect to WebSocket and join room
  useEffect(() => {
    if (!walletAddress || !room) return;

    // Make sure WebSocket client is connected
    if (!wsClient.isConnected()) {
      wsClient.connect();
    }

    const handleMessage = (data: any) => {
      if (data.type === 'connection_established') {
        // Join the room once we have a WebSocket connection
        joinRoom();
      } else if (data.type === 'room_joined') {
        // Successfully joined room
        setIsJoined(true);
        setIsLoading(false);
        setMessages(data.messages.reverse()); // Messages come in newest first, reverse for display
      } else if (data.type === ChatEventType.NEW_MESSAGE) {
        // Received a new message
        if (data.roomId === roomId) {
          setMessages(prev => [...prev, data.message]);
        }
      } else if (data.type === ChatEventType.USER_JOINED) {
        // A user joined the room
        if (data.roomId === roomId) {
          // Refresh member list
          fetchMembers();
          // Add system message
          toast({
            title: 'New user joined',
            description: `${data.user?.displayName} joined the room`
          });
        }
      } else if (data.type === ChatEventType.USER_LEFT) {
        // A user left the room
        if (data.roomId === roomId) {
          // Refresh member list
          fetchMembers();
        }
      } else if (data.type === ChatEventType.ERROR) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: data.error
        });
      }
    };

    // Set message handler
    wsClient.onMessage = handleMessage;

    // Join room function
    const joinRoom = () => {
      wsClient.send({
        type: ChatEventType.JOIN_ROOM,
        roomId,
        walletAddress,
        displayName
      });
    };

    // Check if already connected, and join immediately
    if (wsClient.isConnected()) {
      joinRoom();
    }

    // Fetch members function
    const fetchMembers = async () => {
      try {
        const response = await fetch(`/api/chat/rooms/${roomId}/members`);
        if (response.ok) {
          const membersData = await response.json();
          setMembers(membersData);
        }
      } catch (error) {
        console.error('Error fetching members:', error);
      }
    };

    // Clean up on unmount
    return () => {
      if (isJoined) {
        wsClient.send({
          type: ChatEventType.LEAVE_ROOM,
          roomId
        });
      }
    };
  }, [roomId, walletAddress, displayName, room]);

  // Handle sending messages
  const sendMessage = () => {
    if (!inputMessage.trim() || !isJoined) return;

    wsClient.send({
      type: ChatEventType.SEND_MESSAGE,
      roomId,
      content: inputMessage
    });

    setInputMessage('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Handle leaving the room
  const leaveRoom = () => {
    wsClient.send({
      type: ChatEventType.LEAVE_ROOM,
      roomId
    });
    setIsJoined(false);
    if (onClose) onClose();
  };

  // Format timestamp
  const formatTime = (timestamp: Date) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Member management
  const toggleAdminStatus = async (targetWalletAddress: string, makeAdmin: boolean) => {
    try {
      const response = await fetch(`/api/chat/rooms/${roomId}/members/${targetWalletAddress}/admin`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ isAdmin: makeAdmin })
      });

      if (!response.ok) {
        throw new Error('Failed to update admin status');
      }

      // Refresh member list
      const membersResponse = await fetch(`/api/chat/rooms/${roomId}/members`);
      if (membersResponse.ok) {
        const membersData = await membersResponse.json();
        setMembers(membersData);
      }

      toast({
        title: makeAdmin ? 'Promoted to admin' : 'Removed admin status',
        description: `${members.find(m => m.walletAddress === targetWalletAddress)?.displayName} is ${makeAdmin ? 'now' : 'no longer'} an admin`
      });
    } catch (error) {
      console.error('Error updating admin status:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to update admin status'
      });
    }
  };

  const toggleBanStatus = async (targetWalletAddress: string, ban: boolean) => {
    try {
      const response = await fetch(`/api/chat/rooms/${roomId}/members/${targetWalletAddress}/ban`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ isBanned: ban })
      });

      if (!response.ok) {
        throw new Error('Failed to update ban status');
      }

      // Refresh member list
      const membersResponse = await fetch(`/api/chat/rooms/${roomId}/members`);
      if (membersResponse.ok) {
        const membersData = await membersResponse.json();
        setMembers(membersData);
      }

      toast({
        variant: ban ? 'destructive' : 'default',
        title: ban ? 'User banned' : 'User unbanned',
        description: `${members.find(m => m.walletAddress === targetWalletAddress)?.displayName} has been ${ban ? 'banned from' : 'unbanned in'} this room`
      });
    } catch (error) {
      console.error('Error updating ban status:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to update ban status'
      });
    }
  };

  const removeMember = async (targetWalletAddress: string) => {
    try {
      const response = await fetch(`/api/chat/rooms/${roomId}/members/${targetWalletAddress}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to remove member');
      }

      // Refresh member list
      const membersResponse = await fetch(`/api/chat/rooms/${roomId}/members`);
      if (membersResponse.ok) {
        const membersData = await membersResponse.json();
        setMembers(membersData);
      }

      toast({
        title: 'Member removed',
        description: `${members.find(m => m.walletAddress === targetWalletAddress)?.displayName} has been removed from the room`
      });
    } catch (error) {
      console.error('Error removing member:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to remove member'
      });
    }
  };

  if (isLoading || !room) {
    return (
      <Card className={cn("w-full h-[500px] flex items-center justify-center", className)}>
        <div className="text-center">
          <MessageSquare className="mx-auto h-12 w-12 text-primary animate-pulse" />
          <p className="mt-2">Connecting to chat room...</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className={cn("w-full flex flex-col h-[500px] relative", className)}>
      <CardHeader className="p-4 flex flex-row items-center space-y-0 gap-4">
        <div className="flex-1">
          <CardTitle className="text-xl flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            {room.name}
          </CardTitle>
          <CardDescription>
            {room.tokenAddress ? `Token chat for ${room.tokenAddress.slice(0, 6)}...` : room.description}
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowMembers(!showMembers)}
            aria-label="Toggle member list"
          >
            <Users className="h-4 w-4" />
            <span className="ml-1">{members.length}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={leaveRoom}
            aria-label="Leave room"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <div className="flex flex-1 overflow-hidden">
        {/* Messages area */}
        <div className={cn(
          "flex-1 overflow-y-auto p-4", 
          showMembers ? "hidden md:block md:flex-1" : "flex-1"
        )}>
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <MessageSquare className="h-12 w-12 mb-2" />
              <p>No messages yet. Be the first to chat!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <div 
                  key={message.id} 
                  className={cn(
                    "flex items-start gap-2 max-w-[85%]",
                    message.isSystem 
                      ? "mx-auto text-center text-muted-foreground text-sm italic" 
                      : message.sender === walletAddress 
                      ? "ml-auto" 
                      : "mr-auto"
                  )}
                >
                  {!message.isSystem && message.sender !== walletAddress && (
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={`https://api.dicebear.com/7.x/identicon/svg?seed=${message.sender}`} />
                      <AvatarFallback>{message.senderName.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                  )}
                  <div className={cn(
                    "flex flex-col",
                    message.isSystem ? "py-2" : message.sender === walletAddress 
                      ? "items-end" 
                      : "items-start"
                  )}>
                    {!message.isSystem && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{message.sender === walletAddress ? 'You' : message.senderName}</span>
                        <span className="text-xs text-muted-foreground flex items-center">
                          <Clock className="h-3 w-3 mr-1" />
                          {formatTime(message.timestamp)}
                        </span>
                      </div>
                    )}
                    <div className={cn(
                      "rounded-lg p-3",
                      message.isSystem 
                        ? "" 
                        : message.sender === walletAddress 
                        ? "bg-primary text-primary-foreground" 
                        : "bg-muted"
                    )}>
                      {message.content}
                    </div>
                  </div>

                  {!message.isSystem && message.sender === walletAddress && (
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={`https://api.dicebear.com/7.x/identicon/svg?seed=${message.sender}`} />
                      <AvatarFallback>{message.senderName.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Members sidebar */}
        {showMembers && (
          <div className="w-full md:w-64 md:border-l border-border p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">Room Members</h3>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 w-8 p-0 md:hidden"
                onClick={() => setShowMembers(false)}
              >
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="space-y-2">
              {members.map((member) => (
                <div 
                  key={member.id} 
                  className={cn(
                    "flex items-center justify-between p-2 rounded-md",
                    member.walletAddress === walletAddress ? "bg-muted" : "",
                    member.isBanned ? "opacity-60" : ""
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={`https://api.dicebear.com/7.x/identicon/svg?seed=${member.walletAddress}`} />
                      <AvatarFallback>{member.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium text-sm flex items-center gap-1">
                        {member.displayName}
                        {member.isAdmin && <span title="Admin"><ShieldAlert className="h-3 w-3 text-primary" /></span>}
                        {member.isBanned && <span title="Banned"><Ban className="h-3 w-3 text-destructive" /></span>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {member.walletAddress.slice(0, 4)}...{member.walletAddress.slice(-4)}
                      </div>
                    </div>
                  </div>

                  {/* Admin controls for other members */}
                  {isAdmin && member.walletAddress !== walletAddress && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {!member.isAdmin && (
                          <DropdownMenuItem onClick={() => toggleAdminStatus(member.walletAddress, true)}>
                            <ShieldAlert className="mr-2 h-4 w-4" />
                            <span>Make admin</span>
                          </DropdownMenuItem>
                        )}
                        {member.isAdmin && (
                          <DropdownMenuItem onClick={() => toggleAdminStatus(member.walletAddress, false)}>
                            <ShieldAlert className="mr-2 h-4 w-4" />
                            <span>Remove admin</span>
                          </DropdownMenuItem>
                        )}
                        {!member.isBanned && (
                          <DropdownMenuItem onClick={() => toggleBanStatus(member.walletAddress, true)}>
                            <Ban className="mr-2 h-4 w-4" />
                            <span>Ban user</span>
                          </DropdownMenuItem>
                        )}
                        {member.isBanned && (
                          <DropdownMenuItem onClick={() => toggleBanStatus(member.walletAddress, false)}>
                            <Check className="mr-2 h-4 w-4" />
                            <span>Unban user</span>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => removeMember(member.walletAddress)}>
                          <LogOut className="mr-2 h-4 w-4" />
                          <span>Remove from room</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <CardFooter className="p-4 pt-2">
        <div className="flex w-full gap-2">
          <Input
            placeholder="Type a message"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyPress}
            className="flex-1"
            disabled={!isJoined}
          />
          <Button 
            onClick={sendMessage} 
            disabled={!isJoined || !inputMessage.trim()}
            size="icon"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}