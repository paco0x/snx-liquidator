import { HardhatUserConfig } from 'hardhat/config';
import '@typechain/hardhat';
import '@nomiclabs/hardhat-waffle';

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
  },
  mocha: {
    timeout: 300000,
  },
};

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = config;
