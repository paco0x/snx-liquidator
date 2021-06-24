import { HardhatUserConfig } from 'hardhat/config';
import '@typechain/hardhat';
import '@nomiclabs/hardhat-waffle';

import operator from './.secret';

const config: HardhatUserConfig = {
  solidity: { version: '0.8.4' },
  networks: {
    hardhat: {
      // loggingEnabled: true,
      forking: {
        url: 'https://eth-mainnet.alchemyapi.io/v2/iAHwO4-koDDdXeemLhT-4i8jsx8phFnb',
        enabled: true,
      },
    },
    mainnet: {
      url: 'https://mainnet.infura.io/v3/3a57292f72e4472b8ac896816a27d51f',
      accounts: [operator.private],
    },
    rinkeby: {
      url: 'https://rinkeby.infura.io/v3/b042a80255fa41e5a2f22f53e3190b44',
      accounts: [operator.private],
    },
  },
  mocha: {
    timeout: 300000,
  },
};

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = config;
