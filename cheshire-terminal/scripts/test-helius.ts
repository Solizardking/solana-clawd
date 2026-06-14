/**
 * This script tests the Helius API service
 * 
 * To run: 
 * npx tsx scripts/test-helius.ts
 */

import * as dotenv from 'dotenv';
import fetch from 'node-fetch';

// Load environment variables
dotenv.config();

const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL || process.env.VITE_HELIUS_RPC_URL;
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || '';

if (!HELIUS_RPC_URL) {
  console.error('Error: HELIUS_RPC_URL environment variable is not set');
  process.exit(1);
}

if (!HELIUS_API_KEY) {
  console.error('Error: HELIUS_API_KEY environment variable is not set');
  process.exit(1);
}

async function makeHeliusRequest(method: string, params: any = {}) {
  const response = await fetch(HELIUS_RPC_URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now().toString(),
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// For REST API calls to Helius
async function makeHeliusRestRequest(endpoint: string, params: any = {}) {
  const url = new URL(`https://api.helius.xyz/v0/${endpoint}`);
  url.searchParams.append('api-key', HELIUS_API_KEY);
  
  // Add all params to the URL
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, String(value));
  });
  
  console.log(`Making request to: ${url.toString().replace(HELIUS_API_KEY, 'API_KEY_HIDDEN')}`);
  
  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Error: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

async function testHeliusConnection() {
  console.log('Testing Helius connection...');
  try {
    // Test basic connection
    const healthResponse = await makeHeliusRequest('getHealth');
    console.log('Health check response:', healthResponse);

    // Get network version
    const versionResponse = await makeHeliusRequest('getVersion');
    console.log('Version response:', versionResponse);

    console.log('\nHelius connection test: SUCCESS ✅');
  } catch (error) {
    console.error('Helius connection test: FAILED ❌');
    console.error(error);
  }
}

async function testGetAssetsByOwner() {
  // Test wallet with tokens: Use a fixed Solana wallet for testing
  // This is BonfidaSerum's wallet which should have assets
  const testWalletAddress = '7CQGu1FgCQRd6sQxoK2jmJJRtxnKnj4HaTDHMVSuwwXQ';

  console.log(`\nTesting getAssetsByOwner for wallet: ${testWalletAddress}...`);
  try {
    // Use the correct RPC parameter format
    const response = await makeHeliusRequest('getAssetsByOwner', {
      ownerAddress: testWalletAddress,
      page: 1,
      limit: 10,
    });

    if (response.result?.items && Array.isArray(response.result.items)) {
      console.log(`Found ${response.result.items.length} assets`);
      
      if (response.result.items.length > 0) {
        console.log('First asset:', {
          id: response.result.items[0].id,
          name: response.result.items[0].content?.metadata?.name || 'Unnamed',
          symbol: response.result.items[0].content?.metadata?.symbol || 'No symbol',
          tokenStandard: response.result.items[0].tokenStandard,
        });
      }
    } else {
      console.log('No assets found or unexpected response format:', response);
    }

    console.log('getAssetsByOwner test: SUCCESS ✅');
  } catch (error) {
    console.error('getAssetsByOwner test: FAILED ❌');
    console.error(error);
  }
}

async function testDasApi() {
  // Test wallet with tokens: Use a fixed Solana wallet for testing
  // This is BonfidaSerum's wallet which should have assets
  const testWalletAddress = '7CQGu1FgCQRd6sQxoK2jmJJRtxnKnj4HaTDHMVSuwwXQ';

  console.log(`\nTesting DAS API for wallet: ${testWalletAddress}...`);
  try {
    // Get wallet balances
    const response = await makeHeliusRestRequest('addresses/' + testWalletAddress + '/balances');
    console.log('DAS API response (balances):', response);

    // Try using search-assets DAS API
    console.log('Trying search-assets endpoint...');
    const assetsResponse = await makeHeliusRestRequest('search-assets', {
      ownerAddress: testWalletAddress,
      limit: 10,
      page: 1
    });
    
    if (Array.isArray(assetsResponse)) {
      console.log(`Found ${assetsResponse.length} assets via search-assets API`);
      
      if (assetsResponse.length > 0) {
        console.log('First asset:', {
          id: assetsResponse[0].id,
          name: assetsResponse[0]?.content?.metadata?.name || 'Unnamed',
          symbol: assetsResponse[0]?.content?.metadata?.symbol || 'No symbol',
          tokenStandard: assetsResponse[0]?.tokenStandard
        });
      }
    } else {
      console.log('No assets found or unexpected response format:', assetsResponse);
    }

    console.log('DAS API test: SUCCESS ✅');
  } catch (error) {
    console.error('DAS API test: FAILED ❌');
    console.error(error);
  }
}

async function main() {
  console.log('====================================');
  console.log('HELIUS API SERVICE TEST');
  console.log('====================================\n');

  await testHeliusConnection();
  await testGetAssetsByOwner();
  await testDasApi();

  console.log('\n====================================');
  console.log('TEST COMPLETED');
  console.log('====================================');
}

main().catch(console.error);