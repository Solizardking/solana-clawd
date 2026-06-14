import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import crossmintService from '@/lib/crossmintService';

export function BaseTransactionCard() {
  const [recipientAddress, setRecipientAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const { toast } = useToast();

  const handleConnect = async () => {
    setIsLoading(true);
    try {
      const response = await crossmintService.connect();
      if (response.connected && response.address) {
        setIsConnected(true);
        setWalletAddress(response.address);
        toast({
          title: "Connected to Base",
          description: `Wallet ${shortenAddress(response.address)} connected successfully`,
        });
        
        // Get balance
        const balanceValue = await crossmintService.getBalance();
        setBalance(balanceValue);
      } else {
        toast({
          title: "Connection Failed",
          description: response.error || "Could not connect to Base wallet",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Connection Error",
        description: error instanceof Error ? error.message : "An error occurred while connecting",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setIsLoading(true);
    try {
      await crossmintService.disconnect();
      setIsConnected(false);
      setWalletAddress(null);
      setBalance(null);
      toast({
        title: "Disconnected",
        description: "Your Base wallet has been disconnected",
      });
    } catch (error) {
      toast({
        title: "Disconnection Error",
        description: error instanceof Error ? error.message : "An error occurred while disconnecting",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendTransaction = async () => {
    if (!recipientAddress || !amount) {
      toast({
        title: "Missing Fields",
        description: "Please fill in both recipient address and amount",
        variant: "destructive",
      });
      return;
    }

    if (!isConnected) {
      toast({
        title: "Not Connected",
        description: "Please connect your Base wallet first",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);
    try {
      // Convert amount to wei (1 ETH = 10^18 wei)
      const weiAmount = (parseFloat(amount) * 1e18).toString();
      
      const txHash = await crossmintService.sendTransaction({
        to: recipientAddress,
        value: weiAmount,
      });
      
      toast({
        title: "Transaction Sent",
        description: `Transaction hash: ${shortenAddress(txHash)}`,
      });
      
      // Clear form fields
      setRecipientAddress('');
      setAmount('');
      
      // Update balance
      const newBalance = await crossmintService.getBalance();
      setBalance(newBalance);
    } catch (error) {
      toast({
        title: "Transaction Failed",
        description: error instanceof Error ? error.message : "Failed to send transaction",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const shortenAddress = (address: string): string => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatBalance = (balanceStr: string | null): string => {
    if (!balanceStr) return "0";
    
    try {
      // Convert from wei to ETH
      const balanceInEth = parseFloat(balanceStr) / 1e18;
      return balanceInEth.toFixed(4);
    } catch (error) {
      return "0";
    }
  };

  return (
    <Card className="w-full bg-black/40 border-purple-500/30">
      <CardHeader>
        <CardTitle>Base Transaction</CardTitle>
        <CardDescription>Send transactions on the Base network</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isConnected ? (
          <>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Connected Wallet:</span>
                <span className="text-sm font-medium">{shortenAddress(walletAddress || '')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Balance:</span>
                <span className="text-sm font-medium">{formatBalance(balance)} ETH</span>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="recipient">Recipient Address</Label>
              <Input
                id="recipient"
                placeholder="0x..."
                value={recipientAddress}
                onChange={(e) => setRecipientAddress(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (ETH)</Label>
              <Input
                id="amount"
                type="number"
                placeholder="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </>
        ) : (
          <div className="flex justify-center py-4">
            <p className="text-center text-muted-foreground">Connect your Base wallet to send transactions</p>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-between">
        {isConnected ? (
          <>
            <Button variant="outline" onClick={handleDisconnect} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Disconnect
            </Button>
            <Button onClick={handleSendTransaction} disabled={isSending || !recipientAddress || !amount}>
              {isSending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Send Transaction
            </Button>
          </>
        ) : (
          <Button onClick={handleConnect} className="w-full" disabled={isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Connect Base Wallet
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

export default BaseTransactionCard;