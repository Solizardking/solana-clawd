import { Fruit } from '../enums';

const segmentToFruit = (reel: number, segment: number): Fruit | undefined => {
  const reelMaps: Record<number, Fruit[]> = {
    0: [
      Fruit.abyssLobster,
      Fruit.pearlKernel,
      Fruit.pearlKernel,
      Fruit.coralTicket,
      Fruit.coralTicket,
      Fruit.pearlKernel,
      Fruit.neonClaw,
      Fruit.pearlKernel,
      Fruit.abyssLobster,
      Fruit.pearlKernel,
      Fruit.pearlKernel,
      Fruit.coralTicket,
      Fruit.coralTicket,
      Fruit.pearlKernel,
      Fruit.neonClaw,
      Fruit.pearlKernel,
    ],
    1: [
      Fruit.pearlKernel,
      Fruit.pearlKernel,
      Fruit.coralTicket,
      Fruit.neonClaw,
      Fruit.abyssLobster,
      Fruit.pearlKernel,
      Fruit.pearlKernel,
      Fruit.neonClaw,
      Fruit.pearlKernel,
      Fruit.pearlKernel,
      Fruit.coralTicket,
      Fruit.neonClaw,
      Fruit.abyssLobster,
      Fruit.pearlKernel,
      Fruit.pearlKernel,
      Fruit.neonClaw,
    ],
    2: [
      Fruit.pearlKernel,
      Fruit.pearlKernel,
      Fruit.coralTicket,
      Fruit.pearlKernel,
      Fruit.abyssLobster,
      Fruit.neonClaw,
      Fruit.pearlKernel,
      Fruit.neonClaw,
      Fruit.pearlKernel,
      Fruit.pearlKernel,
      Fruit.coralTicket,
      Fruit.pearlKernel,
      Fruit.abyssLobster,
      Fruit.neonClaw,
      Fruit.pearlKernel,
      Fruit.neonClaw,
    ],
  };

  const normalizedSegment = segment % 16;
  return reelMaps[reel]?.[normalizedSegment];
};

export default segmentToFruit;
