import { ethers } from 'hardhat';
import { SnxLiquidator } from '../typechain/SnxLiquidator';

const CONTRACT_ADDR = '0xb0C352225B161Da1Ba92b7d60Db3c26bF24c1Bb5';

async function main() {
  const [signer] = await ethers.getSigners();

  const factory = await ethers.getContractFactory('SnxLiquidator');
  const snxLiquidator = factory
    .attach(CONTRACT_ADDR)
    .connect(signer) as SnxLiquidator;

  const tx = await snxLiquidator.mintCHI('200');
  tx.wait(1);
  console.log(`CHI minted, tx hash ${tx.hash}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
