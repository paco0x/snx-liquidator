# snx-liquidator

This is a contract & bot repo for a one-shot MEV: [snx-trial-loans](https://sips.synthetix.io/sips/sip-142/)

It uses flashbots & block-native mempool listener to liquidate loans in SNX.

Though I failed the competition, but I think it might be helpful for others who want to get into the field of MEV battle ground.

PS: The reason I did not win:
- miner bribe too low, others give more miner bribe to the flashbots miner
- too many TXs in the bundle, miners would just ignore those bundles with too many txs coz it might take too much time for them to simulate the Txs
