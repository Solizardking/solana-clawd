import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle, AlertTriangle } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import confetti from "canvas-confetti";

interface TokenLaunchProgressProps {
  stage: 'preparing' | 'uploading' | 'minting' | 'confirming' | 'complete' | 'error';
  error?: string;
}

const STAGE_PERCENTAGES = {
  preparing: 10,
  uploading: 30,
  minting: 60,
  confirming: 90,
  complete: 100,
  error: 0
};

const STAGE_MESSAGES = {
  preparing: "Preparing token metadata...",
  uploading: "Uploading token image...",
  minting: "Creating token on Solana...",
  confirming: "Waiting for blockchain confirmation...",
  complete: "Token launch complete!",
  error: "Launch failed"
};

const ESTIMATED_TIMES = {
  preparing: 2,
  uploading: 5,
  minting: 8,
  confirming: 15,
  complete: 0,
  error: 0
};

// Animation durations
const PROGRESS_ANIMATION_DURATION = 800; // ms
const CONFETTI_DURATION = 5000; // ms

export function TokenLaunchProgress({ stage, error }: TokenLaunchProgressProps) {
  const [timeRemaining, setTimeRemaining] = useState<number>(
    ESTIMATED_TIMES[stage] || 0
  );
  const [animatedProgress, setAnimatedProgress] = useState<number>(0);
  const [showConfetti, setShowConfetti] = useState<boolean>(false);
  const confettiCanvasRef = useRef<HTMLCanvasElement>(null);
  const prevStageRef = useRef<string | null>(null);

  // Handle animated progress bar
  useEffect(() => {
    const targetValue = STAGE_PERCENTAGES[stage];
    const startValue = animatedProgress;
    const diff = targetValue - startValue;
    const startTime = performance.now();
    
    const animateProgress = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / PROGRESS_ANIMATION_DURATION, 1);
      const easedProgress = easeInOutCubic(progress);
      const newValue = startValue + diff * easedProgress;
      
      setAnimatedProgress(newValue);
      
      if (progress < 1) {
        requestAnimationFrame(animateProgress);
      }
    };
    
    requestAnimationFrame(animateProgress);
  }, [stage]);

  // Timer countdown effect
  useEffect(() => {
    if (stage === 'complete' || stage === 'error') return;

    const timer = setInterval(() => {
      setTimeRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [stage]);

  // Reset timer when stage changes
  useEffect(() => {
    setTimeRemaining(ESTIMATED_TIMES[stage] || 0);
  }, [stage]);

  // Trigger confetti when completing
  useEffect(() => {
    if (stage === 'complete' && prevStageRef.current !== 'complete') {
      setShowConfetti(true);
      fireConfetti();
      
      const timer = setTimeout(() => {
        setShowConfetti(false);
      }, CONFETTI_DURATION);
      
      return () => clearTimeout(timer);
    }
    prevStageRef.current = stage;
  }, [stage]);

  // Confetti effect
  const fireConfetti = () => {
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '9999';
    
    const myConfetti = confetti.create(canvas, {
      resize: true,
      useWorker: true,
    });
    
    // First burst - centered
    myConfetti({
      particleCount: 100,
      spread: 160,
      origin: { y: 0.6 },
      colors: ['#8B5CF6', '#6366F1', '#EC4899', '#14B8A6'],
      shapes: ['circle', 'square'],
    });
    
    // Second burst - from sides
    setTimeout(() => {
      myConfetti({
        particleCount: 50,
        angle: 60,
        spread: 80,
        origin: { x: 0 },
        colors: ['#8B5CF6', '#6366F1', '#3B82F6', '#10B981'],
      });
      
      myConfetti({
        particleCount: 50,
        angle: 120,
        spread: 80,
        origin: { x: 1 },
        colors: ['#8B5CF6', '#6366F1', '#EC4899', '#14B8A6'],
      });
    }, 750);
    
    setTimeout(() => {
      document.body.removeChild(canvas);
    }, CONFETTI_DURATION);
  };

  // Easing function for smoother animations
  const easeInOutCubic = (x: number): number => {
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  };

  return (
    <Card className="w-full max-w-lg mx-auto bg-black/40 border-purple-500/30 overflow-hidden">
      <CardHeader className={`
        ${stage === 'complete' ? 'bg-gradient-to-r from-purple-900/50 to-blue-900/50' : ''}
        ${stage === 'error' ? 'bg-gradient-to-r from-red-900/50 to-orange-900/50' : ''}
        transition-all duration-500 ease-in-out
      `}>
        <CardTitle className={`
          text-xl font-bold text-center 
          ${stage === 'complete' 
            ? 'bg-gradient-to-r from-purple-300 to-blue-300 bg-clip-text text-transparent animate-pulse' 
            : 'bg-gradient-to-r from-purple-400 to-blue-500 bg-clip-text text-transparent'}
        `}>
          Token Launch Progress
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 relative">
        <div className="flex items-center space-x-2">
          {stage === 'complete' ? (
            <CheckCircle className="h-5 w-5 text-green-400" />
          ) : stage === 'error' ? (
            <AlertTriangle className="h-5 w-5 text-red-400" />
          ) : (
            <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
          )}
          <span className={`
            ${stage === 'complete' ? 'text-green-300 font-semibold' : ''}
            ${stage === 'error' ? 'text-red-300 font-semibold' : 'text-purple-300'}
          `}>
            {STAGE_MESSAGES[stage]}
          </span>
        </div>

        <div className="relative h-2">
          <Progress 
            value={animatedProgress} 
            className={`
              h-2 
              ${stage === 'error' ? 'bg-red-950' : 'bg-purple-950'}
              ${stage === 'complete' ? 'bg-opacity-70' : ''}
              transition-all duration-300
            `}
          />
          
          {stage === 'complete' && (
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500 via-blue-500 to-purple-500 opacity-70 animate-pulse"></div>
          )}
        </div>

        {stage !== 'complete' && stage !== 'error' && timeRemaining > 0 && (
          <p className="text-sm text-purple-300/60 text-center">
            Estimated time remaining: {timeRemaining} seconds
          </p>
        )}

        {stage === 'complete' && (
          <p className="text-sm text-green-300/80 text-center font-medium animate-fadeIn">
            Your token is now live on the Solana blockchain! 🚀
          </p>
        )}

        {error && (
          <p className="text-sm text-red-400 text-center">
            Error: {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
