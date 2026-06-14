import React from 'react';
import BrowserTabAnalyzer from '@/components/BrowserTabAnalyzer';
import AnimatedGradientText from '@/components/AnimatedGradientText';

const BrowserTabAnalyzerPage: React.FC = () => {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 text-center">
        <AnimatedGradientText 
          text="Browser Tab Analyzer" 
          size="4xl" 
          className="font-bold" 
          as="h1" 
        />
        <p className="text-muted-foreground mt-2">
          Analyze browser tabs and visual content using Grok's vision capabilities
        </p>
      </div>
      
      <BrowserTabAnalyzer />
    </div>
  );
};

export default BrowserTabAnalyzerPage;