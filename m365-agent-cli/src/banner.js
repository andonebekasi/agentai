import chalk from 'chalk';

export const BRAND_TITLE = 'ANDI PANGERAN M365 CLI';
export const BRAND_SUBTITLE = 'Microsoft 365 Copilot Linux Agent (m365.cloud.microsoft)';

/**
 * Returns formatted Linux Tux + Antigravity-style ASCII Art Banner for "ANDI PANGERAN M365 CLI"
 */
export function getBannerString() {
  const c1 = chalk.cyan.bold;
  const c2 = chalk.blueBright.bold;
  const c3 = chalk.magentaBright.bold;
  const tuxBody = chalk.white.bold;
  const tuxEyes = chalk.cyanBright.bold;
  const tuxBeak = chalk.yellow.bold;
  const dim = chalk.gray;

  const lines = [
    '',
    `      ${tuxBody('.---.')}        ${c1('   ___    _   ______  ____   ____  ___    _   ______________  ___    ___    _   __')}`,
    `     ${tuxBody('/     \\')}       ${c1('  /   |  / | / / __ \\/  _/  / __ \\/   |  / | / / ____/ ____/ / __ \\/   |  / | / /')}`,
    `     ${tuxEyes('\\.@_@./')}       ${c2(' / /| | /  |/ / / / // /   / /_/ / /| | /  |/ / / __/ __/   / /_/ / /| | /  |/ / ')}`,
    `     ${tuxBeak('/`\\_/`\\')}       ${c2('/ ___ |/ /|  / /_/ // /   / ____/ ___ |/ /|  / /_/ / /___  / _, _/ ___ |/ /|  /  ')}`,
    `    ${tuxBody('//  _  \\\\')}      ${c3('/_/  |_/_/ |_/_____/___/  /_/   /_/  |_/_/ |_/\\____/_____/ /_/ |_/_/  |_/_/ |_/   ')}`,
    `   ${tuxBody('| \\     )|_')}     ${chalk.white.bold('⚡ A N D I   P A N G E R A N   M 3 6 5   C L I')}  ${dim('•')}  ${chalk.green.bold('v1.0.0')}`,
    `  ${tuxBeak('/`\\_`>  <_/ \\')}    ${dim('──────────────────────────────────────────────────────────────────────────────────')}`,
    `  ${tuxBeak("\\__/'---'\\__/")}    ${chalk.cyan('🐧 Linux Copilot Agent (m365.cloud.microsoft)')} ${dim('|')} ${chalk.yellow('Ketik')} ${chalk.white.bold('/help')} ${chalk.yellow('untuk daftar perintah')}`,
    ''
  ];

  return lines.join('\n');
}

export function printBanner() {
  console.log(getBannerString());
}
