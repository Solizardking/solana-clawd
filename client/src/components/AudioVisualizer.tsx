import { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  isListening: boolean;
}

export function AudioVisualizer({ isListening }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array>();

  useEffect(() => {
    if (!isListening) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set up audio context and analyzer if not already done
    if (!analyzerRef.current) {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
          const source = audioContext.createMediaStreamSource(stream);
          const analyzer = audioContext.createAnalyser();
          analyzer.fftSize = 256;
          source.connect(analyzer);
          analyzerRef.current = analyzer;
          dataArrayRef.current = new Uint8Array(analyzer.frequencyBinCount);
        })
        .catch(err => console.error('Error accessing microphone:', err));
    }

    function draw() {
      if (!ctx || !canvas || !analyzerRef.current || !dataArrayRef.current) return;

      const analyzer = analyzerRef.current;
      const dataArray = dataArrayRef.current;
      analyzer.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Create a circular visualizer
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const radius = Math.min(centerX, centerY) - 10;
      
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.2)'; // Purple glow
      ctx.lineWidth = 2;
      ctx.stroke();

      const barCount = 32;
      const barWidth = (2 * Math.PI) / barCount;

      for (let i = 0; i < barCount; i++) {
        const value = dataArray[i] || 0;
        const normalizedValue = value / 255;
        const barHeight = radius * 0.3 * normalizedValue;
        
        const angle = i * barWidth;
        const x1 = centerX + (radius - barHeight) * Math.cos(angle);
        const y1 = centerY + (radius - barHeight) * Math.sin(angle);
        const x2 = centerX + radius * Math.cos(angle);
        const y2 = centerY + radius * Math.sin(angle);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = `rgba(168, 85, 247, ${0.5 + normalizedValue * 0.5})`; // Purple with varying opacity
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      animationFrameRef.current = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isListening]);

  return (
    <canvas 
      ref={canvasRef} 
      width={120} 
      height={120} 
      className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 transition-opacity duration-300 ${
        isListening ? 'opacity-100' : 'opacity-0'
      }`}
    />
  );
}
