import { useEffect } from 'react';
import confetti from 'canvas-confetti';

interface WalletConfettiProps {
  isConnected: boolean;
  onFinish?: () => void;
}

export const WalletConfetti = ({ isConnected, onFinish }: WalletConfettiProps) => {
  useEffect(() => {
    if (isConnected) {
      // Create a colorful confetti burst
      const duration = 2 * 1000; // 2 seconds
      const animationEnd = Date.now() + duration;
      
      const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];
      
      // Use a temporary canvas for better performance
      const canvas = document.createElement('canvas');
      canvas.style.position = 'fixed';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.pointerEvents = 'none';
      canvas.style.zIndex = '9999';
      document.body.appendChild(canvas);
      
      const myConfetti = confetti.create(canvas, {
        resize: true,
        useWorker: true,
      });
      
      // Launch initial burst
      myConfetti({
        particleCount: 100,
        spread: 100,
        origin: { y: 0.6 },
        colors: colors,
      });
      
      // Create a continuous effect
      const interval = setInterval(() => {
        const timeLeft = animationEnd - Date.now();
        
        if (timeLeft <= 0) {
          // Clean up when done
          clearInterval(interval);
          document.body.removeChild(canvas);
          if (onFinish) {
            onFinish();
          }
          return;
        }
        
        // Gradually reduce intensity as animation ends
        const particleCount = Math.floor(timeLeft / duration * 50);
        
        // Launch from random positions
        myConfetti({
          particleCount,
          startVelocity: 30,
          spread: 360,
          origin: {
            x: Math.random(),
            y: Math.random() - 0.2
          },
          colors: colors,
          shapes: ['circle', 'square'],
          scalar: 1,
        });
      }, 250);
      
      // Clean up the interval on component unmount
      return () => {
        clearInterval(interval);
        if (document.body.contains(canvas)) {
          document.body.removeChild(canvas);
        }
      };
    }
  }, [isConnected, onFinish]);

  return null; // This is a behavior-only component
};

export default WalletConfetti;