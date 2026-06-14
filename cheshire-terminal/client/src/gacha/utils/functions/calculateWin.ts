// import devLog from './devLog';

/**
 * Returns the amount of shell credits won when a capsule pull resolves.
 *
 * @param fruit0 - The prize result of reel 0
 * @param fruit0 - The prize result of reel 1
 * @param fruit0 - The prize result of reel 2
 * @returns Shell credits won
 *
 * @example
 * An example of a win
 * ```
 * // Returns 120
 * calculateWin("ABYSS_LOBSTER", "ABYSS_LOBSTER", "ABYSS_LOBSTER")
 * ```
 *
 * @example
 * An example of a loss
 * * ```
 * calculateWin("ABYSS_LOBSTER", "NEON_CLAW", "NEON_CLAW")
 * ```
 */
const calculateWin = (
  fruit0: string,
  fruit1: string,
  fruit2: string,
): number => {
  let coins = 0;

  // Check for 3 abyss lobsters
  if (
    fruit0 === 'ABYSS_LOBSTER' &&
    fruit1 === 'ABYSS_LOBSTER' &&
    fruit2 === 'ABYSS_LOBSTER'
  ) {
    coins = 120;
  }
  // Check for 2 abyss lobsters
  else if (fruit0 === 'ABYSS_LOBSTER' && fruit1 === 'ABYSS_LOBSTER') {
    coins = 80;
  }
  // Check for 3 neon claws
  else if (
    fruit0 === 'NEON_CLAW' &&
    fruit1 === 'NEON_CLAW' &&
    fruit2 === 'NEON_CLAW'
  ) {
    coins = 45;
  }
  // Check for 2 neon claws
  else if (fruit0 === 'NEON_CLAW' && fruit1 === 'NEON_CLAW') {
    coins = 24;
  }
  // Check for 3 coral tickets
  else if (
    fruit0 === 'CORAL_TICKET' &&
    fruit1 === 'CORAL_TICKET' &&
    fruit2 === 'CORAL_TICKET'
  ) {
    coins = 18;
  }
  // Check for 2 coral tickets
  else if (fruit0 === 'CORAL_TICKET' && fruit1 === 'CORAL_TICKET') {
    coins = 9;
  }
  // Check for 3 pearl kernels
  else if (
    fruit0 === 'PEARL_KERNEL' &&
    fruit1 === 'PEARL_KERNEL' &&
    fruit2 === 'PEARL_KERNEL'
  ) {
    coins = 12;
  }

  // if (coins > 0) {
  // devLog(`Shell credits won: ${coins}`);
  // }

  // If no shell credits were won 0 is returned
  return coins;
};

export default calculateWin;
