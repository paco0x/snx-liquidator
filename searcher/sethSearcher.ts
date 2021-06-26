import { sethLoaners } from './loaners';
import {
  provider,
  createFlashbotsProvider,
  getBundles,
  sethCollateral,
} from './flashbotsBase';

async function main() {
  const flashbotsProvider = await createFlashbotsProvider();

  const [signedTxs, revertingTxHashes] = await getBundles(
    sethLoaners,
    flashbotsProvider
  );

  let opened = false;

  provider.on('block', async (blockNumber) => {
    console.log(`Block number: ${blockNumber}`);

    if (!opened) {
      const snxOpened = await sethCollateral.loanLiquidationOpen();
      console.log(`SETH liquidation opened: ${snxOpened}`);
      opened = snxOpened;
    }

    if (opened) {
      // const simulation = await flashbotsProvider.simulate(
      //   signedTxs,
      //   blockNumber + 1
      // );
      // // Using TypeScript discrimination
      // if ('error' in simulation) {
      //   console.log(`Simulation Error: ${simulation.error.message}`);
      // } else {
      //   console.log(`Simulation Success:`);
      // }

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
