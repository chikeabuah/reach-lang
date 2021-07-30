import { loadStdlib } from '@reach-sh/stdlib';
import launchToken from '@reach-sh/stdlib/launchToken.mjs';
import * as ask from '@reach-sh/stdlib/ask.mjs';

const getTokenInfo = async () => {
  const tokSym = await ask.ask(`Token symbol:`);
  const tokName = await ask.ask(`Token name:`);
  return [ tokSym, tokName ];
}

export const runTokens = async () => {
  const stdlib = await loadStdlib();
  console.log(`Creating first token...`);
  const [symA, nameA] = await getTokenInfo();

  console.log(`Creating second token...`);
  const [symB, nameB] = await getTokenInfo();

  const tokA = await launchToken(nameA, symA);
  const tokB = await launchToken(nameB, symB);
  console.log(`Token Info:`, JSON.stringify({
    tokA: { id: tokA.id, sym: symA, name: nameA },
    tokB: { id: tokB.id , sym: symB, name: nameB }
  }));

  while (true) {
    console.log(`Ready To Mint 1000 ${symA} & 1000 ${symB}`);
    const addr = await ask.ask(`Address: `);
    const acc = { networkAccount: { address: addr } };
    tokA.mint(acc, stdlib.parseCurrency(1000));
    tokB.mint(acc, stdlib.parseCurrency(1000));
  }
}
