import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { ethers } from 'ethers';

interface Web3ContextType {
  account: string | null;
  provider: ethers.BrowserProvider | null;
  signer: ethers.Signer | null;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  chainId: number | null;
  isCorrectNetwork: boolean;
}

const Web3Context = createContext<Web3ContextType | undefined>(undefined);

const TARGET_CHAIN_ID = 11155111; // Sepolia Testnet

export const Web3Provider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [account, setAccount] = useState<string | null>(null);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);

  useEffect(() => {
    if (window.ethereum) {
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      setProvider(browserProvider);

      window.ethereum.on('accountsChanged', (accounts: string[]) => {
        if (accounts.length > 0) {
          setAccount(accounts[0]);
          browserProvider.getSigner().then(setSigner);
        } else {
          setAccount(null);
          setSigner(null);
        }
      });

      window.ethereum.on('chainChanged', () => {
        window.location.reload();
      });
    }
  }, []);

  const connectWallet = async () => {
    if (!window.ethereum || !provider) {
      alert('Metamask not detected');
      return;
    }

    try {
      const accounts = await provider.send('eth_requestAccounts', []);

      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0xAA36A7' }], // Sepolia 11155111
        });
      } catch (switchError: any) {
        if (switchError.code === 4902) {
          try {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [
                {
                  chainId: '0xAA36A7',
                  chainName: 'Sepolia Testnet',
                  rpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'],
                  nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
                  blockExplorerUrls: ['https://sepolia.etherscan.io']
                },
              ],
            });
          } catch (addError) {
            console.error('Failed to add network', addError);
          }
        } else {
          console.error('Failed to switch network', switchError);
        }
      }

      const network = await provider.getNetwork();
      setAccount(accounts[0]);
      setChainId(Number(network.chainId));
      const newSigner = await provider.getSigner();
      setSigner(newSigner);
    } catch (error) {
      console.error('Connection failed', error);
    }
  };

  const disconnectWallet = () => {
    setAccount(null);
    setSigner(null);
  };

  const isCorrectNetwork = chainId === TARGET_CHAIN_ID;

  return (
    <Web3Context.Provider value={{ 
      account, 
      provider, 
      signer, 
      connectWallet, 
      disconnectWallet, 
      chainId, 
      isCorrectNetwork 
    }}>
      {children}
    </Web3Context.Provider>
  );
};

export const useWeb3 = () => {
  const context = useContext(Web3Context);
  if (context === undefined) {
    throw new Error('useWeb3 must be used within a Web3Provider');
  }
  return context;
};

declare global {
  interface Window {
    ethereum: any;
  }
}
