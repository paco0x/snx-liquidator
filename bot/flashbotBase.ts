import { ethers } from 'hardhat';
import { BigNumberish, providers, Wallet } from 'ethers';
import { keccak256 } from 'ethers/lib/utils';
import {
  FlashbotsBundleProvider,
  FlashbotsBundleTransaction,
} from '@flashbots/ethers-provider-bundle';

import { SnxLiquidator } from '../typechain/SnxLiquidator';

// Standard json rpc provider directly from ethers.js (NOT Flashbots)
export const provider = new providers.WebSocketProvider(
  'wss://mainnet.infura.io/ws/v3/3a57292f72e4472b8ac896816a27d51f'
);

// create random one, only for signing txs
export const authSigner = Wallet.createRandom().connect(provider);

// deployed contract address
export const contractAddr = '0x9fA5fF96e123eF70BDc0A431A880e8EB38fdD5fc';

const loanABI = ['function loanLiquidationOpen() external view returns(bool)'];
export const susdCollateral = new ethers.Contract(
  '0xfED77055B40d63DCf17ab250FFD6948FBFF57B82',
  loanABI,
  provider
);

export const sethCollateral = new ethers.Contract(
  '0x7133afF303539b0A4F60Ab9bd9656598BF49E272',
  loanABI,
  provider
);

export async function getBundles(
  minerBp: BigNumberish,
  loaners: Array<any>,
  flashbotsProvider: FlashbotsBundleProvider
): Promise<[Array<string>, Array<string>]> {
  const factory = await ethers.getContractFactory('SnxLiquidator');
  const liquidator = factory.attach(contractAddr) as SnxLiquidator;

  let bundles = new Array<FlashbotsBundleTransaction>();
  for (const loaner of loaners) {
    const tx = await liquidator
      .connect(authSigner)
      .populateTransaction.liquidate(
        loaner.account,
        loaner.loanID,
        loaner.loanType,
        minerBp,
        {
          gasPrice: 0,
          gasLimit: 500000,
        }
      );
    bundles.push({ signer: authSigner, transaction: tx });
  }
  const signedTxs = await flashbotsProvider.signBundle(bundles);
  const revertingTxHashes = signedTxs.map((v) => keccak256(v));
  return [signedTxs, revertingTxHashes];
}
