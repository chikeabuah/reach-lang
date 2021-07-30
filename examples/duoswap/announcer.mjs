import { loadStdlib } from '@reach-sh/stdlib';
import ETHStdlib from '@reach-sh/stdlib/stdlib_sol.mjs';
import ethers from 'ethers';
import * as backend from './build/announcer.main.mjs';
import * as poolBackend from './build/index.main.mjs';
import * as ask from '@reach-sh/stdlib/ask.mjs';

export const runManager = async () => {
  const stdlib = await loadStdlib();
  const startingBalance = stdlib.parseCurrency(99999999999);

  const manager = await stdlib.newTestAccount(startingBalance);
  if (stdlib.connector == 'ETH') {
    manager.setGasLimit(5000000);
  }

  const ctcManager = manager.deploy(backend);

  const cache = {};

  const backendManager = backend.Manager(ctcManager, {
    hear: (poolAddr) => {
      console.log(`Manager created pool:`, poolAddr);
    },
    printInfo: async () => {
      const info = await ctcManager.getInfo();
      console.log(`Announcer Contract Info: ${JSON.stringify(info)}`)
    },
    getPoolInfo: async () => {
      const poolAddr = await ask.ask(`Enter new pool address:`);
      cache[poolAddr] = true;
      return poolAddr;
    },
  });

  console.log(`Listening...`);
  await Promise.all([ backendManager ]);

};

export const getTokenInfo = async (stdlib, acc, tokId) => {
  if (stdlib.connector == 'ETH') {
    const provider = await stdlib.getProvider();
    const remoteCtc = ETHStdlib["contracts"]["stdlib.sol:ReachToken"];
    const remoteABI = remoteCtc["abi"];
    const ctc = await new ethers.Contract(tokId, remoteABI, provider);
    const name = await ctc.name();
    const sym = await ctc.symbol();
    return { sym, name };
  }
}

export const runListener = async () => {
  const stdlib = await loadStdlib();
  const startingBalance = stdlib.parseCurrency(99999999999);

  const accListener = await stdlib.newTestAccount(startingBalance);
  if (stdlib.connector == 'ETH') {
    accListener.setGasLimit(5000000);
  }
  const listenerInfo = await ask.ask(`Paste Announcer Contract Info:`);

  await runListener_(stdlib, accListener, listenerInfo)();
}

export const runListener_ = (stdlib, accListener, listenerInfo) => async () => {
  const ctcListener = accListener.attach(backend, listenerInfo)

  const backendListener = backend.Listener(ctcListener, {
    hear: async (poolInfo) => {
      console.log(`\x1b[2m`, `Pool ID:`, poolInfo, '\x1b[0m');
      const ctcPool = accListener.attach(poolBackend, poolInfo);
      const tokA = await ctcPool.getViews().Tokens.aTok();
      const tokB = await ctcPool.getViews().Tokens.bTok();
      if (tokA[0] == 'None' || tokB[0] == 'None') {
        console.log(`XXX: Pool ${poolInfo} does not have token info`);
        return;
      }


      const resA = await getTokenInfo(stdlib, accListener, tokA[1]);
      const tokASym = resA.sym;
      const tokAName = resA.name;
      console.log(`\x1b[2m`, `  * TokA:`, tokASym, tokAName, '\x1b[0m');

      const resB = await getTokenInfo(stdlib, accListener, tokB[1]);
      const tokBSym = resB.sym;
      const tokBName = resB.name;
      console.log(`\x1b[2m`, `  * TokB:`, tokBSym, tokBName, '\x1b[0m');

      const info = {
        poolAddr: poolInfo,
        tokA: {
          sym: tokASym,
          name: tokAName,
          id: tokA[1]
        },
        tokB: {
          sym: tokBSym,
          name: tokBName,
          id: tokB[1]
        }
      };
      console.log(`\x1b[2m`, `  * Info: ${JSON.stringify(info)}`, '\x1b[0m')
    },
  });

  console.log(`Listening...`);
  return Promise.all([ backendListener ]);
}
