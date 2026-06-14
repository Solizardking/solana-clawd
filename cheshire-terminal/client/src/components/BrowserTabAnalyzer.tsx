import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Camera, Eye, AlertCircle, CheckCircle, Info, Download, MonitorSmartphone, Layout, BarChart3, Percent, Search } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import AnimatedGradientText from './AnimatedGradientText';
import html2canvas from 'html2canvas';

interface AnalysisResult {
  text: string;
  timestamp: string;
  type: 'chart' | 'text' | 'browser' | 'general';
}

type CaptureMode = 'current-tab' | 'full-screen' | 'selected-area';

export default function BrowserTabAnalyzer() {
  const [apiStatus, setApiStatus] = useState<'loading' | 'configured' | 'error'>('loading');
  const [statusMessage, setStatusMessage] = useState('Checking Grok API status...');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('capture');
  const [captureMode, setCaptureMode] = useState<CaptureMode>('current-tab');
  const [query, setQuery] = useState<string>('Analyze this screenshot thoroughly, focusing on any financial or blockchain data, charts, metrics, or patterns visible. Explain key insights and their significance.');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [streamingResponse, setStreamingResponse] = useState<string>('');
  const { toast } = useToast();
  const screenshotRef = useRef<HTMLDivElement>(null);
  const selectedAreaRef = useRef<HTMLDivElement>(null);
  const analysisContainerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const checkApiStatus = async () => {
      try {
        // First try the simple ping endpoint that doesn't require API validation
        const pingResponse = await fetch('/api/xai/ping');
        
        if (!pingResponse.ok) {
          console.error('API route not accessible');
          setApiStatus('error');
          setStatusMessage('API routes are not accessible. Server might be down.');
          return;
        }
        
        // Now check the actual API status
        try {
          const response = await fetch('/api/xai/status');
          const data = await response.json();
          
          if (response.ok && data.status === 'success' && data.configured) {
            setApiStatus('configured');
            setStatusMessage('Grok API is properly configured and ready to use');
          } else {
            console.error('API configuration error:', data.message);
            setApiStatus('error');
            setStatusMessage(data.message || 'Grok API is not properly configured');
            
            // If we fail API config but routes are accessible, test the non-API endpoint
            try {
              const testResponse = await fetch('/api/xai/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: 'Test message' })
              });
              
              if (testResponse.ok) {
                console.log('Test endpoint working, routes are accessible but API is not configured');
              }
            } catch (testError) {
              console.error('Test endpoint also failed:', testError);
            }
          }
        } catch (statusError) {
          console.error('Error checking API status:', statusError);
          setApiStatus('error');
          setStatusMessage('Failed to check Grok API status. Server routes are accessible but status check failed.');
        }
      } catch (pingError) {
        console.error('Ping endpoint error:', pingError);
        setApiStatus('error');
        setStatusMessage('Cannot connect to server API routes. Network or server issue.');
      }
    };
    
    checkApiStatus();
  }, []);

  // Request full-screen access
  const requestFullScreen = async (): Promise<boolean> => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error requesting full screen:', error);
      return false;
    }
  };

  // Exit full screen if active
  const exitFullScreen = async () => {
    if (document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen();
    }
  };

  // Use Screen Capture API to capture a specific window or display
  const captureDisplayMedia = async (): Promise<string | null> => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        toast({
          title: "Not Supported",
          description: "Screen capture is not supported in your browser.",
          variant: "destructive",
        });
        return null;
      }
      
      // Prompt user to select a screen or window to share
      const mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      
      // Create a video element to display the stream
      const video = document.createElement('video');
      video.srcObject = mediaStream;
      video.autoplay = true;
      
      // Wait for the video to load metadata
      await new Promise<void>((resolve) => {
        video.onloadedmetadata = () => resolve();
      });
      
      // Play the video (needed for some browsers)
      await video.play();
      
      // Create a canvas element to capture the video
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Draw the video onto the canvas
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Convert canvas to data URL
      const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9);
      
      // Stop all tracks in the stream to end screen sharing
      mediaStream.getTracks().forEach(track => track.stop());
      
      return imageDataUrl;
    } catch (error) {
      console.error('Error capturing screen:', error);
      if (error instanceof Error && error.name === 'NotAllowedError') {
        toast({
          title: "Permission Denied",
          description: "You cancelled the screen sharing request.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Capture Failed",
          description: "Failed to capture screen. Please try again.",
          variant: "destructive",
        });
      }
      return null;
    }
  };

  const captureScreen = async () => {
    setIsCapturing(true);
    
    try {
      // Hide the screenshot area itself from the screenshot
      if (screenshotRef.current) {
        screenshotRef.current.style.display = 'none';
      }
      
      let targetElement: HTMLElement | null = null;
      let restoreFullScreen = false;
      
      // Variable to store the image data
      let imageDataUrl: string | null = null;
      
      // Handle different capture modes
      switch (captureMode) {
        case 'full-screen':
          // Request full screen for better capture
          restoreFullScreen = await requestFullScreen();
          // Give browser a moment to adjust to full screen
          await new Promise(resolve => setTimeout(resolve, 500));
          targetElement = document.documentElement;
          
          // Use html2canvas to capture the content
          const fullScreenCanvas = await html2canvas(targetElement, {
            logging: false,
            useCORS: true,
            allowTaint: true,
            backgroundColor: null,
            scale: window.devicePixelRatio,
          });
          
          imageDataUrl = fullScreenCanvas.toDataURL('image/jpeg', 0.9);
          break;
          
        case 'selected-area':
          // Use the Screen Capture API to let user select a window or screen
          imageDataUrl = await captureDisplayMedia();
          
          // If screen capture failed or was cancelled, stop the capture process
          if (!imageDataUrl) {
            throw new Error('Screen capture was cancelled or failed');
          }
          break;
          
        case 'current-tab':
        default:
          targetElement = document.body;
          
          // Use html2canvas to capture the content
          const currentTabCanvas = await html2canvas(targetElement, {
            logging: false,
            useCORS: true,
            allowTaint: true,
            backgroundColor: null,
            scale: window.devicePixelRatio,
          });
          
          imageDataUrl = currentTabCanvas.toDataURL('image/jpeg', 0.9);
          break;
      }
      
      if (!imageDataUrl) {
        throw new Error('Failed to capture screenshot');
      }
      
      // If we went to full screen, exit it
      if (restoreFullScreen) {
        await exitFullScreen();
      }
      
      // Restore the screenshot area
      if (screenshotRef.current) {
        screenshotRef.current.style.display = 'flex';
      }
      
      setCapturedImage(imageDataUrl);
      setActiveTab('analyze');
      
      const modeNames = {
        'current-tab': 'current tab',
        'full-screen': 'full screen',
        'selected-area': 'selected area'
      };
      
      toast({
        title: 'Screenshot captured',
        description: `Captured ${modeNames[captureMode]}. You can now analyze the image.`,
        duration: 3000,
      });
    } catch (error) {
      console.error('Error capturing screenshot:', error);
      toast({
        title: 'Error',
        description: 'Failed to capture screenshot. Please try again.',
        variant: 'destructive',
      });
      
      // Make sure we exit full screen if there was an error
      await exitFullScreen();
      
      // Restore the screenshot area visibility
      if (screenshotRef.current) {
        screenshotRef.current.style.display = 'flex';
      }
    } finally {
      setIsCapturing(false);
    }
  };

  const analyzeImage = async () => {
    if (!capturedImage) {
      toast({
        title: 'No image',
        description: 'Please capture a screenshot first before analyzing.',
        variant: 'destructive',
      });
      return;
    }

    setIsAnalyzing(true);
    setStreamingResponse('');
    
    try {
      // Check if the API is configured properly
      if (apiStatus !== 'configured') {
        // Create a fallback analysis without using the API
        const fallbackAnalysis = `
[Browser Tab Analysis - Fallback Mode]

Without access to the Grok API, I'm providing basic capture functionality.

Your screenshot was successfully captured in ${captureMode === 'current-tab' ? 'the current tab' : captureMode === 'full-screen' ? 'full screen mode' : 'select window mode'}.

You asked: "${query}"

To enable AI analysis of this image, please make sure:
1. The XAI_API_KEY is properly configured
2. The server is running correctly
3. Your network connection is stable

You can still save this screenshot using the download button in the preview.
        `;
        
        const timestamp = new Date().toLocaleTimeString();
        
        // Add to analysis results 
        setAnalysisResults(prev => [
          ...prev,
          {
            text: fallbackAnalysis,
            timestamp,
            type: 'general'
          }
        ]);
        
        // Switch to results tab
        setActiveTab('results');
        
        toast({
          title: 'Fallback Mode',
          description: 'API is not available. Using fallback capture mode without analysis.',
          variant: 'default',
        });
        
        setIsAnalyzing(false);
        return;
      }
      // Convert the base64 image data URL to just the base64 string
      const base64Image = capturedImage.split(',')[1];
      
      // First try to use streaming for a better user experience
      try {
        const response = await fetch('/api/xai/analyze-image-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            base64Image,
            prompt: query
          }),
        });

        if (!response.ok) {
          throw new Error('Stream response not ok');
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No reader available');

        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            break;
          }
          
          // Decode and handle the chunk
          const chunk = new TextDecoder().decode(value);
          const lines = chunk.split('\\n').join('\n').split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') break;
              
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content || '';
                setStreamingResponse(prev => prev + content);
              } catch (e) {
                console.error('Error parsing JSON from stream:', e);
              }
            }
          }
        }

        // Add to analysis results after streaming is complete
        const timestamp = new Date().toLocaleTimeString();
        setAnalysisResults(prev => [
          ...prev,
          {
            text: streamingResponse,
            timestamp,
            type: 'general'
          }
        ]);
        
      } catch (streamError) {
        console.error('Streaming error, falling back to regular request:', streamError);
        
        // Fallback to regular request
        const response = await fetch('/api/xai/analyze-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            base64Image,
            prompt: query
          }),
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to analyze image');
        }
        
        const data = await response.json();
        const analysisText = data.choices[0]?.message?.content || 'No analysis available';
        const timestamp = new Date().toLocaleTimeString();
        
        setAnalysisResults(prev => [
          ...prev,
          {
            text: analysisText,
            timestamp,
            type: 'general'
          }
        ]);
      }
      
      // Scroll to the latest result
      if (analysisContainerRef.current) {
        analysisContainerRef.current.scrollTop = analysisContainerRef.current.scrollHeight;
      }
      
    } catch (error) {
      console.error('Error analyzing image:', error);
      toast({
        title: 'Analysis failed',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const downloadImage = () => {
    if (!capturedImage) return;
    
    const link = document.createElement('a');
    link.href = capturedImage;
    link.download = `screenshot-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="text-center">
          <AnimatedGradientText text="Browser Tab Analyzer" size="2xl" className="font-bold" as="div" />
        </CardTitle>
        <CardDescription className="text-center">
          Analyze browser tabs, charts, and content using Grok's visual AI capabilities
        </CardDescription>
      </CardHeader>

      <CardContent>
        {apiStatus === 'loading' && (
          <Alert className="mb-4 border-blue-500/50 bg-blue-500/10">
            <Info className="h-5 w-5 text-blue-500" />
            <AlertTitle className="text-blue-500">Checking API Status</AlertTitle>
            <AlertDescription className="text-blue-400">
              {statusMessage}
            </AlertDescription>
          </Alert>
        )}
        
        {apiStatus === 'error' && (
          <Alert className="mb-4 border-red-500/50 bg-red-500/10">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <AlertTitle className="text-red-500">API Configuration Error</AlertTitle>
            <AlertDescription className="text-red-400">
              {statusMessage}
            </AlertDescription>
          </Alert>
        )}
        
        {apiStatus === 'configured' && (
          <Alert className="mb-4 border-green-500/50 bg-green-500/10">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <AlertTitle className="text-green-500">API Ready</AlertTitle>
            <AlertDescription className="text-green-400">
              {statusMessage}
            </AlertDescription>
          </Alert>
        )}
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="capture">Capture</TabsTrigger>
            <TabsTrigger value="analyze" disabled={!capturedImage}>Analyze</TabsTrigger>
            <TabsTrigger value="results" disabled={analysisResults.length === 0}>Results</TabsTrigger>
          </TabsList>
          
          <TabsContent value="capture" className="space-y-4">
            <div className="space-y-4">
              <div className="space-y-4 border rounded-md p-4 bg-black/10">
                <h3 className="text-md font-medium text-center">Capture Mode</h3>
                <RadioGroup 
                  value={captureMode} 
                  onValueChange={(value) => setCaptureMode(value as CaptureMode)}
                  className="grid grid-cols-1 md:grid-cols-3 gap-4"
                >
                  <div className="flex items-center space-x-2 border rounded-md p-3 hover:bg-black/5">
                    <RadioGroupItem value="current-tab" id="current-tab" />
                    <Label htmlFor="current-tab" className="flex items-center cursor-pointer">
                      <Eye className="h-4 w-4 mr-2" />
                      Current Tab
                    </Label>
                  </div>
                  
                  <div className="flex items-center space-x-2 border rounded-md p-3 hover:bg-black/5">
                    <RadioGroupItem value="full-screen" id="full-screen" />
                    <Label htmlFor="full-screen" className="flex items-center cursor-pointer">
                      <Layout className="h-4 w-4 mr-2" />
                      Full Screen
                    </Label>
                  </div>
                  
                  <div className="flex items-center space-x-2 border rounded-md p-3 hover:bg-black/5">
                    <RadioGroupItem value="selected-area" id="selected-area" />
                    <Label htmlFor="selected-area" className="flex items-center cursor-pointer">
                      <MonitorSmartphone className="h-4 w-4 mr-2" />
                      Select Any Window
                    </Label>
                  </div>
                </RadioGroup>
                
                <div className="text-center text-sm text-muted-foreground mt-2">
                  <p className="mb-2">
                    {captureMode === 'current-tab' && (
                      "Captures what's currently visible in this browser tab"
                    )}
                    {captureMode === 'full-screen' && (
                      "Captures your entire screen (will request full-screen access)"
                    )}
                    {captureMode === 'selected-area' && (
                      "Prompts you to select any open tab or application window"
                    )}
                  </p>
                </div>
                
                <div className="flex justify-center mt-2">
                  <Button 
                    onClick={captureScreen} 
                    disabled={isCapturing} 
                    className="px-8"
                  >
                    {isCapturing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Capturing...
                      </>
                    ) : (
                      <>
                        <Camera className="mr-2 h-4 w-4" />
                        {captureMode === 'current-tab' && "Capture Current Tab"}
                        {captureMode === 'full-screen' && "Capture Full Screen"}
                        {captureMode === 'selected-area' && "Select Window to Capture"}
                        {apiStatus !== 'configured' && " (Fallback Mode)"}
                      </>
                    )}
                  </Button>
                </div>
              </div>
              
              {/* Capture preview area */}
              <div 
                ref={screenshotRef} 
                className="min-h-[200px] border border-dashed rounded-md p-4 flex flex-col items-center justify-center"
              >
                {!capturedImage ? (
                  <div className="text-center text-muted-foreground">
                    <Camera className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No screenshot captured yet</p>
                    <p className="text-xs mt-2 text-muted-foreground max-w-md">
                      {captureMode === 'selected-area' && 
                        "You'll be prompted to select which window or application to capture using your browser's screen sharing dialog"
                      }
                    </p>
                  </div>
                ) : (
                  <div className="w-full">
                    <div className="relative">
                      <img 
                        src={capturedImage} 
                        alt="Captured screenshot" 
                        className="w-full h-auto rounded-md" 
                      />
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm"
                        onClick={downloadImage}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Save
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              
              {/* This is a hidden area that will be used for selected area capture demonstration */}
              <div 
                ref={selectedAreaRef}
                style={{ display: 'none' }}
              >
                <div className="p-4 border rounded bg-gray-100 dark:bg-gray-800">
                  <h3 className="text-lg font-medium mb-2">Selectable Content Demo</h3>
                  <p>This is a demonstration of content that could be captured separately.</p>
                  <div className="grid grid-cols-3 gap-2 mt-4">
                    <div className="p-2 border rounded bg-blue-100 dark:bg-blue-900">Item 1</div>
                    <div className="p-2 border rounded bg-green-100 dark:bg-green-900">Item 2</div>
                    <div className="p-2 border rounded bg-red-100 dark:bg-red-900">Item 3</div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="analyze" className="space-y-4">
            {capturedImage ? (
              <>
                <div className="space-y-2">
                  <label htmlFor="query" className="text-sm font-medium">What would you like to ask about this screenshot?</label>
                  <Textarea
                    id="query"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Enter your question about the visible content..."
                    className="min-h-[80px]"
                  />
                  <div className="text-sm text-muted-foreground mt-2">
                    <p className="font-medium mb-1">Example prompts:</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <Button 
                        variant="outline" 
                        className="justify-start text-left h-auto py-2 text-xs" 
                        onClick={() => setQuery("Analyze this chart's data and identify key trends, support/resistance levels, and trading patterns. What insights can be drawn for trading decisions?")}
                      >
                        <BarChart3 className="h-3 w-3 mr-1 flex-shrink-0" />
                        <span>Analyze chart patterns</span>
                      </Button>
                      <Button 
                        variant="outline" 
                        className="justify-start text-left h-auto py-2 text-xs" 
                        onClick={() => setQuery("Identify all token metrics and risk indicators in this screenshot. Calculate potential upside and downside based on visible data.")}
                      >
                        <Percent className="h-3 w-3 mr-1 flex-shrink-0" />
                        <span>Token risk assessment</span>
                      </Button>
                      <Button 
                        variant="outline" 
                        className="justify-start text-left h-auto py-2 text-xs" 
                        onClick={() => setQuery("Examine the website/content visible and provide an assessment of the project's legitimacy, technology, and potential.")}
                      >
                        <Search className="h-3 w-3 mr-1 flex-shrink-0" />
                        <span>Project analysis</span>
                      </Button>
                    </div>
                  </div>
                </div>
                
                <div className="flex justify-center mt-4">
                  <Button 
                    onClick={analyzeImage} 
                    disabled={isAnalyzing || !capturedImage || !query.trim()} 
                    className="px-8"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Eye className="mr-2 h-4 w-4" />
                        {apiStatus === 'configured' ? 'Analyze with Grok AI' : 'Save & Analyze (Fallback Mode)'}
                      </>
                    )}
                  </Button>
                </div>
                
                {isAnalyzing && streamingResponse && (
                  <div className="mt-4 border rounded-md p-4 bg-gray-800/30">
                    <p className="text-sm font-medium mb-2">Grok is analyzing the image...</p>
                    <div className="whitespace-pre-wrap">{streamingResponse}</div>
                  </div>
                )}
                
                <div className="border rounded-md p-4 bg-black/10 mt-4">
                  <img 
                    src={capturedImage} 
                    alt="Captured screenshot" 
                    className="w-full h-auto rounded-md" 
                  />
                </div>
              </>
            ) : (
              <div className="text-center p-12 border rounded-md">
                <Camera className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-medium mb-2">No Screenshot Available</h3>
                <p className="text-muted-foreground mb-4">
                  Please capture a screenshot first before analyzing.
                </p>
                <Button onClick={() => setActiveTab('capture')}>
                  Go to Capture
                </Button>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="results" className="space-y-4">
            <div className="border rounded-md p-4 bg-black/10 min-h-[400px]">
              <div
                ref={analysisContainerRef}
                className="h-[400px] overflow-y-auto"
              >
                {analysisResults.length === 0 ? (
                  <div className="text-center p-12">
                    <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <h3 className="text-lg font-medium mb-2">No Analysis Results Yet</h3>
                    <p className="text-muted-foreground">
                      Capture a screenshot and analyze it to see results here.
                    </p>
                  </div>
                ) : (
                  analysisResults.map((result, index) => (
                    <div key={index} className="mb-6 last:mb-0">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs text-muted-foreground">
                          {result.timestamp} • {result.type.charAt(0).toUpperCase() + result.type.slice(1)} Analysis
                        </span>
                      </div>
                      <div className="bg-gray-800/30 rounded-md p-4">
                        <div className="whitespace-pre-wrap">{result.text}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter className="flex justify-center text-sm text-muted-foreground">
        {apiStatus === 'configured' ?
          "Powered by Grok's vision capabilities for real-time browser content analysis" :
          "Browser Tab Analyzer - Operating in fallback mode (screenshot capture only)"
        }
      </CardFooter>
    </Card>
  );
}