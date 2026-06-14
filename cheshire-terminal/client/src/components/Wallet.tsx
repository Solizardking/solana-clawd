import { FC, useEffect, useMemo, useState } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { getBuildTimePublicConfig, getWalletRpcUrl } from '@/lib/publicConfig';

// Import styles
import '@solana/wallet-adapter-react-ui/styles.css';

export const Wallet: FC<{ children: React.ReactNode }> = ({ children }) => {
    const [endpoint, setEndpoint] = useState(() => getBuildTimePublicConfig().walletRpcUrl);

    useEffect(() => {
        let cancelled = false;
        getWalletRpcUrl().then((rpcUrl) => {
            if (!cancelled) setEndpoint(rpcUrl);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    // Initialize wallet adapters
    const wallets = useMemo(
        () => {
            try {
                return [new PhantomWalletAdapter()];
            } catch (error) {
                console.error("Error initializing wallet adapters:", error);
                return [];
            }
        },
        []
    );

    return (
        <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>
                    {children}
                </WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
};
