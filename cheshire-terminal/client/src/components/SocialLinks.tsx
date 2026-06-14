import React from 'react';
import {
  FaTelegram,
  FaGithub,
  FaGlobe,
} from 'react-icons/fa';
import { FaXTwitter } from 'react-icons/fa6';
import { Terminal, Users } from 'lucide-react';

export function SocialLinks() {
  const socialLinks = [
    {
      icon: <FaGlobe className="h-5 w-5" />,
      label: 'SolanaClawd.com',
      href: 'https://SolanaClawd.com',
      bgColor: 'bg-pink-600 hover:bg-pink-700',
    },
    {
      icon: <FaGlobe className="h-5 w-5" />,
      label: 'X402.wtf',
      href: 'https://X402.wtf',
      bgColor: 'bg-cyan-700 hover:bg-cyan-600',
    },
    {
      icon: <Users className="h-5 w-5" />,
      label: 'Buddies',
      href: 'https://buddies.solanaclawd.com',
      bgColor: 'bg-fuchsia-600 hover:bg-fuchsia-700',
    },
    {
      icon: <FaTelegram className="h-5 w-5" />,
      label: 't.me/clawdtoken',
      href: 'https://t.me/clawdtoken',
      bgColor: 'bg-blue-500 hover:bg-blue-600',
    },
    {
      icon: <FaGithub className="h-5 w-5" />,
      label: 'solana-clawd',
      href: 'https://github.com/solizardking/solana-clawd',
      bgColor: 'bg-zinc-800 hover:bg-zinc-700',
    },
    {
      icon: <FaXTwitter className="h-5 w-5" />,
      label: 'x.com/clawddevs',
      href: 'https://x.com/clawddevs',
      bgColor: 'bg-sky-700 hover:bg-sky-600',
    },
    {
      icon: <FaXTwitter className="h-5 w-5" />,
      label: 'x.com/0rdlibrary',
      href: 'https://x.com/0rdlibrary',
      bgColor: 'bg-blue-900 hover:bg-blue-800',
    },
    {
      icon: <Terminal className="h-5 w-5" />,
      label: 'Terminal',
      href: '/terminal',
      bgColor: 'bg-purple-600 hover:bg-purple-700',
    },
  ];

  return (
    <div className="border-t border-purple-500/20 mt-8 pt-6">
      <div className="flex flex-wrap justify-center gap-3 mb-3">
        {socialLinks.map((link) => (
          <a
            key={link.href}
            href={link.href}
            target={link.href.startsWith('http') ? '_blank' : '_self'}
            rel="noopener noreferrer"
            className={`${link.bgColor} text-white px-4 py-2 rounded-md flex items-center gap-2 transition-all text-sm`}
            data-testid={`social-${link.label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
          >
            {link.icon}
            <span>{link.label}</span>
          </a>
        ))}
      </div>
      <div className="text-center text-xs text-purple-400/50 mt-3">
        <span className="font-mono">CLAWD: 8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump</span>
      </div>
    </div>
  );
}
