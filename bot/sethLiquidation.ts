import { FlashbotsBundleProvider } from '@flashbots/ethers-provider-bundle';

import { sethLoaners } from './loaners';
import {
  provider,
  authSigner,
  getBundles,
  sethCollateral,
} from './flashbotBase';

async function main() {
  const flashbotsProvider = await FlashbotsBundleProvider.create(
    provider,
    authSigner
  );

  const [signedTxs, revertingTxHashes] = await getBundles(
    '2000',
    sethLoaners,
    flashbotsProvider
  );

  // const blockNumber = await provider.getBlockNumber();
  // const simulation = await flashbotsProvider.simulate(
  //   signedTxs,
  //   blockNumber + 1
  // );
  // // Using TypeScript discrimination
  // if ('error' in simulation) {
  //   console.log(`Simulation Error: ${simulation.error.message}`);
  //   process.exit(1);
  // } else {
  //   console.log(`Simulation Success: ${JSON.stringify(simulation, null, 2)}`);
  // }

  provider.on('block', async (blockNumber) => {
    console.log(`Block number: ${blockNumber}`);

    const opened = await sethCollateral.loanLiquidationOpen();
    console.log(`SETH collateral opened: ${opened}`);

    if (opened) {
      const bundleSubmission = await flashbotsProvider.sendRawBundle(
        signedTxs,
        blockNumber + 1,
        { revertingTxHashes }
      );
      console.log(`bundle submitted, waiting`);
      if ('error' in bundleSubmission) {
        throw new Error(bundleSubmission.error.message);
      }
      const waitResponse = await bundleSubmission.wait();

      console.log(`Response: ${waitResponse}`);
      if (waitResponse === 0) {
        console.log('Bundle handled successfully');
        process.exit(0);
      } else {
      }
    }
  });
}

main()
  .then()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
