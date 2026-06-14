import React from 'react';

type TextSize = 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl';

interface AnimatedGradientTextProps {
  children?: React.ReactNode;
  text?: string;
  size?: TextSize;
  className?: string;
  as?: keyof JSX.IntrinsicElements;
}

const AnimatedGradientText: React.FC<AnimatedGradientTextProps> = ({
  children,
  text,
  size = 'xl',
  className = '',
  as: Component = 'span',
}) => {
  const sizeClasses = {
    xs: 'text-xs',
    sm: 'text-sm',
    base: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl',
    '2xl': 'text-2xl',
    '3xl': 'text-3xl',
    '4xl': 'text-4xl',
    '5xl': 'text-5xl',
    '6xl': 'text-6xl',
  };

  const sizeClass = sizeClasses[size] || 'text-xl';
  const content = text || children;

  return (
    <Component
      className={`${sizeClass} font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 via-purple-500 to-blue-500 animate-gradient-x ${className}`}
    >
      {content}
    </Component>
  );
};

export default AnimatedGradientText;