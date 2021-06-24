import { BigNumber, Contract } from 'ethers';
import { susdCollateral, sethCollateral } from './flashbotBase';
import { susdLoaners, sethLoaners } from './loaners';

async function main() {
  console.log('Check susd loaners');
  await checkLoans(susdLoaners, susdCollateral);
  console.log('Check seth loaners');
  await checkLoans(sethLoaners, sethCollateral);
}

async function checkLoans(loaners: Array<any>, contract: Contract) {
  for (const loaner of loaners) {
    const [, , , , timeClosed] = await contract.getLoan(
      loaner.account,
      loaner.loanID
    );
    console.log(
      `account: ${loaner.account}, closed: ${(timeClosed as BigNumber).eq('0')}`
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
