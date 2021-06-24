import { ethers } from 'hardhat';

async function main() {
  const factory = await ethers.getContractFactory('SnxLiquidator');
  const snxLiquidator = await factory.deploy();

  await snxLiquidator.deployed();
  console.log(`Contract deployed to ${snxLiquidator.address}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
