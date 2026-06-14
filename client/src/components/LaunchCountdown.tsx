import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface LaunchCountdownProps {
  targetDate: Date;
  onComplete?: () => void;
}

export function LaunchCountdown({ targetDate, onComplete }: LaunchCountdownProps) {
  const [timeLeft, setTimeLeft] = useState({
    hours: 24,
    minutes: 0,
    seconds: 0
  });
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const distance = targetDate.getTime() - now;
      
      if (distance <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0 });
        onComplete?.();
        return;
      }

      const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);

      // Calculate progress (24 hours = 100%)
      const totalSeconds = 24 * 60 * 60;
      const secondsLeft = hours * 3600 + minutes * 60 + seconds;
      const progressPercent = ((totalSeconds - secondsLeft) / totalSeconds) * 100;

      setTimeLeft({ hours, minutes, seconds });
      setProgress(progressPercent);
    };

    const timer = setInterval(calculateTimeLeft, 1000);
    return () => clearInterval(timer);
  }, [targetDate, onComplete]);

  return (
    <Card className="w-full max-w-lg mx-auto bg-black/40 border-purple-500/30">
      <CardHeader>
        <CardTitle className="text-2xl font-bold text-center bg-gradient-to-r from-purple-400 to-blue-500 bg-clip-text text-transparent">
          Token Launch Countdown
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="bg-black/60 p-4 rounded-lg border border-purple-500/20">
            <div className="text-3xl font-mono text-purple-400">{timeLeft.hours.toString().padStart(2, '0')}</div>
            <div className="text-sm text-purple-300/60">Hours</div>
          </div>
          <div className="bg-black/60 p-4 rounded-lg border border-purple-500/20">
            <div className="text-3xl font-mono text-purple-400">{timeLeft.minutes.toString().padStart(2, '0')}</div>
            <div className="text-sm text-purple-300/60">Minutes</div>
          </div>
          <div className="bg-black/60 p-4 rounded-lg border border-purple-500/20">
            <div className="text-3xl font-mono text-purple-400">{timeLeft.seconds.toString().padStart(2, '0')}</div>
            <div className="text-sm text-purple-300/60">Seconds</div>
          </div>
        </div>

        <Progress value={progress} className="h-2 bg-purple-950" />
        
        <p className="text-center text-sm text-purple-300/60">
          {progress < 100 
            ? "Token launch is locked until countdown completes" 
            : "Token launch is now available!"}
        </p>
      </CardContent>
    </Card>
  );
}
