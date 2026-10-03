module.exports = async function start(p, SP) {
  const click = async sel => { await p.waitForSelector(sel, { state: 'attached', timeout: 30000 }); await p.evaluate(s => document.querySelector(s).click(), sel); };
  if (await p.waitForSelector('[data-action=firstInstallSkip]', { state: 'attached', timeout: 20000 }).catch(() => null)) await click('[data-action=firstInstallSkip]');
  await click('[data-action=firstModePick][data-v="0"]');
  await click('[data-action=starterList]');
  await p.waitForTimeout(1500);
  if (SP) await p.screenshot({ path: SP + '/start-1.png' });
  await click('[data-action=starterPick]');
  await p.waitForSelector('#renameInput', { timeout: 30000 });
  await p.fill('#renameInput', 'レオ');
  if (SP) await p.screenshot({ path: SP + '/start-2.png' });
  await click('#renameForm button');
  await click('[data-action=starterPick]');
  await p.waitForSelector('#renameInput', { timeout: 30000 });
  await p.fill('#renameInput', 'もち');
  await click('#renameForm button');
  await p.waitForTimeout(800);
};
