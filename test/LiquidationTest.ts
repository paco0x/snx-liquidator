import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, Contract, Wallet } from 'ethers';
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
  let chi: Contract;
  let signer: SignerWithAddress;
  const provider = waffle.provider;

  const loanABI = [
    'function loanLiquidationOpen() external view returns(bool)',
  ];
  const susdLoanAddr = '0xfED77055B40d63DCf17ab250FFD6948FBFF57B82';
  const sethLoanAddr = '0x7133afF303539b0A4F60Ab9bd9656598BF49E272';

  const chiABI = [
    'function balanceOf(address account) external view returns (uint256)',
  ];
  const chiAddr = '0x0000000000004946c0e9F43F4Dee607b0eF1fA1c';

  before(async () => {
    [signer] = await ethers.getSigners();

    chi = new ethers.Contract(chiAddr, chiABI, provider);

    const SnxLiquidatorFactory = await ethers.getContractFactory(
      'SnxLiquidator'
    );
    snxLiquidator = (await SnxLiquidatorFactory.deploy()) as SnxLiquidator;
    const tx = await snxLiquidator.mintCHI('200');
    const receipt = await tx.wait(1);
    console.log('Minting CHI gas used: ', receipt.gasUsed.toString());

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
    expect(liquidationOpened).eq(true, 'SUSD liquidation not opened');

    liquidationOpened = await sethLoaner.loanLiquidationOpen();
    expect(liquidationOpened).eq(true, 'SETH liquidation not opened');
  });

  it('Owner is set correctly', async () => {
    const owner = await snxLiquidator.owner();
    expect(owner).eq(signer.address);
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

    const balanceBefore = await signer.getBalance();
    const tx = await snxLiquidator.liquidate(
      '0x45899a8104CDa54deaBaDDA505f0bBA68223F631',
      283,
      0,
      '2000',
      { gasPrice: '0' }
    );
    const gasUsed = (await tx.wait(1)).gasUsed;
    console.log(`Gas used: ${gasUsed}`);

    const balanceAfter = await signer.getBalance();
    const minerBalanceAfter = await provider.getBalance(block.miner);

    console.log('Block number: ', await provider.getBlockNumber());

    expect(balanceAfter).gt(balanceBefore);
    console.log(
      'Profit: ',
      ethers.utils.formatEther(balanceAfter.sub(balanceBefore))
    );

    expect(minerBalanceAfter).gt(
      minerBalanceBefore.add(ethers.utils.parseEther('2'))
    );
    const minerProfit = minerBalanceAfter
      .sub(minerBalanceBefore)
      .sub(ethers.utils.parseEther('2'));
    console.log('Miner profit: ', ethers.utils.formatEther(minerProfit));
    const avgGasPrice = minerProfit.div(gasUsed);
    console.log(
      'Avg gas price in gwei: ',
      ethers.utils.formatUnits(avgGasPrice, 'gwei')
    );

    // withdraw susd
    const withdrawTx = await snxLiquidator.withdraw(
      '0x57Ab1ec28D129707052df4dF418D58a2D46d5f51'
    );
    const receipt = await withdrawTx.wait(1);
    expect(receipt.status).eq(1);
  });

  it('Liquidate on seth with bribe', async () => {
    const blockNumber = await provider.getBlockNumber();
    const block = await provider.getBlock(blockNumber);
    const minerBalanceBefore = await provider.getBalance(block.miner);

    console.log('Block number: ', blockNumber);

    const balanceBefore = await signer.getBalance();
    const tx = await snxLiquidator.liquidate(
      '0x820B24277A86fAc14ef5150c58B1815Cf9A3Cf46',
      33,
      1,
      '1500',
      { gasPrice: '0' }
    );
    const gasUsed = (await tx.wait(1)).gasUsed;
    console.log(`Gas used: ${gasUsed}`);

    const balanceAfter = await signer.getBalance();
    const minerBalanceAfter = await provider.getBalance(block.miner);

    console.log('Block number: ', await provider.getBlockNumber());

    expect(balanceAfter).gt(balanceBefore);
    console.log(
      'Profit: ',
      ethers.utils.formatEther(balanceAfter.sub(balanceBefore))
    );

    expect(minerBalanceAfter).gt(
      minerBalanceBefore.add(ethers.utils.parseEther('2'))
    );
    const minerProfit = minerBalanceAfter
      .sub(minerBalanceBefore)
      .sub(ethers.utils.parseEther('2'));
    console.log('Miner profit: ', ethers.utils.formatEther(minerProfit));
    const avgGasPrice = minerProfit.div(gasUsed);
    console.log(
      'Avg gas price in gwei: ',
      ethers.utils.formatUnits(avgGasPrice, 'gwei')
    );
  });

  it('Can withdraw tokens', async () => {
    await snxLiquidator.withdraw(chiAddr);

    const balance = await chi.balanceOf(signer.address);
    console.log('Withdraw CHI: ', balance.toString());

    expect(balance).gt('0');
  });
});
