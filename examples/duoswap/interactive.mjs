import { loadStdlib } from '@reach-sh/stdlib';
import * as backend from './build/index.main.mjs';
import * as ask from '@reach-sh/stdlib/ask.mjs';
import { runManager, runListener, runListener_ } from './announcer.mjs';
import { runTokens } from './tokens.mjs';
import * as announcerBackend from './build/announcer.main.mjs';

// Track who withdrew/deposited
const withdrew  = {};
const deposited = {};
const traded = {};

const isAOrB = (a, b) => (ans) => {
  if (ans.toLowerCase() == a.toLowerCase()) {
    return a;
  }
  if (ans.toLowerCase() == b.toLowerCase()) {
    return b;
  }
  throw Error('Only `${a}` or `${b}` are valid answers.');
}

const fmt = (stdlib, x) => stdlib.formatCurrency(x, 4);

const getBalance = async (stdlib, tokenX, who) => {
  const amt = await stdlib.balanceOf(who, tokenX.id);
  return `${fmt(stdlib, amt)} ${tokenX.sym}`; };

const getBalances = async (stdlib, who, tokA, tokB) =>
  `${await getBalance(stdlib, tokA, who)} & ${await getBalance(stdlib, tokB, who)}`;

const runDuoSwapAdmin = async () => {

  const stdlib = await loadStdlib();
  const startingBalance = stdlib.parseCurrency(9999);

  // Create & Fund Admin
  const accAdmin = await stdlib.newTestAccount(startingBalance)
  await accAdmin.setDebugLabel('Admin');
  await ask.ask(`Fund: ${accAdmin.getAddress()}`);
  const { tokA, tokB } = await ask.ask(`Enter token info:`, JSON.parse);

  // Deploy contract
  const ctcAdmin = accAdmin.deploy(backend);
  const ctcInfo = ctcAdmin.getInfo();
  const poolAddr = (await ctcInfo).toString();
  await ask.ask(`Enter Pool Address Into Announcer Manager: ${poolAddr}`);
  const connectionInfo = { poolAddr, tokA, tokB };
  console.log(`Connection Info: `, JSON.stringify(connectionInfo));

  // Admin backend
  const adminBackend = backend.Admin(ctcAdmin, {
    tokA: tokA.id,
    tokB: tokB.id,
    shouldClosePool: async (_) => {
      const answer = await ask.ask(`Do you want to close the pool? (y/n)`, ask.yesno);
      return { when: answer, msg: null };
    },
  });

  await Promise.all([ adminBackend ]);
};

const runDuoSwapLP = async () => {

  const stdlib = await loadStdlib();
  const startingBalance = stdlib.parseCurrency(9999);

  // Create & Fund Admin
  const accProvider = await stdlib.newTestAccount(startingBalance)
  await accProvider.setDebugLabel('Provider');
  if (stdlib.connector == 'ETH') {
    accProvider.setGasLimit(5000000);
  }
  const _ = await ask.ask(`Fund: ${accProvider.getAddress()}`);

  // Connect to announcer and list pools:
  const listenerInfo = await ask.ask(`Paste Announcer Contract Info:`);
  console.log(`Searching for pools...`)
  try {
    const listener = await runListener_(stdlib, accProvider, listenerInfo);
    await Promise.all([ (new Promise(async (resolve, reject) => {
      const _ = await ask.ask(`Click \x1b[1m\`Enter\`\x1b[0m when done searching for pools.`);
      reject();
    })), listener() ]);
  } catch (e) { }

  const { tokA, tokB, poolAddr } = await ask.ask(`Enter connection info:`, JSON.parse);
  const ctcProvider = accProvider.attach(backend, poolAddr);

  const backendProvider = backend.Provider(ctcProvider, {
    log: (s, x) => { console.log(s.padStart(30), x.toString()); },
    withdrawDone: (isMe, amtOuts) => {
      if (isMe) {
        withdrew[accProvider] = true;
        console.log("\x1b[31m", `I withdrew ${amtOuts[0]} ${tokA.sym} & ${amtOuts[1]} ${tokB.sym}`,'\x1b[0m');
      }
    },
    withdrawMaybe: async ([ alive, market ]) => {
      const wantsToWithdraw = await ask.ask(`Do you want to withdraw liquidity? (y/n)`, ask.yesno);
      if (wantsToWithdraw) {
        const amt = await ask.ask(`How much liquidity do you want to withdraw?`, parseInt);
        return { when: true, msg: { liquidity: amt } };
      } else {
        return { when: false, msg: { liquidity: 0 }};
      }
    },
    depositDone: (isMe, amtA, amtB, poolTokens) => {
      if (isMe) {
        deposited[accProvider] = poolTokens;
        console.log("\x1b[34m", `I received ${poolTokens} pool tokens for my deposit of ${amtA} ${tokA.sym} & ${amtB} ${tokB.sym}`,'\x1b[0m');
      }
    },
    depositMaybe: async ([ isAlive, market ]) => {
      const wantsToDeposit = await ask.ask(`Do you want to deposit? (y/n)`, ask.yesno);
      if (wantsToDeposit) {
        const myBals = await getBalances(stdlib, accProvider, tokA, tokB);
        const amtA = await ask.ask(`How much ${tokA.sym} do you want to deposit? (Bal: ${myBals})`, parseInt);
        const amtB = await ask.ask(`How much ${tokB.sym} do you want to deposit? (Bal: ${myBals})`, parseInt);
        const deposit = { amtA: stdlib.parseCurrency(amtA), amtB: stdlib.parseCurrency(amtB) }
        return {
          when: true, msg: deposit
        };
      } else {
        return { when: false, msg: { amtA: 0, amtB: 0 }};
      }
    },
  });

  await Promise.all([ backendProvider ]);
}

const runDuoSwapTrader = async () => {

  const stdlib = await loadStdlib();
  const startingBalance = stdlib.parseCurrency(9999);

  // Create & Fund Admin
  const accTrader = await stdlib.newTestAccount(startingBalance)
  await accTrader.setDebugLabel('Trader');
  if (stdlib.connector == 'ETH') {
    accTrader.setGasLimit(5000000);
  }
  // Attach to tokens that Admin launched
  const _ = await ask.ask(`Fund: ${accTrader.getAddress()}`);

  // Connect to announcer and list pools:
  const listenerInfo = await ask.ask(`Paste Announcer Contract Info:`);
  console.log(`Searching for pools...`)
  try {
    const listener = await runListener_(stdlib, accTrader, listenerInfo);
    await Promise.all([ (new Promise(async (resolve, reject) => {
      const _ = await ask.ask(`Click \x1b[1m\`Enter\`\x1b[0m when done searching for pools.`);
      reject();
    })), listener() ]);
  } catch (e) { }

  const { tokA, tokB, poolAddr } = await ask.ask(`Enter connection info:`, JSON.parse);
  const ctcTrader = accTrader.attach(backend, poolAddr);

  const backendTrader = backend.Trader(ctcTrader, {
    log: (s, x) => { console.log(s.padStart(30), x.toString()); },
    tradeDone: (isMe, [amtIn, amtInTok, amtOut, amtOutTok]) => {
      const tokIn  = amtInTok == tokA.id ? tokA : tokB;
      const tokOut = amtOutTok == tokA.id ? tokA : tokB;
      if (isMe) {
        traded[accTrader] = true;
        console.log("\x1b[32m", `I traded ${amtIn} ${tokIn.sym} for ${amtOut} ${tokOut.sym}`,'\x1b[0m');
      }
    },
    tradeMaybe: async ([ alive, market ]) => {
      const wantsToTrade = await ask.ask(`Do you want to trade? (y/n)`, ask.yesno);
      if (wantsToTrade) {
        const options = [tokA.sym, tokB.sym].join('\n');
        const tokType = await ask.ask(`What token do you want to input?\n${options}`, isAOrB(tokA.sym, tokB.sym));
        const myBal = await getBalance(stdlib, tokType === tokA.sym ? tokA : tokB, accTrader);
        const amt = await ask.ask(`How much do you want to trade? (You have ${myBal})`);
        const trade =
          (tokType == tokA.sym)
            ? ({ amtA: stdlib.parseCurrency(amt), amtB: 0, amtInTok: tokA.id })
            : ({ amtA: 0, amtB: stdlib.parseCurrency(amt), amtInTok: tokB.id });
        return { when: true, msg: trade };
      } else {
        return { when: false, msg: { amtA: 0, amtB: 0, amtInTok: tokA.id }};
      }
    },
  });

  await Promise.all([ backendTrader ]);
}

const options = [
  '1: DuoSwap Admin',
  '2: DuoSwap Liquidity Provider',
  '3: DuoSwap Trader',
  '4: DuoSwap Announcer',
  '5: DuoSwap Listener',
  '6: DuoSwap Token Funder',
].join('\n');

export const runInteractive = async () => {
  const answer = await ask.ask(`Who are you?\n${options}`, parseInt);

  switch (answer) {
    case 1: {
      // Creates a pool and sends info to announcer/cache
      await runDuoSwapAdmin();
      return;
    }
    case 2: {
      await runDuoSwapLP();
      return;
    }
    case 3: {
      await runDuoSwapTrader();
      return;
    }
    case 4: {
      await runManager();
      return;
    }
    case 5: {
      await runListener();
      return;
    }
    case 6: {
      await runTokens();
      return;
    }
  }
}
