import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { Contract, Wallet } from 'ethers';
import { ethers, network, waffle } from 'hardhat';
import { expect } from 'chai';
import chai from 'chai';
import { solidity } from 'ethereum-waffle';
chai.use(solidity);

import { SnxLiquidator } from '../typechain/SnxLiquidator';

describe('SnxLiquidation', () => {
  let snxLiquidator: SnxLiquidator;
  let susdLoaner: Contract;
  let sethLoaner: Contract;
  let signer: SignerWithAddress;
  const provider = waffle.provider;

  const loanABI = [
    'function loanLiquidationOpen() external view returns(bool)',
  ];
  const susdLoanAddr = '0xfED77055B40d63DCf17ab250FFD6948FBFF57B82';
  const sethLoanAddr = '0x7133afF303539b0A4F60Ab9bd9656598BF49E272';

  beforeEach(async () => {
    [signer] = await ethers.getSigners();

    const SnxLiquidatorFactory = await ethers.getContractFactory(
      'SnxLiquidator'
    );
    snxLiquidator = (await SnxLiquidatorFactory.deploy()) as SnxLiquidator;

    // Set loanLiquidationOpen to true so we can mock liquidate
    await network.provider.send('hardhat_setStorageAt', [
      susdLoanAddr,
      '0xf',
      '0x0000000000000000000000000000000000000000000000000000000000000001',
    ]);
    await network.provider.send('hardhat_setStorageAt', [
      sethLoanAddr,
      '0xf',
      '0x0000000000000000000000000000000000000000000000000000000000000001',
    ]);

    susdLoaner = new ethers.Contract(susdLoanAddr, loanABI, provider);
    sethLoaner = new ethers.Contract(sethLoanAddr, loanABI, provider);
  });

  it('Set the loanLiquidationOpen to true', async () => {
    let liquidationOpened = await susdLoaner.loanLiquidationOpen();
    expect(liquidationOpened).to.be.eq(true, 'SUSD liquidation not opened');

    liquidationOpened = await sethLoaner.loanLiquidationOpen();
    expect(liquidationOpened).to.be.eq(true, 'SETH liquidation not opened');
  });

  it('Owner is set correctly', async () => {
    const owner = await snxLiquidator.owner();
    expect(owner).to.be.eq(signer.address);
  });

  it('Liquidate on susd with bribe', async () => {
    const randomSigner = Wallet.createRandom().connect(waffle.provider);
    snxLiquidator.connect(randomSigner);
    await network.provider.send('hardhat_setBalance', [
      await randomSigner.getAddress(),
      '0xa',
    ]);

    const blockNumber = await provider.getBlockNumber();
    const block = await provider.getBlock(blockNumber);
    const minerBalanceBefore = await provider.getBalance(block.miner);

    console.log('Block number: ', blockNumber);

    const balanceBefore = await signer.getBalance();
    await snxLiquidator.liquidate(
      '0x45899a8104CDa54deaBaDDA505f0bBA68223F631',
      283,
      0,
      '5000'
    );
    const balanceAfter = await signer.getBalance();
    const minerBalanceAfter = await provider.getBalance(block.miner);

    console.log('Block number: ', await provider.getBlockNumber());

    expect(balanceAfter).to.be.gt(balanceBefore);
    console.log(
      'Profit: ',
      ethers.utils.formatEther(balanceAfter.sub(balanceBefore))
    );

    expect(minerBalanceAfter).to.be.gt(
      minerBalanceBefore.add(ethers.utils.parseEther('2'))
    );
    console.log(
      'Miner profit: ',
      ethers.utils.formatEther(minerBalanceAfter.sub(minerBalanceBefore))
    );
  });

  // it('Liquidate on susd with bribe', async () => {
  //   const blockNumber = await provider.getBlockNumber();
  //   const block = await provider.getBlock(blockNumber);
  //   const minerBalanceBefore = await provider.getBalance(block.miner);

  //   console.log('Block number: ', blockNumber);

  //   const balanceBefore = await signer.getBalance();
  //   await snxLiquidator.liquidate(
  //     '0x820B24277A86fAc14ef5150c58B1815Cf9A3Cf46',
  //     33,
  //     1,
  //     '2000'
  //   );
  //   const balanceAfter = await signer.getBalance();
  //   const minerBalanceAfter = await provider.getBalance(block.miner);

  //   console.log('Block number: ', await provider.getBlockNumber());

  //   expect(balanceAfter).to.be.gt(balanceBefore);
  //   console.log(
  //     'Profit: ',
  //     ethers.utils.formatEther(balanceAfter.sub(balanceBefore))
  //   );

  //   expect(minerBalanceAfter).to.be.gt(
  //     minerBalanceBefore.add(ethers.utils.parseEther('2'))
  //   );
  //   console.log(
  //     'Miner profit: ',
  //     ethers.utils.formatEther(minerBalanceAfter.sub(minerBalanceBefore))
  //   );
  // });
});
